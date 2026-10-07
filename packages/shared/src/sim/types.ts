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
}

export interface Arena {
  /** Център (засега винаги 0,0). */
  x: number;
  y: number;
  radius: number;
}
