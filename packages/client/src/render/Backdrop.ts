import Phaser from 'phaser';
import { LAYERS } from './layers';

/**
 * Фон около арената: звездно небе (повтаряща се текстура с паралакс)
 * и няколко бавно плуващи облачета. Без логика – само атмосфера.
 */
export class Backdrop {
  private stars: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Image[] = [];
  private time = 0;

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists('starfield')) makeStarfield(scene);
    if (!scene.textures.exists('cloud')) makeCloud(scene);
    const { width, height } = scene.scale;
    this.stars = scene.add
      .tileSprite(0, 0, width, height, 'starfield')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(LAYERS.floor - 100);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 1500 + (i % 3) * 260;
      const c = scene.add
        .image(Math.cos(a) * r, Math.sin(a) * r, 'cloud')
        .setAlpha(0.13)
        .setScale(2 + (i % 3) * 0.7)
        .setDepth(LAYERS.floor - 50);
      this.clouds.push(c);
    }
  }

  update(dtSec: number): void {
    this.time += dtSec;
    const cam = this.scene.cameras.main;
    const { width, height } = this.scene.scale;
    // Phaser отчита зуума: TileSprite с scrollFactor 0 трябва да покрива целия екран.
    this.stars.setSize(width / cam.zoom + 4, height / cam.zoom + 4);
    this.stars.setPosition((width - width / cam.zoom) / 2 - 2, (height - height / cam.zoom) / 2 - 2);
    this.stars.tilePositionX = cam.scrollX * 0.15 + this.time * 6;
    this.stars.tilePositionY = cam.scrollY * 0.15;
    this.clouds.forEach((c, i) => (c.x += dtSec * (8 + i * 2)));
  }
}

/** Тъмно небе със звездички в различни размери и цветове. */
function makeStarfield(scene: Phaser.Scene): void {
  const size = 512;
  const g = scene.add.graphics();
  g.fillStyle(0x1b1033, 1);
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const colors = [0xffffff, 0xffd23f, 0xa5d8ff, 0xf783ac];
  for (let i = 0; i < 90; i++) {
    g.fillStyle(colors[i % colors.length]!, 0.3 + rnd() * 0.6);
    g.fillCircle(rnd() * size, rnd() * size, 0.8 + rnd() * 2.2);
  }
  g.generateTexture('starfield', size, size);
  g.destroy();
}

function makeCloud(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  for (const [x, y, r] of [
    [60, 70, 40],
    [100, 55, 50],
    [145, 70, 38],
    [100, 85, 40],
  ] as const) {
    g.fillCircle(x, y, r);
  }
  g.generateTexture('cloud', 200, 130);
  g.destroy();
}
