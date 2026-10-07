import type { GameEvent, Snapshot } from '@bum/shared';

/** Двете снимки около „времето за рисуване“ и колко сме между тях. */
export interface InterpFrame {
  /** По-старата снимка → prevX/prevY. */
  from: Snapshot;
  /** По-новата снимка → x/y и цялото останало състояние. */
  to: Snapshot;
  /** 0 = from, 1 = to. Винаги в [0, 1]. */
  alpha: number;
}

export interface SnapshotBufferOptions {
  /** С колко секунди назад във времето рисуваме (запас срещу неравномерно пристигане). */
  delay?: number;
  /** Най-много снимки в буфера (напр. докато табът е скрит). По-старите се „прилагат“ веднага. */
  maxBuffered?: number;
}

/** При разминаване на часовника над толкова секунди – синхронизираме наново. */
const RESYNC_SEC = 1;
/** Ако рисуването изостане с повече от толкова секунди – прескачаме напред. */
const SNAP_SEC = 0.25;

/**
 * Буфер от снимки на сървъра и часовник за рисуване (чиста логика, без мрежа – лесно се тества).
 *
 * Всяка снимка има „сървърно време“ = tick / tickRate. Връзката сървърно ↔ местно време
 * (offset) се оценява от пристигането на снимките: по-свежа снимка (по-малко закъснение)
 * мести оценката бързо, закъсняла – бавно. Така трептенето на мрежата не дърпа часовника.
 *
 * Рисуваме `delay` секунди назад: времето за рисуване расте плавно (скоростта леко се
 * коригира към целта), никога не върви назад и не минава последната снимка.
 *
 * Събитията: всяка снимка, която стане „текуща“ (to) или бъде прескочена, отдава
 * събитията си точно веднъж и по реда на тиковете.
 */
export class SnapshotBuffer {
  readonly delay: number;
  private readonly maxBuffered: number;
  /** Снимките по ред на тика; първата може вече да е приложена (тя е `from`). */
  private snaps: Snapshot[] = [];
  /** Тик на последната снимка, чиито събития са отдадени. */
  private lastQueuedTick = -Infinity;
  /** Сървърно време − местно време (сек). */
  private offset: number | null = null;
  private rt: number | null = null;
  private lastNow = 0;
  private events: GameEvent[] = [];

  constructor(
    private readonly tickRate: number,
    opts: SnapshotBufferOptions = {},
  ) {
    this.delay = opts.delay ?? 0.1;
    this.maxBuffered = Math.max(4, opts.maxBuffered ?? 90);
  }

  /** Сървърното време на снимката в секунди. */
  timeOf(s: Snapshot): number {
    return s.t / this.tickRate;
  }

  get size(): number {
    return this.snaps.length;
  }

  get latest(): Snapshot | null {
    return this.snaps[this.snaps.length - 1] ?? null;
  }

  /** Текущото време за рисуване (сървърно, сек); null преди първата снимка. */
  get renderTime(): number | null {
    return this.rt;
  }

  /** Оценка на сегашното сървърно време (без закъснението за рисуване). */
  serverNow(localNow: number): number {
    return localNow + (this.offset ?? 0);
  }

  /** Нова снимка от сървъра; localNow – местно време в секунди. */
  push(snap: Snapshot, localNow: number): void {
    const last = this.latest;
    if (last && snap.t <= last.t) {
      // Тикът е тръгнал отначало (нов свят без roster) → започваме наново; иначе е повторение.
      if (last.t - snap.t > this.tickRate * 2) this.reset(true);
      else return;
    }
    if (snap.t <= this.lastQueuedTick) return;
    this.snaps.push(snap);

    const sample = this.timeOf(snap) - localNow;
    if (this.offset === null || Math.abs(sample - this.offset) > RESYNC_SEC) this.offset = sample;
    else if (sample > this.offset) this.offset += (sample - this.offset) * 0.5;
    else this.offset += (sample - this.offset) * 0.02;

    // Твърде много чакащи (табът е бил скрит) – най-старите се прилагат веднага, без да губим събития.
    while (this.snaps.length > this.maxBuffered) this.queue(this.snaps.shift()!);
  }

  /**
   * Придвижва времето за рисуване до localNow и връща двете снимки около него.
   * null, ако още няма снимки.
   */
  advance(localNow: number): InterpFrame | null {
    const n = this.snaps.length;
    if (n === 0 || this.offset === null) return null;

    const target = localNow + this.offset - this.delay;
    if (this.rt === null) {
      this.rt = target;
    } else {
      const dt = Math.max(0, localNow - this.lastNow);
      const err = target - this.rt;
      if (err > SNAP_SEC) this.rt = target;
      else this.rt += dt * Math.min(1.5, Math.max(0.5, 1 + err * 2));
    }
    this.lastNow = localNow;
    // Без екстраполация на другите: не по-нататък от последната снимка.
    const lastTime = this.timeOf(this.snaps[n - 1]!);
    if (this.rt > lastTime) this.rt = lastTime;
    const rt = this.rt;

    // Последната снимка с време ≤ rt.
    let i = -1;
    while (i + 1 < n && this.timeOf(this.snaps[i + 1]!) <= rt) i++;

    let fromIdx: number;
    let toIdx: number;
    let alpha: number;
    if (i < 0) {
      fromIdx = toIdx = 0;
      alpha = 0;
    } else if (i === n - 1) {
      fromIdx = Math.max(0, n - 2);
      toIdx = n - 1;
      alpha = 1;
    } else {
      fromIdx = i;
      toIdx = i + 1;
      const tf = this.timeOf(this.snaps[i]!);
      const tt = this.timeOf(this.snaps[i + 1]!);
      alpha = Math.min(1, Math.max(0, (rt - tf) / (tt - tf)));
    }

    // Събитията на всички снимки до „to“ включително (и прескочените) – точно веднъж.
    for (let k = 0; k <= toIdx; k++) this.queue(this.snaps[k]!);
    const from = this.snaps[fromIdx]!;
    const to = this.snaps[toIdx]!;
    // По-старите от „from“ вече не трябват.
    if (fromIdx > 0) this.snaps.splice(0, fromIdx);
    return { from, to, alpha };
  }

  /** Връща и изчиства събитията на приложените снимки. */
  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /**
   * Нов рунд/свят: всичко отначало. Събитията на неприложените снимки отпадат;
   * keepEvents = да останат вече отдадените, но още непрочетени.
   */
  reset(keepEvents = false): void {
    this.snaps = [];
    this.lastQueuedTick = -Infinity;
    this.offset = null;
    this.rt = null;
    if (!keepEvents) this.events = [];
  }

  private queue(s: Snapshot): void {
    if (s.t <= this.lastQueuedTick) return;
    this.lastQueuedTick = s.t;
    for (const e of s.events) this.events.push(e);
  }
}
