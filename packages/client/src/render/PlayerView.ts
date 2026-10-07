import Phaser from 'phaser';
import type { Balance, Player } from '@bum/shared';
import { ATLAS, CAR_FRAMES } from '../assets';
import { FONT_FAMILY, playerColor } from '../theme';
import { LAYERS } from './layers';

/** Кадрите в атласа са 128 px; емоджито запълва ~88% от кадъра. */
const FACE_FRAME = 128;
const FACE_FILL = 0.88;
const CAR_FRAME = 192;
const STAR_COUNT = 3;

/**
 * Визуално представяне на едно човече: сянка, мордочка (скин), кола, корона,
 * ефекти (лед, щит, магнит, баф иконки), име. Само чете Player и рисува.
 */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  readonly color: number;
  private shadow: Phaser.GameObjects.Image;
  private car: Phaser.GameObjects.Image;
  private face: Phaser.GameObjects.Image;
  private ice: Phaser.GameObjects.Image;
  private fx: Phaser.GameObjects.Graphics;
  private crown: Phaser.GameObjects.Image;
  private buffIcons: Phaser.GameObjects.Image[];
  private label: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Image[] = [];

  private bobPhase = Math.random() * Math.PI * 2;
  private time = 0;
  /** Плавно показван радиус (гигант/размер растат плавно). */
  private shownRadius: number;
  private squashAmount = 0;
  private flashLeft = 0;
  private trailTimer = 0;
  private carDir = 1;

  constructor(
    private scene: Phaser.Scene,
    p: Player,
    private isMe: boolean,
  ) {
    this.color = playerColor(p.colorIndex);
    this.shadow = scene.add.image(0, 0, 'shadow');
    this.fx = scene.add.graphics();
    this.car = scene.add.image(0, 0, ATLAS, CAR_FRAMES[0]).setVisible(false);
    this.face = scene.add.image(0, 0, ATLAS, p.skin || 'skin_fox');
    this.ice = scene.add.image(0, 0, ATLAS, 'ice').setAlpha(0.75).setVisible(false);
    this.crown = scene.add.image(0, 0, ATLAS, 'crown').setVisible(false);
    this.buffIcons = ['glove', 'shoe', 'mushroom'].map((f) => scene.add.image(0, 0, ATLAS, f).setScale(0.2).setVisible(false));
    this.label = scene.add
      .text(0, 0, p.name, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: '900',
        color: isMe ? '#ffd23f' : '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push(scene.add.image(0, 0, ATLAS, 'star').setScale(0.16).setVisible(false));
    }
    this.container = scene.add.container(p.x, p.y, [
      this.shadow,
      this.fx,
      this.car,
      this.face,
      this.ice,
      this.crown,
      ...this.buffIcons,
      this.label,
      ...this.stars,
    ]);
    this.shownRadius = p.radius;
  }

  /** Ефект при удар: сплескване + бяло премигване. */
  hitReact(strength: number): void {
    this.squashAmount = Math.max(this.squashAmount, 0.12 + strength * 0.25);
    this.flashLeft = 0.06 + strength * 0.06;
  }

  update(p: Player, alpha: number, dtSec: number, cfg: Balance, hasCrown: boolean): void {
    this.time += dtSec;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    this.container.setPosition(x, y);

    if (!p.alive) {
      this.updateFalling(p, cfg);
      return;
    }
    this.container.setDepth(y);
    this.container.setScale(1).setAlpha(1);

    // Радиусът расте/се свива плавно (гигант, размер, кола).
    this.shownRadius += (p.radius - this.shownRadius) * Math.min(1, dtSec * 10);
    const r = this.shownRadius;

    // Подскачане при ходене + сплескване при удар.
    const speed = Math.hypot(p.vx, p.vy);
    this.bobPhase += dtSec * (4 + speed / 30);
    const bob = Math.min(1, speed / 300) * Math.sin(this.bobPhase) * 0.06;
    this.squashAmount *= Math.exp(-dtSec * 10);
    const sq = this.squashAmount * Math.cos(this.bobPhase * 3);

    this.shadow.setPosition(0, r * 0.7).setScale((r * 2.1) / 128, (r * 0.75) / 48);

    let headY: number;
    if (p.inCar) {
      // Кола: странично изображение, обръща се според посоката.
      if (Math.abs(p.vx) > 30) this.carDir = p.vx > 0 ? 1 : -1;
      const carW = r * 2.7;
      const cs = carW / CAR_FRAME;
      this.car
        .setVisible(true)
        .setFrame(CAR_FRAMES[p.carKind % CAR_FRAMES.length]!)
        .setFlipX(this.carDir > 0)
        .setScale(cs * (1 + sq), cs * (1 - sq))
        .setPosition(0, Math.sin(this.bobPhase * 2) * 1.5);
      const faceD = cfg.player.radius * 1.5;
      this.face.setScale(faceD / (FACE_FRAME * FACE_FILL)).setPosition(-this.carDir * r * 0.12, -r * 0.62);
      this.face.setFlipX(this.carDir < 0);
      headY = -r * 0.62 - faceD / 2;
    } else {
      this.car.setVisible(false);
      const faceD = r * 2.1;
      const s = faceD / (FACE_FRAME * FACE_FILL);
      // Леко накланяне по посоката на движение – изглежда живо.
      const tilt = Phaser.Math.Clamp(p.vx / 2000, -0.18, 0.18);
      this.face.setScale(s * (1 + bob + sq), s * (1 - bob - sq)).setPosition(0, 0).setRotation(tilt);
      if (Math.abs(p.vx) > 40) this.face.setFlipX(p.vx > 0);
      headY = -r;
    }

    // Бяло премигване при удар.
    if (this.flashLeft > 0) {
      this.flashLeft -= dtSec;
      this.face.setTintFill(0xffffff);
      this.car.setTintFill(0xffffff);
      if (this.flashLeft <= 0) {
        this.face.clearTint();
        this.car.clearTint();
      }
    }

    // Лед при замразяване.
    this.ice.setVisible(p.frozen > 0);
    if (p.frozen > 0) {
      const iceD = r * 2.5;
      this.ice.setScale(iceD / FACE_FRAME).setPosition(0, 0);
      this.face.setTint(0x9fdcff);
    } else if (this.flashLeft <= 0) {
      this.face.clearTint();
    }

    this.drawFx(p, cfg, r);

    // Корона.
    this.crown.setVisible(hasCrown);
    if (hasCrown) {
      this.crown.setScale(0.36).setPosition(0, headY - 18 + Math.sin(this.time * 4) * 3);
      headY -= 34;
    }

    // Иконки на активните бафове над главата.
    const active = [p.buffMega > 0, p.buffSpeed > 0, p.buffSize > 0];
    const shown = active.filter(Boolean).length;
    let k = 0;
    this.buffIcons.forEach((icon, i) => {
      icon.setVisible(active[i]!);
      if (!active[i]) return;
      icon.setPosition((k - (shown - 1) / 2) * 24, headY - 14);
      k++;
    });
    if (shown > 0) headY -= 26;

    this.label.setPosition(0, headY - 14);

    // Лента за живота на колата.
    if (p.inCar) {
      const w = r * 1.6;
      const frac = Phaser.Math.Clamp(p.carHp / cfg.cars.hp, 0, 1);
      const yBar = r * 0.95;
      this.fx.fillStyle(0x2a1650, 0.85);
      this.fx.fillRoundedRect(-w / 2 - 3, yBar - 3, w + 6, 12, 6);
      this.fx.fillStyle(frac > 0.5 ? 0x8ce99a : frac > 0.25 ? 0xffd23f : 0xff5d73, 1);
      this.fx.fillRoundedRect(-w / 2, yBar, w * frac, 6, 3);
    }

    // Следа („призраци“) при дъш.
    if (p.abilityTime > 0 && p.ability === 'dash' && !p.inCar) {
      this.trailTimer -= dtSec;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.025;
        this.spawnGhost(x, y, this.face.scaleX);
      }
    }

    // Звездички при замайване.
    const stunned = p.stun > 0;
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i]!;
      star.setVisible(stunned);
      if (!stunned) continue;
      const a = this.time * 7 + (i * Math.PI * 2) / this.stars.length;
      star.setPosition(Math.cos(a) * r * 0.85, -r * 0.95 + Math.sin(a) * r * 0.25);
    }
  }

  /** Щит (балон), магнит (пулсиращ кръг), гигант (сияние), „аз“ (пръстен под мен). */
  private drawFx(p: Player, cfg: Balance, r: number): void {
    const g = this.fx;
    g.clear();
    if (this.isMe && !p.inCar) {
      g.lineStyle(4, 0xffd23f, 0.85);
      g.strokeEllipse(0, r * 0.72, r * 2.2, r * 0.8);
    }
    if (p.immune) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 10);
      g.fillStyle(0x74c0fc, 0.18 + pulse * 0.08);
      g.fillCircle(0, 0, r * 1.35);
      g.lineStyle(4, 0xa5d8ff, 0.7 + pulse * 0.3);
      g.strokeCircle(0, 0, r * 1.35);
    }
    if (p.ability === 'magnet' && p.abilityTime > 0 && !p.inCar) {
      const R = cfg.abilities.magnet.radius;
      const phase = (this.time * 1.6) % 1;
      g.lineStyle(6, 0xff6b6b, 0.5 * (1 - phase));
      g.strokeCircle(0, 0, R * (1 - phase) + r);
      g.lineStyle(3, 0xff8787, 0.25);
      g.strokeCircle(0, 0, R);
    }
    if (p.ability === 'giant' && p.abilityTime > 0 && !p.inCar) {
      g.lineStyle(6, 0xffd23f, 0.35 + 0.25 * Math.sin(this.time * 12));
      g.strokeCircle(0, 0, r * 1.12);
    }
  }

  private spawnGhost(x: number, y: number, scale: number): void {
    const ghost = this.scene.add
      .image(x, y, ATLAS, this.face.frame.name)
      .setScale(scale)
      .setAlpha(0.4)
      .setFlipX(this.face.flipX)
      .setDepth(y - 1);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: scale * 0.7,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }

  /** Падане: смаляване, въртене, избледняване и „зад“ платформата. */
  private updateFalling(p: Player, cfg: Balance): void {
    const t = Math.min(1, p.fallTime / cfg.arena.fallDuration);
    this.container.setScale(1 - t * 0.75);
    this.container.setAlpha(1 - t);
    this.face.setRotation(t * 6);
    this.container.setDepth(t > 0.12 ? LAYERS.fallen : LAYERS.effects - 1);
    this.label.setVisible(false);
    this.crown.setVisible(false);
    this.fx.clear();
    for (const s of this.stars) s.setVisible(false);
    for (const b of this.buffIcons) b.setVisible(false);
    this.container.setVisible(t < 1);
  }

  destroy(): void {
    this.container.destroy();
  }
}
