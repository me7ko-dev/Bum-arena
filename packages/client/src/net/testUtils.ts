/**
 * Помощници за тестовете на мрежовия код: „сървър“ с ботове, който прави снимки,
 * и мрежа с трептене (снимките пристигат по ред, но неравномерно).
 */
import {
  ABILITY_IDS,
  BotBrain,
  Rng,
  World,
  cloneBalance,
  encodeSnapshot,
  pickDifficulty,
  type Balance,
  type PlayerInput,
  type RosterMessage,
  type Snapshot,
} from '@bum/shared';

export interface FakeServer {
  cfg: Balance;
  world: World;
  /** Стъпка + снимка (минала през JSON, както по мрежата). */
  step(humanInput?: PlayerInput): Snapshot;
  roster(you: number): RosterMessage;
}

export function makeServer(players = 8, seed = 7): FakeServer {
  const cfg = cloneBalance();
  const world = new World({ cfg, seed });
  const brains: BotBrain[] = [];
  for (let i = 0; i < players; i++) {
    const p = world.addPlayer({ name: `P${i}`, isBot: i > 0, skin: 'skin_fox', ability: ABILITY_IDS[i % ABILITY_IDS.length] });
    if (i > 0) brains.push(new BotBrain(p.id, pickDifficulty(cfg, world.rng), seed + i));
  }
  return {
    cfg,
    world,
    step(humanInput) {
      const inputs = new Map<number, PlayerInput>();
      if (humanInput) inputs.set(1, humanInput);
      for (const b of brains) inputs.set(b.playerId, b.think(world));
      world.step(inputs);
      return JSON.parse(JSON.stringify(encodeSnapshot(world))) as Snapshot;
    },
    roster(you) {
      return {
        round: 1,
        you,
        roomId: 'ROOM1',
        private: false,
        players: world.players.map((p) => ({
          id: p.id,
          name: p.name,
          skin: p.skin,
          ability: p.ability,
          isBot: p.isBot,
          colorIndex: p.colorIndex,
        })),
      };
    },
  };
}

export interface Arrival {
  snap: Snapshot;
  /** Местно време на пристигане (сек). */
  at: number;
}

/**
 * Пускат се `ticks` снимки през мрежа с основно закъснение, трептене и от време на време
 * „задръстване“ (няколко снимки идват наведнъж). Редът се пази (TCP).
 */
export function simulateNetwork(
  server: FakeServer,
  ticks: number,
  opts: { latency?: number; jitter?: number; burstEvery?: number; burstDelay?: number; seed?: number } = {},
): Arrival[] {
  const rng = new Rng(opts.seed ?? 3);
  const latency = opts.latency ?? 0.05;
  const jitter = opts.jitter ?? 0.04;
  const out: Arrival[] = [];
  let prev = 0;
  const dt = 1 / server.cfg.sim.tickRate;
  for (let i = 0; i < ticks; i++) {
    const snap = server.step();
    let at = (i + 1) * dt + latency + rng.next() * jitter;
    if (opts.burstEvery && i % opts.burstEvery === 0) at += opts.burstDelay ?? 0.3;
    at = Math.max(prev, at);
    prev = at;
    out.push({ snap, at });
  }
  return out;
}

/** Ключ на събитие за сравнение (тик + съдържание). */
export const eventKey = (tick: number, e: unknown): string => `${tick}:${JSON.stringify(e)}`;
