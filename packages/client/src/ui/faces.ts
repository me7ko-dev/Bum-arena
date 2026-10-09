/**
 * Лицата на героите за HUD-а (лента с избутвания, класиране, подиум):
 * кръгли „значки“, изрязани от 3D снимките на героите. Правят се веднъж за играта
 * (текстурите на Phaser са общи за всички сцени) – от снимките на менюто,
 * а ако още ги няма – рисуваме ги сами (веднъж).
 */
import type Phaser from 'phaser';
import { ATLAS } from '../assets';
import { SKINS } from '../game/settings';
import { getSkinThumbnails } from '../menu/Menu';
import { renderSkinThumbnails } from '../render3d/thumbnails';

/** Размер на текстурата на лицето (px). */
const SIZE = 96;
/** Коя част от снимката 192×192 е главата (x, y, страна). */
const CROP = { x: 30, y: 10, s: 132 };

let started = false;

export const faceKey = (skin: string): string => `face:${skin}`;

/** Започва зареждането на лицата (асинхронно; докато ги няма, ползваме емоджитата от атласа). */
export function ensureFaces(scene: Phaser.Scene): void {
  if (started) return;
  started = true;
  let thumbs = getSkinThumbnails();
  if (!thumbs || thumbs.size === 0) thumbs = renderSkinThumbnails(SKINS);
  const textures = scene.sys.game.textures;
  for (const [skin, url] of thumbs) {
    const img = new Image();
    img.onload = () => {
      const key = faceKey(skin);
      if (!textures.exists(key)) textures.addCanvas(key, drawFace(img, img.width / 192));
    };
    img.src = url;
  }
}

/** Картинка с лицето на героя (или емоджито от атласа като резерва), с размер px. */
export function addFace(scene: Phaser.Scene, skin: string, px: number): Phaser.GameObjects.Image {
  const key = faceKey(skin);
  if (scene.textures.exists(key)) return scene.add.image(0, 0, key).setDisplaySize(px, px);
  const frame = scene.textures.get(ATLAS).has(skin) ? skin : 'star';
  return scene.add.image(0, 0, ATLAS, frame).setDisplaySize(px, px);
}

function drawFace(img: HTMLImageElement, k: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const r = SIZE / 2;
  // Фон – светъл кръг с лек градиент.
  const bg = g.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, '#fff7d6');
  bg.addColorStop(1, '#c9b8ff');
  g.save();
  g.beginPath();
  g.arc(r, r, r - 4, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = bg;
  g.fillRect(0, 0, SIZE, SIZE);
  g.drawImage(img, CROP.x * k, CROP.y * k, CROP.s * k, CROP.s * k, 0, 0, SIZE, SIZE);
  g.restore();
  // Рамка: тъмен контур + бял пръстен (стилът на играта).
  g.lineWidth = 6;
  g.strokeStyle = '#2a1650';
  g.beginPath();
  g.arc(r, r, r - 4, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.arc(r, r, r - 8, 0, Math.PI * 2);
  g.stroke();
  return c;
}
