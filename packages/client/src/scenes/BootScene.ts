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
    this.makeRing();
    this.makeStar();
    this.makeCoin();
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

  /** Пръстен – ударна вълна. */
  private makeRing(): void {
    const g = this.add.graphics();
    g.lineStyle(8, 0xffffff, 1);
    g.strokeCircle(64, 64, 58);
    g.generateTexture('ring', 128, 128);
    g.destroy();
  }

  /** Монета: златна с контур, вътрешен кръг и отблясък. 40×40. */
  private makeCoin(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.outline, 1);
    g.fillCircle(20, 20, 20);
    g.fillStyle(0xf5a524, 1);
    g.fillCircle(20, 20, 16);
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(20, 19, 13);
    g.lineStyle(3, 0xf5a524, 1);
    g.strokeCircle(20, 19, 8);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(14, 13, 6, 4);
    g.generateTexture('coin', 40, 40);
    g.destroy();
  }

  /** Звездичка – за замайване. */
  private makeStar(): void {
    const g = this.add.graphics();
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 15 : 6.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(16 + Math.cos(a) * r, 16 + Math.sin(a) * r));
    }
    g.fillStyle(COLORS.outline, 1);
    g.fillPoints(pts.map((p) => new Phaser.Math.Vector2(16 + (p.x - 16) * 1.25, 16 + (p.y - 16) * 1.25)), true);
    g.fillStyle(0xffe066, 1);
    g.fillPoints(pts, true);
    g.generateTexture('star', 32, 32);
    g.destroy();
  }
}
