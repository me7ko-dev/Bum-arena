/**
 * Мрежов протокол между клиента и сървъра (етап 3).
 *
 * Сървърът е авторитетен: само той върти World. Клиентите пращат вход ('i'),
 * сървърът праща на всеки тик компактна „снимка“ на света ('s') и при всеки нов
 * рунд – списъка с играчите ('r'). Клиентът прилага снимките върху свой World-огледало
 * (applySnapshot) и го рисува със същия код като офлайн играта.
 */
import type { AbilityId, Arena, Car, RoundState, ShopItemId } from '../sim/types';
import type { GameEvent } from '../sim/events';
import type { World } from '../sim/world';

/** Сменя се при несъвместими промени в протокола. */
export const PROTOCOL_VERSION = 1;
/** Името на стаята в Colyseus. */
export const ROOM_NAME = 'arena';
/** Порт на сървъра по подразбиране. */
export const DEFAULT_PORT = 2567;
/** Максимум играчи в стая (хора + ботове). */
export const ROOM_SIZE = 12;

export const MSG = {
  /** Клиент → сървър: вход за следващия тик. */
  input: 'i',
  /** Сървър → клиент: играчите в текущия рунд. */
  roster: 'r',
  /** Сървър → клиент: снимка на света. */
  snapshot: 's',
} as const;

/** Опции при влизане в стая (client.joinOrCreate / create / joinById). */
export interface JoinOptions {
  /** Версия на протокола – сървърът отказва несъвместим клиент. */
  v: number;
  name: string;
  skin: string;
  ability: AbilityId;
  /** Само при създаване: частна стая за игра с приятели (не се показва в бързата игра). */
  private?: boolean;
}

/** Клиент → сървър. */
export interface InputMessage {
  mx: number;
  my: number;
  /** Задържан ли е бутонът за суперсила (1/0). */
  a: 0 | 1;
  /** Покупка от магазина (по желание). */
  b?: ShopItemId;
}

export interface RosterEntry {
  id: number;
  name: string;
  skin: string;
  ability: AbilityId;
  isBot: boolean;
  colorIndex: number;
}

/** Сървър → клиент: нов рунд (или влизане по време на рунд). */
export interface RosterMessage {
  /** Пореден номер на рунда в стаята. */
  round: number;
  /** Играчите в реда на id (1, 2, 3 …). */
  players: RosterEntry[];
  /** id на твоя играч в този рунд; -1 = само гледаш (влязъл си по средата). */
  you: number;
  roomId: string;
  private: boolean;
}

/**
 * Играч в снимката – масив вместо обект (по-малко байтове на всеки тик).
 * Редът на полетата е в PLAYER_FIELDS.
 */
export type PlayerSnap = number[];

const PLAYER_FIELDS = [
  'id',
  'x',
  'y',
  'vx',
  'vy',
  'facing',
  'radius',
  'stun',
  'frozen',
  'abilityCooldown',
  'abilityTime',
  'coins',
  'knockouts',
  'carHp',
  'carKind',
  'fallTime',
  'buffSize',
  'buffSpeed',
  'buffShield',
  'buffMega',
  'lastHitBy',
  'lastHitTick',
  'eliminatedTick',
  'maxSpeed',
  'flags',
] as const;

const F_ALIVE = 1;
const F_CAR = 2;
const F_IMMUNE = 4;

/** Монета: [id, x, y, value, pickupDelay>0 ? 1 : 0]. */
export type CoinSnap = [number, number, number, number, number];

export interface Snapshot {
  /** Тик на сървъра. */
  t: number;
  round: Pick<RoundState, 'phase' | 'phaseTicks' | 'phaseTime' | 'timeLeft' | 'winnerId' | 'endReason'>;
  arena: Arena;
  crown: number;
  players: PlayerSnap[];
  coins: CoinSnap[];
  cars: Car[];
  /** Събитията от този тик (удари, падания …) – клиентът пуска ефектите. */
  events: GameEvent[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Сървър: прави снимка на света след step(). */
export function encodeSnapshot(world: World): Snapshot {
  const players = world.players.map((p) => {
    const flags = (p.alive ? F_ALIVE : 0) | (p.inCar ? F_CAR : 0) | (p.immune ? F_IMMUNE : 0);
    return [
      p.id,
      r1(p.x),
      r1(p.y),
      r1(p.vx),
      r1(p.vy),
      r3(p.facing),
      r1(p.radius),
      r3(p.stun),
      r3(p.frozen),
      r3(p.abilityCooldown),
      r3(p.abilityTime),
      p.coins,
      p.knockouts,
      r1(p.carHp),
      p.carKind,
      r3(p.fallTime),
      r3(p.buffSize),
      r3(p.buffSpeed),
      r3(p.buffShield),
      r3(p.buffMega),
      p.lastHitBy,
      p.lastHitTick,
      p.eliminatedTick,
      r1(p.maxSpeed),
      flags,
    ];
  });
  const coins: CoinSnap[] = world.coins.map((c) => [c.id, r1(c.x), r1(c.y), c.value, c.pickupDelay > 0 ? 1 : 0]);
  const r = world.round;
  return {
    t: world.tick,
    round: {
      phase: r.phase,
      phaseTicks: r.phaseTicks,
      phaseTime: r.phaseTime,
      timeLeft: r3(r.timeLeft),
      winnerId: r.winnerId,
      endReason: r.endReason,
    },
    arena: { ...world.arena, radius: r1(world.arena.radius), nextRadius: r1(world.arena.nextRadius) },
    crown: world.crownId,
    players,
    coins,
    cars: world.cars.map((c) => ({ ...c, x: r1(c.x), y: r1(c.y) })),
    events: [...world.events],
  };
}

/**
 * Клиент: прилага снимката върху World-огледалото.
 * Играчите трябва вече да са създадени по roster-а (същите id).
 * prevX/prevY НЕ се пипат – за интерполацията отговаря NetGame.
 */
export function applySnapshot(world: World, s: Snapshot): void {
  world.tick = s.t;
  Object.assign(world.round, s.round);
  Object.assign(world.arena, s.arena);
  world.crownId = s.crown;

  for (const row of s.players) {
    const p = world.getPlayer(row[0]!);
    if (!p) continue;
    const rec = p as unknown as Record<string, number | boolean>;
    for (let i = 1; i < PLAYER_FIELDS.length - 1; i++) rec[PLAYER_FIELDS[i]!] = row[i]!;
    const flags = row[PLAYER_FIELDS.length - 1]!;
    p.alive = (flags & F_ALIVE) !== 0;
    p.inCar = (flags & F_CAR) !== 0;
    p.immune = (flags & F_IMMUNE) !== 0;
  }

  // Монетите: подменяме списъка (prevX = старата позиция, ако монетата я е имало).
  const coins = world.coinSystem.coins;
  const old = new Map(coins.map((c) => [c.id, c]));
  coins.length = 0;
  for (const [id, x, y, value, delay] of s.coins) {
    const prev = old.get(id);
    coins.push({ id, x, y, prevX: prev ? prev.x : x, prevY: prev ? prev.y : y, vx: 0, vy: 0, value, pickupDelay: delay ? 0.1 : 0 });
  }

  const cars = world.carSystem.cars;
  cars.length = 0;
  for (const c of s.cars) cars.push({ ...c });

  world.events.length = 0;
  world.events.push(...s.events);
}
