import Phaser from 'phaser';
import type { AbilityId } from '@bum/shared';
import { FONT_FAMILY } from '../theme';

/**
 * Кръгъл бутон за суперсила с презареждане (часовник) и иконка.
 * На компютър показва клавиша, на телефон се натиска с пръст.
 */
export class AbilityButton {
  readonly container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Graphics;
  private pie: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private keyHint: Phaser.GameObjects.Text;
  private readyPulse = 0;
  private wasReady = true;
  /** Натиснат ли е с пръст в момента. */
  pressed = false;

  constructor(
    scene: Phaser.Scene,
    private radius: number,
    ability: AbilityId,
    keyHint: string,
  ) {
    this.bg = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.pie = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(radius * 0.7)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.keyHint = scene.add
      .text(0, radius + 16, keyHint, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.container = scene.add.container(0, 0, [this.bg, this.icon, this.pie, this.label, this.keyHint]);
    this.drawBg(true);
    this.drawIcon(ability);
  }

  setKeyHintVisible(v: boolean): void {
    this.keyHint.setVisible(v);
  }

  private drawBg(ready: boolean): void {
    const r = this.radius;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x2a1650, 0.85);
    g.fillCircle(0, 0, r + 6);
    g.fillStyle(ready ? 0xff5d73 : 0x6b5a8e, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(0, -r * 0.35, r * 1.4, r * 0.8);
  }

  /** Иконките са нарисувани с прости форми. */
  private drawIcon(ability: AbilityId): void {
    const g = this.icon;
    const r = this.radius;
    g.clear();
    g.lineStyle(r * 0.16, 0xffffff, 1);
    if (ability === 'dash') {
      // „>>“ – две стрелки
      for (const off of [-r * 0.22, r * 0.22]) {
        g.beginPath();
        g.moveTo(off - r * 0.2, -r * 0.35);
        g.lineTo(off + r * 0.2, 0);
        g.lineTo(off - r * 0.2, r * 0.35);
        g.strokePath();
      }
    }
  }

  /**
   * @param cooldownLeft оставащо презареждане (сек)
   * @param cooldownTotal пълно презареждане (сек)
   * @returns true ако току-що е станала готова (за звук)
   */
  update(cooldownLeft: number, cooldownTotal: number, dtSec: number): boolean {
    const ready = cooldownLeft <= 0;
    const becameReady = ready && !this.wasReady;
    if (ready !== this.wasReady) this.drawBg(ready);
    this.wasReady = ready;

    const g = this.pie;
    g.clear();
    if (!ready) {
      const frac = Phaser.Math.Clamp(cooldownLeft / cooldownTotal, 0, 1);
      g.fillStyle(0x000000, 0.45);
      g.slice(0, 0, this.radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
      g.fillPath();
      this.label.setText(cooldownLeft >= 1 ? String(Math.ceil(cooldownLeft)) : cooldownLeft.toFixed(1));
      this.icon.setAlpha(0.35);
    } else {
      this.label.setText('');
      this.icon.setAlpha(1);
    }

    if (becameReady) this.readyPulse = 1;
    this.readyPulse = Math.max(0, this.readyPulse - dtSec * 4);
    const press = this.pressed ? 0.9 : 1;
    this.container.setScale(press * (1 + this.readyPulse * 0.18));
    return becameReady;
  }
}
