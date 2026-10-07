import { describe, expect, it } from 'vitest';
import { MSG, type GameEvent, type InputMessage, type PlayerInput, type RosterMessage, type Snapshot } from '@bum/shared';
import type { InputSource } from '../game/Match';
import { MatchMakeError } from '@colyseus/sdk';
import { NetError, NetGame, netErrorKey, type NetRoom } from './NetGame';
import { makeServer, simulateNetwork } from './testUtils';

/** Стая без сървър: тестът сам „праща“ съобщенията. */
class FakeRoom implements NetRoom {
  readonly roomId = 'ROOM1';
  sent: InputMessage[] = [];
  left = false;
  private handlers = new Map<string, (p: unknown) => void>();
  private leaveCb: ((code: number) => void) | null = null;
  send(type: string, payload: InputMessage): void {
    expect(type).toBe(MSG.input);
    this.sent.push(payload);
  }
  onMessage(type: string, cb: (p: unknown) => void): void {
    this.handlers.set(type, cb);
  }
  onLeave(cb: (code: number) => void): void {
    this.leaveCb = cb;
  }
  ping(cb: (ms: number) => void): void {
    cb(42);
  }
  leave(): void {
    this.left = true;
    this.leaveCb?.(4000);
  }
  roster(r: RosterMessage): void {
    this.handlers.get(MSG.roster)!(r);
  }
  snapshot(s: Snapshot): void {
    this.handlers.get(MSG.snapshot)!(s);
  }
  drop(): void {
    this.leaveCb?.(1006);
  }
}

class StillInput implements InputSource {
  latch = false;
  read(): PlayerInput {
    return { mx: 0.5, my: 0, ability: this.latch };
  }
  consumeAbility(): void {
    this.latch = false;
  }
}

const settings = { name: 'Аз', skin: 'skin_cat', ability: 'dash' as const };

function setup() {
  let clock = 0;
  const room = new FakeRoom();
  const game = new NetGame(room, { settings, now: () => clock });
  return { room, game, setClock: (t: number) => (clock = t) };
}

