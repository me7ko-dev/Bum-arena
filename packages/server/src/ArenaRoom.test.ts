/**
 * Истински сървър в същия процес + истински клиенти (@colyseus/sdk) през WebSocket.
 * Времената са съкратени (лоби 0.3 сек, отброяване 0.3 сек), за да е бърз тестът.
 */
import { Client, type Room as SdkRoom } from '@colyseus/sdk';
import {
  MSG,
  PROTOCOL_VERSION,
  ROOM_NAME,
  ROOM_SIZE,
  type InputMessage,
  type JoinOptions,
  type Snapshot,
} from '@bum/shared';
import { matchMaker } from 'colyseus';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArenaRoom, ServerRoster } from './ArenaRoom';
import { startGameServer, type GameServer } from './server';

/** Слуша съобщенията на една връзка. Обработчиците се закачат веднага след влизане. */
class Probe {
  readonly rosters: ServerRoster[] = [];
  readonly snaps: Snapshot[] = [];
  constructor(readonly room: SdkRoom) {
    room.onMessage(MSG.roster, (r: ServerRoster) => this.rosters.push(r));
    room.onMessage(MSG.snapshot, (s: Snapshot) => this.snaps.push(s));
  }
  get roster(): ServerRoster | undefined {
    return this.rosters[this.rosters.length - 1];
  }
  get snap(): Snapshot | undefined {
    return this.snaps[this.snaps.length - 1];
  }
  /** Позицията на моето човече в последната снимка. */
  myPos(): { x: number; y: number } {
    const you = this.roster!.you;
    const row = this.snap!.players.find((p) => p[0] === you)!;
    return { x: row[1]!, y: row[2]! };
  }
  send(input: InputMessage): void {
    this.room.send(MSG.input, input);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Чака условието (проверява на 20 ms) или гърми след timeoutMs. */
async function until(cond: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await sleep(20);
  }
}

const opts = (name: string, extra: Partial<JoinOptions> = {}): JoinOptions => ({
  v: PROTOCOL_VERSION,
  name,
  skin: 'skin_fox',
  ability: 'dash',
  ...extra,
});

const inRound = (p: Probe) => !!p.roster && !p.roster.lobby && p.roster.you > 0;
const playing = (p: Probe) => inRound(p) && p.snap?.round.phase === 'playing';

describe('ArenaRoom', () => {
  let game: GameServer;
  let client: Client;
  const opened: SdkRoom[] = [];

  async function join(kind: 'joinOrCreate' | 'create', o: JoinOptions): Promise<Probe> {
    const room = await client[kind](ROOM_NAME, o);
    opened.push(room);
    return new Probe(room);
  }

  async function joinById(roomId: string, o: JoinOptions): Promise<Probe> {
    const room = await client.joinById(roomId, o);
    opened.push(room);
    return new Probe(room);
  }

  beforeAll(async () => {
    const port = 2700 + Math.floor(Math.random() * 90);
    game = await startGameServer({
      port,
      handleSignals: false,
      timings: { lobbyMs: 300, resultsMs: 300, countdownSec: 0.3, roundSec: 600 },
    });
    client = new Client(`ws://localhost:${port}`);
  });

  afterAll(async () => {
    // leave() на вече излязла стая никога не завършва – затова само отворените.
    await Promise.all(opened.filter((r) => r.connection.isOpen).map((r) => r.leave()));
    await game.stop();
  });

  it('двама играчи в една стая: roster, снимки, входът мести човечето, излезлият става бот', async () => {
    const a = await join('joinOrCreate', opts('Ана', { private: false }));
    const b = await join('joinOrCreate', opts('Боби\u0000 с много дълго име'));
    expect(b.room.roomId).toBe(a.room.roomId);

    // Лоби: само хората, после рунд с ботове до ROOM_SIZE.
    await until(() => inRound(a) && inRound(b), 'roster на рунда');
    const roster = a.roster!;
    expect(roster.round).toBe(1);
    expect(roster.private).toBe(false);
    expect(roster.players).toHaveLength(ROOM_SIZE);
    expect(roster.players.filter((p) => !p.isBot)).toHaveLength(2);
    expect(a.roster!.you).not.toBe(b.roster!.you);
    // Името е изчистено и отрязано до 14 знака.
    const bName = roster.players.find((p) => p.id === b.roster!.you)!.name;
    expect(bName).toBe('Боби с много д');

    await until(() => playing(a) && playing(b), 'фаза „игра“');
    expect(a.snap!.players).toHaveLength(ROOM_SIZE);

    // А тръгва към центъра; Б стои.
    const start = a.myPos();
    const len = Math.hypot(start.x, start.y);
    const dir = { mx: -start.x / len, my: -start.y / len };
    for (let i = 0; i < 15; i++) {
      a.send({ ...dir, a: 0 });
      await sleep(30);
    }
    const end = a.myPos();
    expect(Math.hypot(end.x, end.y)).toBeLessThan(len - 60);

    // Б излиза по средата на рунда → неговото човече продължава като бот.
    const bId = b.roster!.you;
    await b.room.leave();
    const room = matchMaker.getLocalRoomById(a.room.roomId) as ArenaRoom;
    await until(
      () => (room as unknown as { bots: Map<number, unknown> }).bots.has(bId),
      'бот на мястото на Б',
    );
    const before = a.snaps.length;
    await until(() => a.snaps.length > before + 3, 'още снимки');
    expect(a.snap!.players.some((p) => p[0] === bId)).toBe(true);
  });

  it('влязъл по средата на рунда гледа (you = -1)', async () => {
    const host = await join('create', opts('Домакин'));
    await until(() => playing(host), 'фаза „игра“');
    const late = await joinById(host.room.roomId, opts('Закъснял'));
    await until(() => !!late.roster && late.snaps.length > 0, 'roster и снимки за гледащия');
    expect(late.roster!.you).toBe(-1);
    expect(late.roster!.lobby).toBe(false);
  });

  it('частна стая не се дава от бързата игра, но се влиза по код', async () => {
    const owner = await join('create', opts('Собственик', { private: true }));
    await until(() => !!owner.roster, 'roster на собственика');
    expect(owner.roster!.private).toBe(true);

    const stranger = await join('joinOrCreate', opts('Случаен'));
    expect(stranger.room.roomId).not.toBe(owner.room.roomId);

    const friend = await joinById(owner.room.roomId, opts('Приятел'));
    await until(() => !!friend.roster, 'roster на приятеля');
    expect(friend.roster!.roomId).toBe(owner.room.roomId);
  });

  it('отказва клиент с друга версия на протокола', async () => {
    await expect(
      client.joinOrCreate(ROOM_NAME, { ...opts('Стар'), v: PROTOCOL_VERSION + 99 }),
    ).rejects.toThrow(/protocol/);
  });

  it('невалиден скин/суперсила → стойности по подразбиране', async () => {
    const p = await join('create', {
      ...opts('Хакер'),
      skin: 'skin_hacked',
      ability: 'nuke' as never,
    });
    await until(() => !!p.roster, 'roster');
    const me = p.roster!.players.find((pl) => pl.id === p.roster!.you)!;
    expect(me.skin).toBe('skin_fox');
    expect(me.ability).toBe('dash');
  });
});
