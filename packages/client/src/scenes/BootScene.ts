import Phaser from 'phaser';
import { ATLAS } from '../assets';

/**
 * Зарежда атласа със спрайтовете (Fluent Emoji 3D) и шрифта,
 * и генерира няколко помощни текстури с код (сянка, частица, пръстен).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.atlas(ATLAS, `${base}assets/sprites.webp`, `${base}assets/sprites.json`);
  }

  create(): void {
    this.makeShadow();
    this.makeDot();
    this.makeRing();
    // Шрифтът трябва да е зареден, преди Phaser да рисува текст с него.
    const fonts = document.fonts;
    const ready = fonts
      ? Promise.all([fonts.load('900 20px Nunito'), fonts.load('800 20px Nunito')]).catch(() => undefined)
      : Promise.resolve();
    void ready.then(() => this.game.events.emit('boot-ready'));
  }

  private makeShadow(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(64, 24, 128, 48);
    g.generateTexture('shadow', 128, 48);
    g.destroy();
  }

  /** Бяла точка – за частици. */
  private makeDot(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(16, 16, 16);
    g.generateTexture('dot', 32, 32);
    g.destroy();
  }

  /** Пръстен – ударна вълна. */
  private makeRing(): void {
    const g = this.add.graphics();
    g.lineStyle(8, 0xffffff, 1);
    g.strokeCircle(64, 64, 58);
    g.generateTexture('ring', 128, 128);
    g.destroy();
  }
}