describe('NetGame', () => {
  it('преди roster-а: лоби само с теб', () => {
    const { game } = setup();
    expect(game.online).toBe(true);
    expect(game.waiting).toBe(true);
    expect(game.world.players.length).toBe(1);
    expect(game.human.name).toBe('Аз');
    expect(game.roomId).toBe('ROOM1');
  });

  it('roster → огледало със същите id; снимки → интерполация, събития точно веднъж, пинг', () => {
    const { room, game, setClock } = setup();
    const server = makeServer(8);
    room.roster(server.roster(1));
    expect(game.roundId).toBe(1);
    expect(game.world.players.map((p) => p.id)).toEqual(server.world.players.map((p) => p.id));
    expect(game.humanId).toBe(1);

    const arrivals = simulateNetwork(server, 30 * 15, { jitter: 0.05 });
    const input = new StillInput();
    const got: GameEvent[] = [];
    let next = 0;
    const end = arrivals[arrivals.length - 1]!.at + 1;
    for (let now = 0; now < end; now += 1 / 60) {
      setClock(now);
      while (next < arrivals.length && arrivals[next]!.at <= now) room.snapshot(arrivals[next++]!.snap);
      game.update(1 / 60, input);
      expect(game.alpha).toBeGreaterThanOrEqual(0);
      expect(game.alpha).toBeLessThanOrEqual(1);
      got.push(...game.drainEvents());
      // Другите са между две снимки: prev → x е една стъпка на сървъра (не скача през половин арена).
      for (const p of game.world.players) {
        if (p.id === game.humanId || !p.alive) continue;
        expect(Math.hypot(p.x - p.prevX, p.y - p.prevY)).toBeLessThan(200);
      }
    }
    expect(game.waiting).toBe(false);
    expect(got).toEqual(arrivals.flatMap((a) => a.snap.events));
    expect(game.ping).toBe(42);
    // Входът е пратен, но не по-често от ~30/сек.
    expect(room.sent.length).toBeGreaterThan(0);
    expect(room.sent.length).toBeLessThanOrEqual(Math.ceil(end * 31));
    // В края: светът съвпада с последната снимка на сървъра.
    for (const sp of server.world.players) {
      const cp = game.world.getPlayer(sp.id)!;
      expect(cp.alive).toBe(sp.alive);
      expect(cp.knockouts).toBe(sp.knockouts);
      if (sp.id !== 1) expect(cp.x).toBeCloseTo(sp.x, 0);
    }
  });

  it('собственото човече е от последната снимка (без закъснението), другите – назад', () => {
    const { room, game, setClock } = setup();
    const server = makeServer(4);
    room.roster(server.roster(1));
    const input = new StillInput();
    let now = 0;
    let lastSnap: Snapshot | null = null;
    for (let i = 0; i < 90; i++) {
      // Човекът върви надясно на сървъра.
      lastSnap = server.step({ mx: 1, my: 0, ability: false });
      now = (i + 1) / 30 + 0.03;
      setClock(now);
      room.snapshot(lastSnap);
      game.update(1 / 30, input);
    }
    const me = game.human;
    const serverMe = server.world.getPlayer(1)!;
    // Близо до сървъра сега (± малко екстраполация), а не 100 ms назад.
    expect(Math.abs(me.x - serverMe.x)).toBeLessThan(serverMe.maxSpeed * 0.06);
    expect(me.prevX).toBe(me.x);
  });

  it('влязъл по средата → гледа: human е „празен“ паднал играч с id -1, вход не се праща', () => {
    const { room, game, setClock } = setup();
    const server = makeServer(6);
    room.roster(server.roster(-1));
    expect(game.isSpectator).toBe(true);
    expect(game.human.id).toBe(-1);
    expect(game.human.alive).toBe(false);
    const input = new StillInput();
    for (let i = 0; i < 30; i++) {
      setClock(i / 30);
      room.snapshot(server.step());
      input.latch = true;
      game.update(1 / 30, input);
      expect(input.latch).toBe(false); // натискането се „изразходва“, не чака следващия рунд
    }
    expect(room.sent.length).toBe(0);
  });

  it('нов roster = нов рунд (roundId расте), край на рунда → брояч до следващия', () => {
    const { room, game, setClock } = setup();
    const server = makeServer(3);
    room.roster(server.roster(2));
    const snap = server.step();
    snap.round = { ...snap.round, phase: 'ended', phaseTicks: 30, phaseTime: 1, winnerId: 2, endReason: 'lastStanding' };
    setClock(1);
    room.snapshot(snap);
    game.update(1 / 60, new StillInput());
    expect(game.nextRoundIn).toBe(5);
    room.roster({ ...server.roster(2), round: 2 });
    expect(game.roundId).toBe(2);
    expect(game.waiting).toBe(true);
    expect(game.nextRoundIn).toBeNull();
  });

  it('лоби: чака (без вход), брои до старта; всеки нов roster в лобито е нов свят', () => {
    const { room, game, setClock } = setup();
    const server = makeServer(2);
    room.roster({ ...server.roster(1), round: 0, lobby: true });
    const snap = server.step();
    snap.round = { ...snap.round, phase: 'countdown', timeLeft: 6.4 };
    setClock(0.5);
    room.snapshot(snap);
    const input = new StillInput();
    game.update(1 / 60, input);
    expect(game.waiting).toBe(true);
    expect(game.startsIn).toBe(7);
    expect(room.sent.length).toBe(0);
    // Влиза трети човек → нов roster, нов свят.
    const server3 = makeServer(3);
    room.roster({ ...server3.roster(2), round: 0, lobby: true });
    expect(game.roundId).toBe(2);
    expect(game.world.players.length).toBe(3);
    expect(game.humanId).toBe(2);
    // Първият рунд: вече не чака след първата снимка.
    room.roster({ ...server3.roster(2), round: 1 });
    setClock(1);
    room.snapshot(server3.step());
    game.update(1 / 60, input);
    expect(game.waiting).toBe(false);
    expect(game.startsIn).toBeNull();
  });

  it('грешен roster (id не съвпадат) или прекъсване → disconnected', () => {
    const a = setup();
    const server = makeServer(3);
    const bad = server.roster(1);
    bad.players[1] = { ...bad.players[1]!, id: 7 };
    a.room.roster(bad);
    expect(a.game.disconnected).toBe('net.error.protocol');

    const b = setup();
    b.room.roster(server.roster(1));
    b.room.drop();
    expect(b.game.disconnected).toBe('net.error.disconnected');

    // Нарочно излизане не е грешка.
    const c = setup();
    c.game.dispose();
    expect(c.room.left).toBe(true);
    expect(c.game.disconnected).toBeNull();
  });
});

describe('netErrorKey', () => {
  it('няма сървър → unreachable; няма стая → roomNotFound; друга версия → rejected', () => {
    expect(netErrorKey(new MatchMakeError('Failed to fetch', undefined as unknown as number))).toBe('net.error.unreachable');
    expect(netErrorKey(new TypeError('Failed to fetch'))).toBe('net.error.unreachable');
    expect(netErrorKey(new MatchMakeError('room "abc" not found', 522))).toBe('net.error.roomNotFound');
    expect(netErrorKey(new MatchMakeError('room is locked', 521))).toBe('net.error.roomNotFound');
    expect(netErrorKey(new MatchMakeError('wrong protocol version', 526))).toBe('net.error.rejected');
    expect(netErrorKey(new NetError('net.error.timeout'))).toBe('net.error.timeout');
  });
});
