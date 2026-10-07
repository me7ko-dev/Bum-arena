/**
 * Предсказване на собственото човече онлайн (client-side prediction + reconciliation).
 *
 * Без предсказване героят тръгва едва след като входът стигне до сървъра и снимката се върне
 * (закъснение = пинг). Тук клиентът мести героя веднага със СЪЩИЯ код за движение като сървъра
 * (applyMovement от @bum/shared), тик по тик, и пази историята на входа си.
 *
 * Когато дойде снимка, тя показва състоянието на сървъра отпреди ~пинг секунди. Започваме от него
 * и „превъртаме“ входа от последните ~пинг секунди → къде сме сега според сървъра.
 * Разликата спрямо предсказаното се стопява плавно (без подскачане); голяма разлика
 * (телепорт, нов рунд) се поправя веднага. Ударите и сблъсъците не се предсказват –
 * те идват от сървъра (скоростта в снимката) и превъртането ги продължава.
 */
import { applyMovement, type Balance, type Player, type PlayerInput } from '@bum/shared';

interface Entry {
  mx: number;
  my: number;
  /** В този тик е натиснат дъш (предсказан). */
  dash: boolean;
}

/** Колко тика история пазим (~3 сек при 30 тика/сек – повече от всеки разумен пинг). */
const MAX_HISTORY = 90;
/** Над това разстояние поправката е мигновена (нов рунд, телепорт). */
const SNAP_DIST = 160;
/** За колко секунди се стопява разликата между предсказаното и сървъра. */
const SMOOTH_TAU = 0.1;

export class OwnPredictor {
  private hist: Entry[] = [];
  private body: Player | null = null;
  private acc = 0;
  private errX = 0;
  private errY = 0;
  private prevHeld = false;
  /** Предсказан дъш: оставащо време на „летене“ и кога може пак. */
  private dashLeft = 0;
  private dashLockUntil = 0;
  private time = 0;

  constructor(private readonly cfg: Balance) {}

  reset(): void {
    this.hist = [];
    this.body = null;
    this.acc = 0;
    this.errX = this.errY = 0;
    this.prevHeld = false;
    this.dashLeft = 0;
  }

  /**
   * Вика се всеки кадър.
   * @param input текущият вход (без да се „консумира“)
   * @param server собственият играч от най-новата снимка
   * @param newSnapshot пристигнала ли е нова снимка от миналия кадър
   * @param pingSec пинг до сървъра (секунди)
   * @returns позиция и скорост за рисуване
   */
  update(
    frameSec: number,
    input: PlayerInput,
    server: Player,
    newSnapshot: boolean,
    pingSec: number,
  ): { x: number; y: number; vx: number; vy: number; facing: number } {
    this.time += frameSec;
    if (!this.body || !server.alive) {
      this.body = { ...server };
      this.hist = [];
      this.errX = this.errY = 0;
    }

    // 1) Нови тикове с локалния вход.
    const dt = 1 / this.cfg.sim.tickRate;
    this.acc += Math.min(frameSec, 0.25);
    while (this.acc >= dt) {
      this.acc -= dt;
      const pressed = input.ability && !this.prevHeld;
      this.prevHeld = input.ability;
      const entry: Entry = { mx: input.mx, my: input.my, dash: pressed && this.canDash(server) };
      if (entry.dash) this.dashLockUntil = this.time + this.cfg.abilities.dash.cooldown;
      this.hist.push(entry);
      if (this.hist.length > MAX_HISTORY) this.hist.shift();
      this.step(this.body, entry, server);
    }

    // 2) Нова снимка → от състоянието на сървъра превъртаме входа от последните ~пинг секунди.
    if (newSnapshot) {
      const before = { x: this.body.x, y: this.body.y };
      const replay: Player = { ...server };
      this.dashLeft = 0;
      const n = Math.min(this.hist.length, Math.round(pingSec / dt) + 1);
      for (let i = this.hist.length - n; i < this.hist.length; i++) this.step(replay, this.hist[i]!, server);
      this.body = replay;
      const ex = before.x - replay.x;
      const ey = before.y - replay.y;
      if (Math.hypot(ex + this.errX, ey + this.errY) > SNAP_DIST) {
        this.errX = this.errY = 0;
      } else {
        this.errX += ex;
        this.errY += ey;
      }
    }

    // 3) Плавно стопяване на разликата.
    const k = Math.exp(-Math.max(0, frameSec) / SMOOTH_TAU);
    this.errX *= k;
    this.errY *= k;
    const b = this.body;
    return { x: b.x + this.errX, y: b.y + this.errY, vx: b.vx, vy: b.vy, facing: b.facing };
  }

  /** Може ли да се предскаже дъш сега (суперсилата е дъш, готова, не е замаян/в кола). */
  private canDash(server: Player): boolean {
    return (
      server.ability === 'dash' &&
      server.alive &&
      !server.inCar &&
      server.stun <= 0 &&
      server.frozen <= 0 &&
      server.abilityCooldown <= 0 &&
      this.time >= this.dashLockUntil
    );
  }

  /** Един тик движение – същото като на сървъра (без сблъсъци). */
  private step(p: Player, e: Entry, server: Player): void {
    const cfg = this.cfg;
    const dt = 1 / cfg.sim.tickRate;
    // Характеристиките (скорост, ускорение) идват от сървъра – там са всички бафове.
    p.maxSpeed = server.maxSpeed;
    p.accel = server.accel;
    if (e.dash) {
      const l = Math.hypot(e.mx, e.my);
      const dx = l > 0.2 ? e.mx / l : Math.cos(p.facing);
      const dy = l > 0.2 ? e.my / l : Math.sin(p.facing);
      p.vx = dx * cfg.abilities.dash.speed;
      p.vy = dy * cfg.abilities.dash.speed;
      p.facing = Math.atan2(dy, dx);
      this.dashLeft = cfg.abilities.dash.duration;
    }
    const canControl = server.alive && server.stun <= 0 && server.frozen <= 0;
    const momentum = this.dashLeft > 0 || (server.ability === 'dash' && server.abilityTime > 0 && !server.inCar);
    const input: PlayerInput = { mx: e.mx, my: e.my, ability: false };
    const sub = Math.max(1, Math.round(cfg.sim.substeps));
    for (let s = 0; s < sub; s++) applyMovement(p, input, canControl, momentum, cfg, dt / sub);
    if (this.dashLeft > 0) this.dashLeft = Math.max(0, this.dashLeft - dt);
  }
}
