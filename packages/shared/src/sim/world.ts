import { BALANCE, type Balance } from '../config/balance';
import { NO_INPUT, sanitizeInput, type PlayerInput } from '../input';
import { Rng } from '../math/rng';
import { resolvePlayerCollisions } from './collisions';
import type { GameEvent } from './events';
import { applyMovement } from './movement';
import type { Arena, Player } from './types';

export interface WorldOptions {
  seed?: number;
  /** Конфиг за баланса. Подава се по референция – промени в него (панела) важат веднага. */
  cfg?: Balance;
}

export interface AddPlayerOptions {
  name: string;
  isBot?: boolean;
  colorIndex?: number;
}

/**
 * Светът на един рунд. Чиста логика без рисуване.
 *
 * Използване:
 *   const world = new World({ seed: 1 });
 *   const me = world.addPlayer({ name: 'Аз' });
 *   world.step(new Map([[me.id, input]]));   // викай tickRate пъти в секунда
 */
export class World {
  readonly cfg: Balance;
  readonly rng: Rng;
  readonly arena: Arena;
  readonly players: Player[] = [];
  /** Събитията от последния step(). Изчистват се в началото на всеки тик. */
  readonly events: GameEvent[] = [];

  /** Номер на текущия тик (расте с 1 на всеки step). */
  tick = 0;
  private nextId = 1;

  constructor(opts: WorldOptions = {}) {
    this.cfg = opts.cfg ?? BALANCE;
    this.rng = new Rng(opts.seed ?? 1);
    this.arena = { x: 0, y: 0, radius: this.cfg.arena.startRadius };
  }

  /** Продължителност на един тик в секунди. */
  get dt(): number {
    return 1 / this.cfg.sim.tickRate;
  }

  /** Изминало време от началото на света, в секунди. */
  get time(): number {
    return this.tick * this.dt;
  }

  addPlayer(opts: AddPlayerOptions): Player {
    const pc = this.cfg.player;
    const index = this.players.length;
    // Разпределяме играчите в кръг около центъра.
    const angle = index * 2.399963; // „златен ъгъл“ – равномерно без подреждане
    const r = this.arena.radius * 0.55 * Math.sqrt((index + 1) / 12);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const p: Player = {
      id: this.nextId++,
      name: opts.name,
      isBot: opts.isBot ?? false,
      colorIndex: opts.colorIndex ?? index,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: 0,
      vy: 0,
      facing: Math.atan2(-y, -x), // гледа към центъра
      radius: pc.radius,
      mass: pc.mass,
      alive: true,
      eliminatedTick: -1,
      fallTime: 0,
      stun: 0,
      lastHitBy: -1,
      lastHitTick: -1,
      knockouts: 0,
    };
    this.players.push(p);
    return p;
  }

  getPlayer(id: number): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Играчите, които още са в арената. */
  alivePlayers(): Player[] {
    return this.players.filter((p) => p.alive);
  }

  /** Придвижва света с един тик. inputs: id на играч → вход. Липсващ вход = стои на място. */
  step(inputs: ReadonlyMap<number, PlayerInput>): void {
    const substeps = Math.max(1, Math.round(this.cfg.sim.substeps));
    const dt = this.dt / substeps;

    this.events.length = 0;
    for (const p of this.players) {
      p.prevX = p.x;
      p.prevY = p.y;
    }

    for (let s = 0; s < substeps; s++) {
      for (const p of this.players) {
        const input = sanitizeInput(inputs.get(p.id) ?? NO_INPUT);
        const canControl = p.alive && p.stun <= 0;
        applyMovement(p, input, canControl, this.cfg, dt);
      }
      resolvePlayerCollisions(this);
      this.checkFalls();
    }

    this.updateTimers(this.dt);
    this.tick++;
  }

  /** Таймери на играчите (замайване, анимация на падане). */
  private updateTimers(dt: number): void {
    for (const p of this.players) {
      if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
      if (!p.alive) p.fallTime += dt;
    }
  }

  /** Който е с център извън арената – пада и е елиминиран. */
  private checkFalls(): void {
    const a = this.arena;
    for (const p of this.players) {
      if (!p.alive) continue;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      if (dx * dx + dy * dy <= a.radius * a.radius) continue;
      this.eliminate(p);
    }
  }

  private eliminate(p: Player): void {
    p.alive = false;
    p.eliminatedTick = this.tick;
    p.fallTime = 0;
    p.stun = 0;

    // Кредит за избутване: ако някой го е ударил наскоро.
    let byId: number | null = null;
    const recent = (this.tick - p.lastHitTick) * this.dt <= this.cfg.hit.creditWindow;
    if (p.lastHitBy >= 0 && p.lastHitBy !== p.id && recent) {
      const by = this.getPlayer(p.lastHitBy);
      if (by) {
        by.knockouts++;
        byId = by.id;
      }
    }
    this.events.push({ type: 'fall', playerId: p.id, byId, x: p.x, y: p.y });
  }
}
