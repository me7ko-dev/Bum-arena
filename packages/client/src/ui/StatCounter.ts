import type Phaser from 'phaser';
import { ATLAS } from '../assets';
import { FONT_FAMILY } from '../theme';

/**
 * Малък брояч в HUD: иконка + число, с „подскок“, когато стойността се промени.
 */
export class StatCounter {
  readonly container: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private value = Number.NaN;
  private bump = 0;

  constructor(scene: Phaser.Scene, iconKey: string, iconScale: number, color = '#ffffff') {
    const bg = scene.add.graphics();
    bg.fillStyle(0x2a1650, 0.65);
    bg.fillRoundedRect(-24, -22, 120, 44, 22);
    const icon = scene.add.image(0, 0, ATLAS, iconKey).setScale(iconScale);
    this.text = scene.add
      .text(26, 0, '0', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        fontStyle: '900',
        color,
        stroke: '#2a1650',
        strokeThickness: 5,
      })
      .setOrigin(0, 0.5);
    this.container = scene.add.container(0, 0, [bg, icon, this.text]);
  }

  set(v: number): void {
    if (v === this.value) return;
    if (!Number.isNaN(this.value)) this.bump = 1;
    this.value = v;
    this.text.setText(String(v));
  }

  update(dtSec: number): void {
    this.bump = Math.max(0, this.bump - dtSec * 5);
    this.text.setScale(1 + this.bump * 0.35);
  }
}
