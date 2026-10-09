import type Phaser from 'phaser';
import { FONT_FAMILY } from '../theme';

/** Цвят на всяка цифра: 3 – розово-червено, 2 – жълто, 1 – зелено, БУМ! – злато. */
const COLORS: Record<number, { css: string; hex: number }> = {
  3: { css: '#ff5d73', hex: 0xff5d73 },
  2: { css: '#ffd23f', hex: 0xffd23f },
  1: { css: '#8ce99a', hex: 0x8ce99a },
  0: { css: '#ffd23f', hex: 0xffd23f },
};
const BURST = [0xff5d73, 0xffd23f, 0x4dabf7, 0x8ce99a, 0xb197fc, 0xff922b];

/**
 * Голямото отброяване в центъра: 3 – 2 – 1 – БУМ!
 * Всяка цифра „пада“ с пружиниране и наклон, зад нея се разширява цветен пръстен
 * и се разлитат точици; на „БУМ!“ – двоен пръстен, конфети и бяло проблясване.
 */
export class CountdownFx {
  private text: Phaser.GameObjects.Text;
  private flash: Phaser.GameObjects.Rectangle;
  private x = 0;
  private y = 0;
  private size = 120;

  constructor(private scene: Phaser.Scene) {
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '120px',
        fontStyle: '900',
        color: '#ffd23f',
        stroke: '#2a1650',
        strokeThickness: 16,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(50);
    this.text.setShadow(0, 10, '#2a1650', 0, true, true);
    this.flash = scene.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0).setAlpha(0).setDepth(49);
  }

  layout(width: number, height: number): void {
    this.x = width / 2;
    this.y = height * 0.38;
    this.size = Math.round(Math.min(150, Math.min(width, height) * 0.34));
    this.text.setPosition(this.x, this.y).setFontSize(this.size);
    this.flash.setSize(width, height);
  }

  /** n = 3, 2, 1 или 0 (= „БУМ!“). */
  show(n: number, label: string): void {
    const s = this.scene;
    const col = COLORS[Math.max(0, Math.min(3, n))]!;
    const big = n === 0;
    s.tweens.killTweensOf(this.text);
    this.text
      .setText(label)
      .setColor(col.css)
      .setStroke('#2a1650', big ? 18 : 16)
      .setAlpha(1)
      .setScale(big ? 0.4 : 2.3)
      .setAngle(big ? 0 : (n % 2 ? -10 : 10));
    this.text.y = this.y - (big ? 0 : 40);
    s.tweens.add({ targets: this.text, scale: big ? 1.15 : 1, angle: 0, y: this.y, duration: big ? 520 : 420, ease: big ? 'Elastic.easeOut' : 'Back.easeOut', easeParams: big ? [1.1, 0.5] : undefined });
    s.tweens.add({ targets: this.text, scale: big ? 1.6 : 0.6, alpha: 0, delay: big ? 650 : 720, duration: big ? 300 : 200, ease: 'Cubic.easeIn' });

    this.ring(col.hex, 0, big ? 5 : 3.2);
    if (big) {
      this.ring(0xffffff, 90, 6);
      this.ring(0xff5d73, 180, 7);
      this.flash.setAlpha(0.45);
      s.tweens.add({ targets: this.flash, alpha: 0, duration: 380, ease: 'Cubic.easeOut' });
    }
    this.dots(big ? 26 : 10, big ? BURST : [col.hex, 0xffffff], big ? 340 : 190);
  }

  private ring(color: number, delay: number, to: number): void {
    const s = this.scene;
    const r = s.add.image(this.x, this.y, 'ring').setTint(color).setScale(0.5).setAlpha(0).setDepth(48);
    s.tweens.add({
      targets: r,
      scale: (to * this.size) / 120,
      alpha: { from: 0.95, to: 0 },
      delay,
      duration: 560,
      ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    });
  }

  private dots(count: number, colors: number[], dist: number): void {
    const s = this.scene;
    const k = this.size / 120;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = dist * k * (0.7 + Math.random() * 0.5);
      const dot = s.add
        .image(this.x, this.y, 'dot')
        .setTint(colors[i % colors.length]!)
        .setScale((0.25 + Math.random() * 0.3) * k)
        .setDepth(48);
      s.tweens.add({
        targets: dot,
        x: this.x + Math.cos(a) * d,
        y: this.y + Math.sin(a) * d,
        scale: 0.05,
        alpha: 0,
        duration: 520 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }
}
