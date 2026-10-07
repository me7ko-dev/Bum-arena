import type Phaser from 'phaser';
import type { Arena } from '@bum/shared';
import { COLORS } from '../theme';
import { LAYERS } from './layers';

/** Размер на изпечената текстура на пода и радиусът на арената в нея. */
const TEX_SIZE = 1024;
const TEX_R = 470;
const TEX_KEY = 'arenaFloor';

/**
 * Рисува кръглата арена и опасната зона преди свиване.
 */
export class ArenaView {
  /**
   * Подът е изпечен веднъж в текстура и само се мащабира при свиване.
   * (Голяма Graphics фигура се преизчислява всеки кадър и тежи на телефон.)
   */
  readonly floor: Phaser.GameObjects.Image;
  /** Опасната зона (ще изчезне при свиването) – рисува се само докато има предупреждение. */
  private danger: Phaser.GameObjects.Graphics;
  private time = 0;

  constructor(scene: Phaser.Scene, startRadius: number) {
    if (!scene.textures.exists(TEX_KEY)) bakeFloor(scene, startRadius);
    this.floor = scene.add.image(0, 0, TEX_KEY).setDepth(LAYERS.floor);
    this.danger = scene.add.graphics().setDepth(LAYERS.danger);
  }

  /**
   * @param warnSeconds от колко секунди преди свиване да се показва опасната зона
   * @param active дали рундът тече (извън него опасна зона не се показва)
   */
  update(arena: Arena, dtSec: number, warnSeconds: number, active: boolean): void {
    this.time += dtSec;
    this.floor.setPosition(arena.x, arena.y).setScale(arena.radius / TEX_R);
    if (active) this.drawDanger(arena, warnSeconds);
    else this.danger.clear();
  }

  /** Червена пулсираща зона между сегашния и бъдещия ръб. */
  private drawDanger(arena: Arena, warnSeconds: number): void {
    const g = this.danger;
    g.clear();
    const warn = arena.shrinking || (arena.shrinkIn >= 0 && arena.shrinkIn <= warnSeconds);
    if (!warn || arena.nextRadius >= arena.radius - 1) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (arena.shrinking ? 14 : 8));
    // Пръстенът е от много четириъгълници – без шевове при всякаква ширина.
    g.fillStyle(0xff3b5c, 0.18 + pulse * 0.22);
    const R = arena.radius;
    const r = arena.nextRadius;
    const SEG = 72;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      g.fillTriangle(arena.x + c0 * R, arena.y + s0 * R, arena.x + c1 * R, arena.y + s1 * R, arena.x + c1 * r, arena.y + s1 * r);
      g.fillTriangle(arena.x + c0 * R, arena.y + s0 * R, arena.x + c1 * r, arena.y + s1 * r, arena.x + c0 * r, arena.y + s0 * r);
    }
    g.lineStyle(6, 0xffffff, 0.5 + pulse * 0.5);
    g.strokeCircle(arena.x, arena.y, arena.nextRadius);
  }

}

/**
 * Рисува пода на арената в текстура (веднъж за цялата игра).
 * Детайлите са в „единици на света“ при начален радиус и се мащабират до TEX_R.
 */
function bakeFloor(scene: Phaser.Scene, startRadius: number): void {
  const k = TEX_R / startRadius; // свят → текстура
  const c = TEX_SIZE / 2;
  const g = scene.add.graphics();
  // „Сянка“ под ръба – платформа над пропаст.
  g.fillStyle(0x000000, 0.35);
  g.fillCircle(c, c + 26 * k, TEX_R + 6 * k);
  // Ръб (страничната стена на платформата).
  g.fillStyle(COLORS.arenaRim, 1);
  g.fillCircle(c, c + 14 * k, TEX_R);
  // Под.
  g.fillStyle(COLORS.arenaFloor, 1);
  g.fillCircle(c, c, TEX_R);
  // Концентрични пръстени за ориентация и усещане за скорост.
  g.lineStyle(10 * k, COLORS.arenaFloorAlt, 1);
  for (let rr = 150; rr < startRadius - 30; rr += 150) g.strokeCircle(c, c, rr * k);
  // Светъл ръб.
  g.lineStyle(10 * k, COLORS.arenaEdge, 1);
  g.strokeCircle(c, c, TEX_R - 5 * k);
  g.generateTexture(TEX_KEY, TEX_SIZE, TEX_SIZE);
  g.destroy();
}
