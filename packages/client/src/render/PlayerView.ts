import Phaser from 'phaser';
import type { Player } from '@bum/shared';
import { FONT_FAMILY, playerColor } from '../theme';

/** Размерът на текстурата 'body' е 128 px за радиус 64. */
const BODY_TEX_RADIUS = 64;

/**
 * Визуално представяне на едно човече: сянка, тяло, очи, име.
 * Не съдържа логика на играта – само чете Player и рисува.
 */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  /** Плавна посока на погледа (за да не „скача“). */
  private lookAngle: number;
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, p: Player, isMe: boolean) {
    const color = playerColor(p.colorIndex);
    this.shadow = scene.add.image(0, p.radius * 0.75, 'shadow');
    this.body = scene.add.image(0, 0, 'body').setTint(color);
    this.eyes = scene.add.image(0, 0, 'eyes');
    this.label = scene.add
      .text(0, -p.radius - 22, p.name, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: isMe ? '#ffd23f' : '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.container = scene.add.container(p.x, p.y, [this.shadow, this.body, this.eyes, this.label]);
    this.lookAngle = p.facing;
    this.applySize(p.radius);
  }

  private applySize(radius: number): void {
    const s = radius / BODY_TEX_RADIUS;
    this.body.setScale(s);
    this.eyes.setScale(s * 1.05);
    this.shadow.setScale(s * 1.1, s * 1.1);
    this.shadow.y = radius * 0.75;
    this.label.y = -radius - 22;
  }

  /**
   * @param alpha интерполация между предишния и текущия тик (0..1)
   * @param dtSec време от предишния кадър
   */
  update(p: Player, alpha: number, dtSec: number): void {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    this.container.setPosition(x, y);
    this.container.setDepth(y); // по-долните се рисуват отгоре

    // Погледът плавно следва посоката.
    this.lookAngle = Phaser.Math.Angle.RotateTo(this.lookAngle, p.facing, dtSec * 12);
    const look = p.radius * 0.28;
    this.eyes.setPosition(Math.cos(this.lookAngle) * look, Math.sin(this.lookAngle) * look * 0.8 - p.radius * 0.12);

    // Леко „подскачане“ при ходене – прави човечето живо.
    const speed = Math.hypot(p.vx, p.vy);
    this.bobPhase += dtSec * (4 + speed / 30);
    const bob = Math.min(1, speed / 300) * Math.sin(this.bobPhase) * 0.06;
    const s = p.radius / BODY_TEX_RADIUS;
    this.body.setScale(s * (1 + bob), s * (1 - bob));
  }

  destroy(): void {
    this.container.destroy();
  }
}
