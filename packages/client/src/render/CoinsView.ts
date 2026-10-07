import type Phaser from 'phaser';
import type { Coin } from '@bum/shared';

/** Текстурата 'coin' е 40 px (радиус 20). */
const COIN_TEX_RADIUS = 20;

/**
 * Рисува всички монети. Спрайтовете се преизползват (pool), за да няма боклук в паметта.
 */
export class CoinsView {
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private pool: Phaser.GameObjects.Image[] = [];
  private seen = new Set<number>();
  private time = 0;

  constructor(
    private scene: Phaser.Scene,
    private coinRadius: number,
  ) {}

  update(coins: readonly Coin[], alpha: number, dtSec: number): void {
    this.time += dtSec;
    this.seen.clear();
    const baseScale = this.coinRadius / COIN_TEX_RADIUS;

    for (const c of coins) {
      this.seen.add(c.id);
      let s = this.sprites.get(c.id);
      if (!s) {
        s = this.pool.pop() ?? this.scene.add.image(0, 0, 'coin');
        s.setVisible(true);
        this.sprites.set(c.id, s);
      }
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const y = c.prevY + (c.y - c.prevY) * alpha;
      // Въртене (свиване по X) + подскачане. Фазата зависи от id, за да не се въртят синхронно.
      const phase = this.time * 4 + c.id * 1.7;
      const bigger = c.value > 1 ? 1.25 : 1;
      s.setPosition(x, y - 6 + Math.sin(phase * 0.7) * 3);
      s.setScale(baseScale * bigger * (0.35 + 0.65 * Math.abs(Math.cos(phase))), baseScale * bigger);
      // Още невзимаемите (току-що разпилени) примигват.
      s.setAlpha(c.pickupDelay > 0 ? 0.6 : 1);
      s.setDepth(y - 30);
    }

    // Изчезналите монети → обратно в pool-а.
    for (const [id, s] of this.sprites) {
      if (this.seen.has(id)) continue;
      s.setVisible(false);
      this.pool.push(s);
      this.sprites.delete(id);
    }
  }
}
