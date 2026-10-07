/**
 * Цветове и шрифтове на клиента (визуален стил, НЕ баланс).
 */
export const COLORS = {
  background: 0x1b1033,
  text: '#ffffff',
  textShadow: '#2a1650',
  accent: '#ffd23f',
  outline: 0x2a1650,
  arenaFloor: 0x3ec6a8,
  arenaFloorAlt: 0x36b398,
  arenaEdge: 0xf6f0d8,
  arenaRim: 0x2a8f7a,
  voidGlow: 0x2b1856,
} as const;

/** Цветове на човечетата (индексът идва от Player.colorIndex). */
export const PLAYER_COLORS: readonly number[] = [
  0xff5d73, // червено-розово
  0x4dabf7, // синьо
  0xffd23f, // жълто
  0x8ce99a, // зелено
  0xb197fc, // лилаво
  0xff922b, // оранжево
  0x66d9e8, // тюркоаз
  0xf783ac, // розово
  0xc0eb75, // лайм
  0xffa8a8, // прасковено
  0x91a7ff, // перивинкъл
  0xe599f7, // орхидея
];

export function playerColor(index: number): number {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;
}

export const FONT_FAMILY = 'Nunito, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
