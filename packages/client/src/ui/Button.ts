import Phaser from 'phaser';
import { FONT_FAMILY } from '../theme';
import { uiClick, uiHover } from '../audio/Sfx';

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
}

/**
 * Обикновен закръглен бутон, който работи с мишка и пръст.
 */
export class Button {
  readonly container: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, label: string, onClick: () => void, opts: ButtonOptions = {}) {
    const w = opts.width ?? 220;
    const h = opts.height ?? 64;
    const color = opts.color ?? 0xff5d73;
    const bg = scene.add.graphics();
    bg.fillStyle(0x2a1650, 1);
    bg.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h / 2);
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.fillStyle(0xffffff, 0.2);
    bg.fillRoundedRect(-w / 2 + 10, -h / 2 + 6, w - 20, h * 0.35, h * 0.2);
    this.text = scene.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: `${opts.fontSize ?? 28}px`,
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.container = scene.add.container(0, 0, [bg, this.text]);
    this.container.setSize(w, h + 6);
    this.container.setInteractive({ useHandCursor: true });
    this.container.on(Phaser.Input.Events.POINTER_DOWN, () => this.container.setScale(0.94));
    this.container.on(Phaser.Input.Events.POINTER_OVER, (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) uiHover();
    });
    this.container.on(Phaser.Input.Events.POINTER_OUT, () => this.container.setScale(1));
    this.container.on(Phaser.Input.Events.POINTER_UP, () => {
      this.container.setScale(1);
      uiClick();
      onClick();
    });
  }

  setLabel(label: string): void {
    this.text.setText(label);
  }
}
