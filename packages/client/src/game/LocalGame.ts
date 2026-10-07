import { BOT_NAMES, World, type Balance, type GameEvent, type Player, type PlayerInput } from '@bum/shared';

export interface LocalGameOptions {
  cfg: Balance;
  seed: number;
  humanName: string;
  /** Колко противника да има освен човека. */
  opponents: number;
}

/**
 * Локална игра (етап 1): светът се смята в браузъра.
 * В етап 3 това ще се замени от мрежов клиент, а World ще върви на сървъра –
 * затова сцената работи с LocalGame само през малък интерфейс.
 *
 * Фиксирана стъпка: светът се смята точно tickRate пъти в секунда,
 * независимо от FPS. Рисуването интерполира между последните два тика (alpha).
 */
export class LocalGame {
  readonly world: World;
  readonly humanId: number;
  private accumulator = 0;
  /** Оставащо „замразяване“ (hit-stop) в секунди. */
  private freezeLeft = 0;
  /** Събития, натрупани от последното четене (drainEvents). */
  private pendingEvents: GameEvent[] = [];

  /** Максимум тикове на кадър – ако табът е бил скрит, не „догонваме“ безкрайно. */
  private static readonly MAX_TICKS_PER_FRAME = 5;

  constructor(opts: LocalGameOptions) {
    this.world = new World({ cfg: opts.cfg, seed: opts.seed });
    this.humanId = this.world.addPlayer({ name: opts.humanName }).id;
    const names = [...BOT_NAMES];
    for (let i = 0; i < opts.opponents; i++) {
      const name = names.splice(this.world.rng.int(0, names.length - 1), 1)[0] ?? `Bot${i}`;
      this.world.addPlayer({ name, isBot: true });
    }
  }

  get human(): Player {
    return this.world.getPlayer(this.humanId)!;
  }

  /** Колко от следващия тик е изминало (0..1) – за интерполация. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.world.dt);
  }

  /** Hit-stop: светът спира за миг. (Онлайн ще спира само рисуването.) */
  freeze(seconds: number): void {
    this.freezeLeft = Math.max(this.freezeLeft, seconds);
  }

  /** Вика се всеки кадър с изминалото време в секунди. */
  update(frameSec: number, humanInput: PlayerInput): void {
    if (this.freezeLeft > 0) {
      this.freezeLeft -= frameSec;
      return;
    }
    const dt = this.world.dt;
    this.accumulator += Math.min(frameSec, dt * LocalGame.MAX_TICKS_PER_FRAME);

    while (this.accumulator >= dt) {
      const inputs = new Map<number, PlayerInput>([[this.humanId, humanInput]]);
      this.world.step(inputs);
      this.pendingEvents.push(...this.world.events);
      this.accumulator -= dt;
    }
  }

  /** Връща и изчиства натрупаните събития. */
  drainEvents(): GameEvent[] {
    const ev = this.pendingEvents;
    this.pendingEvents = [];
    return ev;
  }
}
