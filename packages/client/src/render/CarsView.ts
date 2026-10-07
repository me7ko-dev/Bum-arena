import type Phaser from 'phaser';
import type { Car } from '@bum/shared';
import { ATLAS, CAR_FRAMES } from '../assets';

/**
 * Паркираните коли: подскачат леко и имат стрелка „влез“, за да се забелязват.
 */
export class CarsView {
  private views = new Map<number, Phaser.GameObjects.Container>();
  private seen = new Set<number>();
  private time = 0;

  constructor(
    private scene: Phaser.Scene,
    private carRadius: number,
  ) {}

  update(cars: readonly Car[], dtSec: number): void {
    this.time += dtSec;
    this.seen.clear();
    for (const c of cars) {
      this.seen.add(c.id);
      let v = this.views.get(c.id);
      if (!v) {
        const shadow = this.scene.add.image(0, this.carRadius * 0.55, 'shadow').setScale((this.carRadius * 2.6) / 128, 0.6);
        const img = this.scene.add.image(0, 0, ATLAS, CAR_FRAMES[c.kind % CAR_FRAMES.length]);
        img.setScale((this.carRadius * 2.7) / 192).setFlipX(c.dir > 0);
        const arrow = this.scene.add.image(0, -this.carRadius - 30, ATLAS, 'star').setScale(0.22);
        v = this.scene.add.container(c.x, c.y, [shadow, img, arrow]);
        v.setScale(0.2);
        this.scene.tweens.add({ targets: v, scale: 1, duration: 400, ease: 'Back.easeOut' });
        this.views.set(c.id, v);
      }
      v.setPosition(c.x, c.y).setDepth(c.y);
      const arrow = v.list[2] as Phaser.GameObjects.Image;
      arrow.y = -this.carRadius - 30 + Math.sin(this.time * 5 + c.id) * 6;
      arrow.rotation = Math.sin(this.time * 2) * 0.3;
    }
    for (const [id, v] of this.views) {
      if (this.seen.has(id)) continue;
      v.destroy();
      this.views.delete(id);
    }
  }
}
