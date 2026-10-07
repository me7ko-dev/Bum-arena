import Phaser from 'phaser';
import { ATLAS } from '../assets';
import { FONT_FAMILY } from '../theme';

/**
 * Кръгъл бутон за суперсила с презареждане (часовник) и иконка.
 * На компютър показва клавиша, на телефон се натиска с пръст.
 */
export class AbilityButton {
  readonly container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
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
    iconFrame: string,
    keyHint: string,
  ) {
    this.bg = scene.add.graphics();
    this.icon = scene.add.image(0, 0, ATLAS, iconFrame);
    this.pie = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(radius * 0.7)}px`,
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.keyHint = scene.add
      .text(0, radius + 16, keyHint, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.container = scene.add.container(0, 0, [this.bg, this.icon, this.pie, this.label, this.keyHint]);
    // По-голяма зона за натискане от самия кръг – по-лесно с палец.
    this.container.setInteractive(new Phaser.Geom.Circle(0, 0, radius + 22), Phaser.Geom.Circle.Contains);
    this.drawBg(true);
    this.setIcon(iconFrame);
  }

  /** Сменя иконката (напр. в кола бутонът е „слез“). */
  setIcon(frame: string): void {
    if (this.icon.frame.name === frame) return;
    this.icon.setFrame(frame).setScale((this.radius * 1.35) / 128);
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
