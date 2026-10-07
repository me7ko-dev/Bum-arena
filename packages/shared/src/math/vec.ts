/**
 * Малки помощни функции за 2D вектори.
 * Нарочно работят с числа, а не с обекти – симулацията не трябва
 * да създава боклук в паметта на всеки тик (важно за 60 FPS на телефон).
 */
export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Интерполация на ъгъл по най-късия път. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
