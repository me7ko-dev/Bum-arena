import Phaser from 'phaser';
import { ATLAS } from '../assets';
import { FONT_FAMILY } from '../theme';

/**
 * Бутон от магазина в рунда: иконка + цена. Сив, когато нямаш достатъчно монети.
 */
export class ShopButton {
  readonly container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private price: Phaser.GameObjects.Text;
  private keyHint: Phaser.GameObjects.Text;
  private affordable: boolean | null = null;
  private pulse = 0;

  constructor(
    scene: Phaser.Scene,
    private radius: number,
    iconFrame: string,
    price: number,
    key: string,
    onBuy: () => void,
  ) {
    this.bg = scene.add.graphics();
    this.icon = scene.add.image(0, -3, ATLAS, iconFrame).setScale((radius * 1.3) / 128);
    this.price = scene.add
      .text(0, radius - 4, String(price), {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        fontStyle: '900',
        color: '#ffd23f',
        stroke: '#2a1650',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.keyHint = scene.add
      .text(-radius + 2, -radius + 2, key, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.container = scene.add.container(0, 0, [this.bg, this.icon, this.price, this.keyHint]);
    this.container.setInteractive(new Phaser.Geom.Circle(0, 0, radius + 6), Phaser.Geom.Circle.Contains);
    this.container.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.container.setScale(0.9);
      onBuy();
    });
    this.container.on(Phaser.Input.Events.POINTER_UP, () => this.container.setScale(1));
    this.container.on(Phaser.Input.Events.POINTER_OUT, () => this.container.setScale(1));
  }

  setKeyHintVisible(v: boolean): void {
    this.keyHint.setVisible(v);
  }

  /** Кратка анимация „купено“. */
  flash(): void {
    this.pulse = 1;
  }

  update(canAfford: boolean, active: boolean, dtSec: number): void {
    if (canAfford !== this.affordable) {
      this.affordable = canAfford;
      const g = this.bg;
      g.clear();
      g.fillStyle(0x2a1650, 0.85);
      g.fillCircle(0, 0, this.radius + 4);
      g.fillStyle(canAfford ? 0x845ef7 : 0x4a3d66, 1);
      g.fillCircle(0, 0, this.radius);
      this.icon.setAlpha(canAfford ? 1 : 0.45);
      this.price.setColor(canAfford ? '#ffd23f' : '#9c8fbf');
    }
    this.pulse = Math.max(0, this.pulse - dtSec * 3);
    // Активният баф леко „диша“.
    const breathe = active ? 0.06 * Math.sin(performance.now() / 120) : 0;
    this.icon.setScale(((this.radius * 1.3) / 128) * (1 + this.pulse * 0.4 + breathe));
  }
}
