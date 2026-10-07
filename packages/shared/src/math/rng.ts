/**
 * Детерминиран генератор на случайни числа (mulberry32).
 *
 * Симулацията НИКОГА не ползва Math.random() – само Rng със seed.
 * Така един рунд може да се възпроизведе точно (за бъгове, повторения и клипове).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Число в [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Число в [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Цяло число в [min, max] (включително). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Случаен елемент от масив. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** true с вероятност p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
