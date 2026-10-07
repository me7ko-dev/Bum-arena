import { World, type Balance, type Player, type PlayerInput } from '@bum/shared';

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

  /** Максимум тикове на кадър – ако табът е бил скрит, не „догонваме“ безкрайно. */
  private static readonly MAX_TICKS_PER_FRAME = 5;

  constructor(cfg: Balance, seed: number, humanName: string) {
    this.world = new World({ cfg, seed });
    this.humanId = this.world.addPlayer({ name: humanName }).id;
  }

  get human(): Player {
    return this.world.getPlayer(this.humanId)!;
  }

  /** Колко от следващия тик е изминало (0..1) – за интерполация. */
  get alpha(): number {
    return this.accumulator / this.world.dt;
  }

  /** Вика се всеки кадър с изминалото време в секунди. */
  update(frameSec: number, humanInput: PlayerInput): void {
    const dt = this.world.dt;
    this.accumulator += Math.min(frameSec, dt * LocalGame.MAX_TICKS_PER_FRAME);

    while (this.accumulator >= dt) {
      const inputs = new Map<number, PlayerInput>([[this.humanId, humanInput]]);
      this.world.step(inputs);
      this.accumulator -= dt;
    }
  }
}
