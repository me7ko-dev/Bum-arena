import type { GameEvent, Player, PlayerInput, World } from '@bum/shared';

/** Откъде играта чете входа на човека (виж HumanInput). */
export interface InputSource {
  read(): PlayerInput;
  /** Тикът (или изпратеното съобщение) е използвал натискането на суперсилата и покупката. */
  consumeAbility(): void;
}

/**
 * Една игра, каквато я вижда сцената: офлайн (LocalGame – светът се смята в браузъра)
 * или онлайн (NetGame – светът идва от сървъра). GameScene и HudScene работят само с това.
 */
export interface Match {
  /** true = игра през сървъра. */
  readonly online: boolean;
  /** Светът, който се рисува (онлайн – огледало на сървъра). */
  readonly world: World;
  /** id на човека; -1 = само гледаш (онлайн, влязъл по средата на рунда). */
  readonly humanId: number;
  /** Играчът на човека. Ако само гледаш – „празен“ паднал играч, който не е в света. */
  readonly human: Player;
  /** Колко от пътя между prevX/x (и prevY/y) да се нарисува (0..1). */
  readonly alpha: number;
  /** Само гледаш – влизаш в следващия рунд. */
  readonly isSpectator: boolean;
  /** Сменя се при нов рунд онлайн (нов свят) – сцената тогава се презарежда. */
  readonly roundId: number;
  /** Чакаме началото на рунда (лоби или още няма данни от сървъра) – светът стои. */
  readonly waiting: boolean;
  /** В лобито: секунди до първия рунд (онлайн), иначе null. */
  readonly startsIn: number | null;
  /** Код на стаята (онлайн), иначе null. */
  readonly roomId: string | null;
  /** Частна стая (игра с приятели по линк). */
  readonly isPrivate: boolean;
  /** Последно измереният пинг в ms (онлайн), иначе null. */
  readonly ping: number | null;
  /** След колко секунди започва следващият рунд (онлайн, в края на рунда), иначе null. */
  readonly nextRoundIn: number | null;
  /** Връзката е прекъснала: ключ за превод на причината. null = всичко е наред. */
  readonly disconnected: string | null;

  /** Вика се всеки кадър с изминалото време в секунди. */
  update(frameSec: number, input: InputSource): void;
  /** Връща и изчиства натрупаните събития (всяко точно веднъж). */
  drainEvents(): GameEvent[];
  /** Hit-stop: светът спира за миг (онлайн не прави нищо – светът е на сървъра). */
  freeze(seconds: number): void;
  /**
   * Забавен каданс: светът върви с scale (напр. 0.3) за seconds реални секунди
   * (драматичен момент – избутване). Онлайн не прави нищо.
   */
  slowmo(scale: number, seconds: number): void;
  /** Край на играта (онлайн – излиза от стаята). */
  dispose(): void;
}
