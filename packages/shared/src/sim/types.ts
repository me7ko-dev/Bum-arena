/** Всички суперсили. */
export type AbilityId = 'dash' | 'magnet' | 'giant' | 'freeze' | 'shield';

export const ABILITY_IDS: readonly AbilityId[] = ['dash', 'magnet', 'giant', 'freeze', 'shield'];

/**
 * Типове на състоянието на света. Всичко тук е „чисти данни“ –
 * лесно се копира, сериализира и праща по мрежата (етап 3) или пази за клип (етап 6).
 */

export interface Player {
  readonly id: number;
  name: string;
  isBot: boolean;
  /** Индекс в палитрата на клиента (цветът е визуален, не влияе на играта). */
  colorIndex: number;

  // ── Позиция и движение ──
  x: number;
  y: number;
  /** Позиция в началото на тика – за плавна интерполация при рисуване. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Посока, в която гледа (радиани). */
  facing: number;

  radius: number;
  mass: number;

  // ── Състояние в рунда ──
  /** false = паднал от арената (вече не участва). */
  alive: boolean;
  /** Тик, в който е паднал (-1 ако е жив). Нужно за класирането. */
  eliminatedTick: number;
  /** Секунди от началото на падането (за анимацията). */
  fallTime: number;
  /** Оставащо замайване в секунди (докато е > 0, не може да управлява). */
  stun: number;
  /** Кой го е ударил последно (id) и кога (тик) – за кредит при избутване. */
  lastHitBy: number;
  lastHitTick: number;
  /** Брой избутани противници. */
  knockouts: number;
  /** Монети в рунда. */
  coins: number;

  // ── Суперсила ──
  ability: AbilityId;
  /** Оставащо презареждане (сек). 0 = готова. */
  abilityCooldown: number;
  /** Оставащо време на действие (сек). > 0 = суперсилата е активна. */
  abilityTime: number;
  /** Беше ли задържан бутонът миналия тик (за да хващаме само натискането). */
  abilityHeld: boolean;
}

export interface Coin {
  readonly id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Колко монети струва (разпилените могат да са > 1). */
  value: number;
  /** Секунди, преди да може да се вземе. */
  pickupDelay: number;
}

export interface Arena {
  /** Център (засега винаги 0,0). */
  x: number;
  y: number;
  radius: number;
  /** Радиус след следващото свиване (= radius, ако няма предстоящо). */
  nextRadius: number;
  /** Секунди до началото на следващото свиване (-1 = няма повече). */
  shrinkIn: number;
  /** Свива ли се в момента. */
  shrinking: boolean;
}

export type RoundPhase = 'countdown' | 'playing' | 'ended';
export type EndReason = 'lastStanding' | 'timeUp';

export interface RoundState {
  phase: RoundPhase;
  /** Тикове от началото на текущата фаза (цяло число – без грешки от закръгляне). */
  phaseTicks: number;
  /** Секунди от началото на текущата фаза (= phaseTicks / tickRate). */
  phaseTime: number;
  /** Оставащо време до края на рунда (сек), докато phase === 'playing'. */
  timeLeft: number;
  /** id на победителя (-1 докато няма). */
  winnerId: number;
  endReason: EndReason | null;
}
