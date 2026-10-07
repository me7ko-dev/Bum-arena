import { BALANCE, type Balance } from '../config/balance';
import { NO_INPUT, sanitizeInput, type PlayerInput } from '../input';
import { Rng } from '../math/rng';
import { handleAbilityInput, keepsMomentum, updateAbilities } from './abilities';
import { updateArena } from './arena';
import { CarSystem } from './cars';
import { CoinSystem } from './coins';
import { resolvePlayerCollisions } from './collisions';
import type { GameEvent } from './events';
import { applyMovement } from './movement';
import { checkRoundEnd } from './round';
import { tryBuy } from './shop';
import { updateStats } from './stats';
import type { AbilityId, Arena, Car, Coin, Player, RoundState } from './types';

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
  /** Визуален скин (кадър от атласа на клиента). */
  skin?: string;
  ability?: AbilityId;
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
  readonly seed: number;
  readonly rng: Rng;
  readonly arena: Arena;
  readonly players: Player[] = [];
  readonly coinSystem: CoinSystem;
  readonly carSystem: CarSystem;
  /** Кой носи короната (-1 = никой). */
  crownId = -1;
  readonly round: RoundState;
  /** Събитията от последния step(). Изчистват се в началото на всеки тик. */
  readonly events: GameEvent[] = [];

  /** Номер на текущия тик (расте с 1 на всеки step). */
  tick = 0;
  private nextId = 1;
  private readonly spawnOffset: number;

  constructor(opts: WorldOptions = {}) {
    this.cfg = opts.cfg ?? BALANCE;
    this.seed = (opts.seed ?? 1) >>> 0;
    this.rng = new Rng(this.seed);
    this.spawnOffset = this.rng.next() * Math.PI * 2;
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
    this.carSystem = new CarSystem(this);
  }

  /** Паркираните коли на картата. */
  get cars(): readonly Car[] {
    return this.carSystem.cars;
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
    // Временна позиция – истинската се дава от layoutSpawns() (равномерен кръг).
    const x = 0;
    const y = 0;
    const p: Player = {
      id: this.nextId++,
      name: opts.name,
      isBot: opts.isBot ?? false,
      colorIndex: opts.colorIndex ?? index,
      skin: opts.skin ?? '',
      x,
      y,
      prevX: x,
      prevY: y,
      vx: 0,
      vy: 0,
      facing: 0,
      radius: pc.radius,
      mass: pc.mass,
      maxSpeed: pc.maxSpeed,
      accel: pc.accel,
      hitPower: 1,
      immune: false,
      alive: true,
      eliminatedTick: -1,
      fallTime: 0,
      stun: 0,
      lastHitBy: -1,
      lastHitTick: -1,
      knockouts: 0,
      coins: 0,
      ability: opts.ability ?? 'dash',
      abilityCooldown: 0,
      abilityTime: 0,
      abilityHeld: false,
      frozen: 0,
      buffSize: 0,
      buffSpeed: 0,
      buffShield: 0,
      buffMega: 0,
      inCar: false,
      carHp: 0,
      carKind: 0,
      carCooldown: 0,
    };
    this.players.push(p);
    this.layoutSpawns();
    return p;
  }

  /**
   * Подрежда играчите равномерно в кръг около центъра, с лице към центъра.
   * Честно за всички: еднакво далеч от ръба и един от друг.
   */
  private layoutSpawns(): void {
    const n = this.players.length;
    const r = this.arena.radius * this.cfg.arena.spawnRadiusFrac;
    // Случайно завъртане на целия кръг, за да не започваш винаги на едно място.
    const offset = this.spawnOffset;
    this.players.forEach((p, i) => {
      const a = offset + (i / n) * Math.PI * 2;
      p.x = p.prevX = this.arena.x + Math.cos(a) * r;
      p.y = p.prevY = this.arena.y + Math.sin(a) * r;
      p.facing = a + Math.PI;
    });
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
      if (input.buy) tryBuy(this, p, input.buy);
      handleAbilityInput(this, p, input, this.canControl(p));
      updateStats(this.cfg, p);
    }

    for (let s = 0; s < substeps; s++) {
      for (const p of this.players) {
        const input = tickInputs.get(p.id) ?? NO_INPUT;
        applyMovement(p, input, this.canControl(p), keepsMomentum(p), this.cfg, dt);
      }
      resolvePlayerCollisions(this);
      this.checkFalls();
    }

    const playing = this.round.phase === 'playing';
    this.coinSystem.update(this.dt, playing);
    if (playing) this.carSystem.update(this.dt);
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
      this.updateCrown();
      checkRoundEnd(this);
    }
  }

  /** Може ли играчът да управлява (жив, не е замаян/замразен и рундът не е в отброяване). */
  canControl(p: Player): boolean {
    return p.alive && p.stun <= 0 && p.frozen <= 0 && this.round.phase !== 'countdown';
  }

  /** Таймери на играчите (замайване, суперсили, анимация на падане). */
  private updateTimers(dt: number): void {
    for (const p of this.players) {
      if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
      if (p.frozen > 0) p.frozen = Math.max(0, p.frozen - dt);
      if (p.buffSize > 0) p.buffSize = Math.max(0, p.buffSize - dt);
      if (p.buffSpeed > 0) p.buffSpeed = Math.max(0, p.buffSpeed - dt);
      if (p.buffShield > 0) p.buffShield = Math.max(0, p.buffShield - dt);
      if (p.buffMega > 0) p.buffMega = Math.max(0, p.buffMega - dt);
      if (p.carCooldown > 0) p.carCooldown = Math.max(0, p.carCooldown - dt);
      updateAbilities(this, p, dt);
      updateStats(this.cfg, p);
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

  /**
   * Короната: живият с най-много избутвания (поне minKnockouts).
   * При равенство остава у досегашния – иначе би „прескачала“ постоянно.
   */
  private updateCrown(): void {
    const min = this.cfg.crown.minKnockouts;
    const holder = this.crownId >= 0 ? this.getPlayer(this.crownId) : undefined;
    let best = holder?.alive && holder.knockouts >= min ? holder : undefined;
    for (const p of this.players) {
      if (!p.alive || p.knockouts < min) continue;
      if (!best || p.knockouts > best.knockouts) best = p;
    }
    const id = best?.id ?? -1;
    if (id !== this.crownId) {
      this.crownId = id;
      this.events.push({ type: 'crown', playerId: id });
    }
  }

  private eliminate(p: Player): void {
    p.alive = false;
    p.eliminatedTick = this.tick;
    p.fallTime = 0;
    p.stun = 0;
    p.frozen = 0;
    p.abilityTime = 0;
    p.inCar = false;

    // Кредит за избутване: ако някой го е ударил наскоро.
    let byId: number | null = null;
    const recent = (this.tick - p.lastHitTick) * this.dt <= this.cfg.hit.creditWindow;
    if (p.lastHitBy >= 0 && p.lastHitBy !== p.id && recent) {
      const by = this.getPlayer(p.lastHitBy);
      if (by) {
        by.knockouts++;
        byId = by.id;
        // Награда за свалена корона.
        if (p.id === this.crownId && by.alive) {
          by.coins += this.cfg.crown.bounty;
          this.events.push({ type: 'bounty', playerId: by.id, victimId: p.id, coins: this.cfg.crown.bounty });
        }
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
