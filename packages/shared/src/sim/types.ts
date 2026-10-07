/** Всички суперсили. */
export type AbilityId = 'dash' | 'magnet' | 'giant' | 'freeze' | 'shield';

export const ABILITY_IDS: readonly AbilityId[] = ['dash', 'magnet', 'giant', 'freeze', 'shield'];

/** Неща от магазина в рунда. */
export type ShopItemId = 'size' | 'speed' | 'shield' | 'mega';

export const SHOP_ITEM_IDS: readonly ShopItemId[] = ['size', 'speed', 'shield', 'mega'];

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
  /** Скин (само визуален – кадър от атласа на клиента). */
  skin: string;

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

  // ── Изчислени всеки тик от базовите стойности + ефектите (виж stats.ts) ──
  radius: number;
  mass: number;
  maxSpeed: number;
  accel: number;
  /** Множител на силата, с която буташ другите. */
  hitPower: number;
  /** Неуязвим за отблъскване, замайване и замразяване (щит). */
  immune: boolean;

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

  // ── Временни ефекти (сек оставащо, 0 = няма) ──
  /** Замразен – не може да управлява и се пързаля. */
  frozen: number;
  buffSize: number;
  buffSpeed: number;
  buffShield: number;
  /** Мега удар е зареден (сек, докато важи). */
  buffMega: number;

  // ── Кола ──
  /** Кара ли кола в момента. */
  inCar: boolean;
  /** „Живот“ на колата, която кара. */
  carHp: number;
  /** Вид на колата (визуално). */
  carKind: number;
  /** Колко още не може да влезе в кола (сек). */
  carCooldown: number;
}

/** Паркирана (празна) кола на картата. */
export interface Car {
  readonly id: number;
  x: number;
  y: number;
  hp: number;
  /** Вид (визуално, индекс в списъка с коли на клиента). */
  kind: number;
  /** Накъде е обърната: -1 наляво, 1 надясно. */
  dir: number;
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
