import {
  ABILITY_IDS,
  BOT_NAMES,
  BotBrain,
  World,
  pickDifficulty,
  type Balance,
  type GameEvent,
  type Player,
  type AbilityId,
  type PlayerInput,
} from '@bum/shared';
import { SKINS } from './settings';
import type { InputSource, Match } from './Match';

export type { InputSource } from './Match';

export interface LocalGameOptions {
  cfg: Balance;
  seed: number;
  humanName: string;
  humanSkin: string;
  humanAbility: AbilityId;
  /** Колко бота да има освен човека. */
  bots: number;
}

/**
 * Локална игра („Тренировка“): светът се смята в браузъра, ботовете – също.
 * Онлайн играта (NetGame) изпълнява същия интерфейс Match.
 *
 * Фиксирана стъпка: светът се смята точно tickRate пъти в секунда,
 * независимо от FPS. Рисуването интерполира между последните два тика (alpha).
 */
export class LocalGame implements Match {
  readonly online = false;
  readonly isSpectator = false;
  readonly roundId = 0;
  readonly waiting = false;
  readonly startsIn = null;
  readonly roomId = null;
  readonly isPrivate = false;
  readonly ping = null;
  readonly nextRoundIn = null;
  readonly disconnected = null;
  readonly world: World;
  readonly humanId: number;
  readonly bots: BotBrain[] = [];
  private accumulator = 0;
  /** Оставащо „замразяване“ (hit-stop) в секунди. */
  private freezeLeft = 0;
  /** Събития, натрупани от последното четене (drainEvents). */
  private pendingEvents: GameEvent[] = [];

  /** Максимум тикове на кадър – ако табът е бил скрит, не „догонваме“ безкрайно. */
  private static readonly MAX_TICKS_PER_FRAME = 5;

  constructor(opts: LocalGameOptions) {
    this.world = new World({ cfg: opts.cfg, seed: opts.seed });
    this.humanId = this.world.addPlayer({
      name: opts.humanName,
      skin: opts.humanSkin,
      ability: opts.humanAbility,
    }).id;
    // Ботовете са с различни скинове (не като твоя) и случайни суперсили.
    const skins = SKINS.filter((s) => s !== opts.humanSkin);
    // Ботове с различни имена и трудност. В етап 3 те ще запълват празните места в стаята.
    const names = [...BOT_NAMES];
    for (let i = 0; i < opts.bots; i++) {
      const name = names.splice(this.world.rng.int(0, names.length - 1), 1)[0] ?? `Bot${i}`;
      const skin = skins.splice(this.world.rng.int(0, skins.length - 1), 1)[0] ?? SKINS[0]!;
      const ability = this.world.rng.pick(ABILITY_IDS);
      const p = this.world.addPlayer({ name, isBot: true, skin, ability });
      const difficulty = pickDifficulty(opts.cfg, this.world.rng);
      this.bots.push(new BotBrain(p.id, difficulty, (opts.seed ^ (p.id * 2654435761)) >>> 0));
    }
  }

  get human(): Player {
    return this.world.getPlayer(this.humanId)!;
  }

  /** Колко от следващия тик е изминало (0..1) – за интерполация. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.world.dt);
  }

  /** Hit-stop: светът спира за миг. */
  freeze(seconds: number): void {
    this.freezeLeft = Math.max(this.freezeLeft, seconds);
  }

  /** Вика се всеки кадър с изминалото време в секунди. */
  update(frameSec: number, input: InputSource): void {
    if (this.freezeLeft > 0) {
      this.freezeLeft -= frameSec;
      return;
    }
    const dt = this.world.dt;
    this.accumulator += Math.min(frameSec, dt * LocalGame.MAX_TICKS_PER_FRAME);

    while (this.accumulator >= dt) {
      const inputs = new Map<number, PlayerInput>([[this.humanId, input.read()]]);
      input.consumeAbility();
      for (const bot of this.bots) inputs.set(bot.playerId, bot.think(this.world));
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

  dispose(): void {
    // Няма връзка за затваряне.
  }
}
