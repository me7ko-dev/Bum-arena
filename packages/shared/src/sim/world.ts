import { BALANCE, type Balance } from '../config/balance';
import { NO_INPUT, sanitizeInput, type PlayerInput } from '../input';
import { Rng } from '../math/rng';
import { currentMass, handleAbilityInput, keepsMomentum, updateAbilities } from './abilities';
import { updateArena } from './arena';
import { CoinSystem } from './coins';
import { resolvePlayerCollisions } from './collisions';
import type { GameEvent } from './events';
import { applyMovement } from './movement';
import { checkRoundEnd } from './round';
import type { Arena, Coin, Player, RoundState } from './types';

export interface WorldOptions {
  seed?: number;
  /** Конфиг за баланса. Подава се по референция – промени в него (панела) важат веднага. */
  cfg?: Balance;
  /** Започни направо с игра, без отброяване (тестове, тренировка). */
  skipCountdown?: boolean;
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
  readonly coinSystem: CoinSystem;
  readonly round: RoundState;
  /** Събитията от последния step(). Изчистват се в началото на всеки тик. */
  readonly events: GameEvent[] = [];

  /** Номер на текущия тик (расте с 1 на всеки step). */
  tick = 0;
  private nextId = 1;

  constructor(opts: WorldOptions = {}) {
    this.cfg = opts.cfg ?? BALANCE;
    this.rng = new Rng(opts.seed ?? 1);
    const r0 = this.cfg.arena.startRadius;
    this.arena = { x: 0, y: 0, radius: r0, nextRadius: r0, shrinkIn: -1, shrinking: false };
    this.round = {
      phase: opts.skipCountdown ? 'playing' : 'countdown',
      phaseTicks: 0,
      phaseTime: 0,
      timeLeft: this.cfg.round.duration,
      winnerId: -1,
      endReason: null,
    };
    this.coinSystem = new CoinSystem(this);
    this.coinSystem.spawnInitial();
  }

  /** Монетите на картата. */
  get coins(): readonly Coin[] {
    return this.coinSystem.coins;
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
      coins: 0,
      ability: 'dash',
      abilityCooldown: 0,
      abilityTime: 0,
      abilityHeld: false,
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

    // Входът се чете веднъж на тик.
    const tickInputs = new Map<number, PlayerInput>();
    for (const p of this.players) {
      const input = sanitizeInput(inputs.get(p.id) ?? NO_INPUT);
      tickInputs.set(p.id, input);
      handleAbilityInput(this, p, input, this.canControl(p));
      p.mass = currentMass(this.cfg, p);
    }

    for (let s = 0; s < substeps; s++) {
      for (const p of this.players) {
        const input = tickInputs.get(p.id) ?? NO_INPUT;
        applyMovement(p, input, this.canControl(p), keepsMomentum(p), this.cfg, dt);
      }
      resolvePlayerCollisions(this);
      this.checkFalls();
    }

    this.coinSystem.update(this.dt, this.round.phase === 'playing');
    this.updateTimers(this.dt);
    this.updateRound();
    this.tick++;
  }

  /** Фази на рунда: отброяване → игра → край. */
  private updateRound(): void {
    const r = this.round;
    const rate = this.cfg.sim.tickRate;
    const prev = r.phaseTime;
    r.phaseTicks++;
    r.phaseTime = r.phaseTicks / rate;

    if (r.phase === 'countdown') {
      const totalTicks = Math.round(this.cfg.round.countdown * rate);
      // В началото на всяка цяла оставаща секунда: събитие 3, 2, 1.
      const remainingBefore = totalTicks - (r.phaseTicks - 1);
      if (remainingBefore > 0 && remainingBefore % rate === 0) {
        this.events.push({ type: 'countdown', n: remainingBefore / rate });
      }
      if (r.phaseTicks >= totalTicks) {
        r.phase = 'playing';
        r.phaseTicks = 0;
        r.phaseTime = 0;
        this.events.push({ type: 'countdown', n: 0 });
      }
      return;
    }

    if (r.phase === 'playing') {
      r.timeLeft = Math.max(0, this.cfg.round.duration - r.phaseTime);
      updateArena(this, r.phaseTime, prev);
      checkRoundEnd(this);
    }
  }

  /** Може ли играчът да управлява (жив, не е замаян и рундът не е в отброяване). */
  canControl(p: Player): boolean {
    return p.alive && p.stun <= 0 && this.round.phase !== 'countdown';
  }

  /** Таймери на играчите (замайване, суперсили, анимация на падане). */
  private updateTimers(dt: number): void {
    for (const p of this.players) {
      if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
      updateAbilities(this, p, dt);
      if (!p.alive) p.fallTime += dt;
    }
  }

  /**
   * Който е с център извън арената – пада и е елиминиран.
   * Извън активната игра (отброяване, край) ръбът е стена – никой не пада.
   */
  private checkFalls(): void {
    const a = this.arena;
    const playing = this.round.phase === 'playing';
    for (const p of this.players) {
      if (!p.alive) continue;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= a.radius * a.radius) continue;
      if (playing) {
        this.eliminate(p);
      } else {
        const d = Math.sqrt(d2);
        p.x = a.x + (dx / d) * a.radius;
        p.y = a.y + (dy / d) * a.radius;
        p.vx *= -0.3;
        p.vy *= -0.3;
      }
    }
  }

  private eliminate(p: Player): void {
    p.alive = false;
    p.eliminatedTick = this.tick;
    p.fallTime = 0;
    p.stun = 0;
    p.abilityTime = 0;

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

    // Всичките му монети се пръскат обратно в арената (близо до ръба, към центъра).
    if (p.coins > 0) {
      const d = Math.hypot(p.x - this.arena.x, p.y - this.arena.y) || 1;
      const nx = (p.x - this.arena.x) / d;
      const ny = (p.y - this.arena.y) / d;
      const r = this.arena.radius * 0.88;
      this.coinSystem.scatter(p, p.coins, this.arena.x + nx * r, this.arena.y + ny * r, -nx * 0.6, -ny * 0.6);
    }
  }
}
