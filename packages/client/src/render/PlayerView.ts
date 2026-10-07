import Phaser from 'phaser';
import type { Balance, Player } from '@bum/shared';
import { FONT_FAMILY, playerColor } from '../theme';
import { LAYERS } from './layers';

/** Размерът на текстурата 'body' е 128 px за радиус 64. */
const BODY_TEX_RADIUS = 64;
const STAR_COUNT = 3;

/**
 * Визуално представяне на едно човече: сянка, тяло, очи, име, звездички при замайване.
 * Не съдържа логика на играта – само чете Player и рисува.
 */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  readonly color: number;
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Image[] = [];

  /** Плавна посока на погледа (за да не „скача“). */
  private lookAngle: number;
  private bobPhase = Math.random() * Math.PI * 2;
  private starPhase = 0;
  /** „Сплескване“ при удар (затихва). */
  private squashAmount = 0;
  /** Оставащо време на бялото премигване. */
  private flashLeft = 0;
  /** Таймер за следата при дъш. */
  private trailTimer = 0;

  constructor(
    private scene: Phaser.Scene,
    p: Player,
    isMe: boolean,
  ) {
    this.color = playerColor(p.colorIndex);
    this.shadow = scene.add.image(0, p.radius * 0.75, 'shadow');
    this.body = scene.add.image(0, 0, 'body').setTint(this.color);
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
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push(scene.add.image(0, 0, 'star').setScale(0.7).setVisible(false));
    }
    this.container = scene.add.container(p.x, p.y, [
      this.shadow,
      this.body,
      this.eyes,
      this.label,
      ...this.stars,
    ]);
    this.lookAngle = p.facing;
    this.layout(p.radius);
  }

  private layout(radius: number): void {
    const s = radius / BODY_TEX_RADIUS;
    this.body.setScale(s);
    this.eyes.setScale(s * 1.05);
    this.shadow.setScale(s * 1.1, s * 1.1);
    this.shadow.y = radius * 0.75;
    this.label.y = -radius - 22;
  }

  /** Ефект при удар: сплескване + бяло премигване. */
  hitReact(strength: number): void {
    this.squashAmount = Math.max(this.squashAmount, 0.12 + strength * 0.25);
    this.flashLeft = 0.06 + strength * 0.06;
  }

  /**
   * @param alpha интерполация между предишния и текущия тик (0..1)
   * @param dtSec време от предишния кадър
   */
  update(p: Player, alpha: number, dtSec: number, cfg: Balance): void {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    this.container.setPosition(x, y);

    if (!p.alive) {
      this.updateFalling(p, cfg);
      return;
    }
    this.container.setDepth(y); // по-долните се рисуват отгоре

    // Погледът плавно следва посоката.
    this.lookAngle = Phaser.Math.Angle.RotateTo(this.lookAngle, p.facing, dtSec * 12);
    const look = p.radius * 0.28;
    this.eyes.setPosition(
      Math.cos(this.lookAngle) * look,
      Math.sin(this.lookAngle) * look * 0.8 - p.radius * 0.12,
    );

    // Подскачане при ходене + сплескване при удар.
    const speed = Math.hypot(p.vx, p.vy);
    this.bobPhase += dtSec * (4 + speed / 30);
    const bob = Math.min(1, speed / 300) * Math.sin(this.bobPhase) * 0.06;
    this.squashAmount *= Math.exp(-dtSec * 10);
    const sq = this.squashAmount * Math.cos(this.bobPhase * 3); // „желе“ трептене
    const s = p.radius / BODY_TEX_RADIUS;
    this.body.setScale(s * (1 + bob + sq), s * (1 - bob - sq));

    // Бяло премигване.
    if (this.flashLeft > 0) {
      this.flashLeft -= dtSec;
      this.body.setTintFill(0xffffff);
      if (this.flashLeft <= 0) this.body.setTint(this.color);
    }

    // Следа („призраци“) по време на дъш.
    if (p.abilityTime > 0 && p.ability === 'dash') {
      this.trailTimer -= dtSec;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.025;
        this.spawnGhost(x, y, s);
      }
    }

    // Звездички над главата при замайване.
    const stunned = p.stun > 0;
    this.starPhase += dtSec * 7;
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i]!;
      star.setVisible(stunned);
      if (!stunned) continue;
      const a = this.starPhase + (i * Math.PI * 2) / this.stars.length;
      star.setPosition(Math.cos(a) * p.radius * 0.8, -p.radius * 0.9 + Math.sin(a) * p.radius * 0.25);
    }
  }

  private spawnGhost(x: number, y: number, scale: number): void {
    const ghost = this.scene.add
      .image(x, y, 'body')
      .setTint(this.color)
      .setScale(scale)
      .setAlpha(0.45)
      .setDepth(y - 1);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: scale * 0.7,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }

  /** Падане: смаляване, избледняване и „зад“ платформата. */
  private updateFalling(p: Player, cfg: Balance): void {
    const t = Math.min(1, p.fallTime / cfg.arena.fallDuration);
    this.container.setScale(1 - t * 0.75);
    this.container.setAlpha(1 - t);
    this.container.setDepth(t > 0.12 ? LAYERS.fallen : LAYERS.effects - 1);
    this.label.setVisible(false);
    for (const s of this.stars) s.setVisible(false);
    this.container.setVisible(t < 1);
  }

  destroy(): void {
    this.container.destroy();
  }
}
