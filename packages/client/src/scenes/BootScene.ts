import Phaser from 'phaser';
import { COLORS } from '../theme';

/**
 * Генерира всички текстури с код (прости форми) – без външни файлове.
 * Когато играта стане забавна, тук ще се зареждат истински спрайтове (Kenney CC0 и др.).
 *
 * Текстурите са бели/сиви, за да могат да се оцветяват с tint.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeBody();
    this.makeEyes();
    this.makeShadow();
    this.makeDot();
    this.scene.start('Game');
  }

  /** Тяло на човечето: тъмен контур + бяло тяло + отблясък. Размер 128×128 (радиус 64). */
  private makeBody(): void {
    const g = this.add.graphics();
    const r = 64;
    g.fillStyle(COLORS.outline, 1);
    g.fillCircle(r, r, r);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(r, r, r - 9);
    // по-тъмна долна част за обем
    g.fillStyle(0xdedede, 1);
    g.slice(r, r, r - 9, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.fillPath();
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(r, r - 6, (r - 9) * 2, (r - 14) * 2);
    // бузки
    g.fillStyle(0xffb3c1, 0.9);
    g.fillCircle(r - 34, r + 14, 8);
    g.fillCircle(r + 34, r + 14, 8);
    g.generateTexture('body', r * 2, r * 2);
    g.destroy();
  }

  /** Очи – отделен спрайт, за да „гледат“ натам, накъдето върви човечето. */
  private makeEyes(): void {
    const g = this.add.graphics();
    const w = 80;
    const h = 44;
    for (const cx of [20, 60]) {
      g.fillStyle(COLORS.outline, 1);
      g.fillEllipse(cx, 22, 30, 38);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(cx, 22, 24, 32);
      g.fillStyle(COLORS.outline, 1);
      g.fillCircle(cx + 2, 25, 8);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx + 5, 20, 3);
    }
    g.generateTexture('eyes', w, h);
    g.destroy();
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
}
