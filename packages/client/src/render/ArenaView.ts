import type Phaser from 'phaser';
import type { Arena } from '@bum/shared';
import { COLORS } from '../theme';

/**
 * Рисува кръглата арена. Прерисува се само когато радиусът се промени.
 */
export class ArenaView {
  private floor: Phaser.GameObjects.Graphics;
  /** Опасната зона (ще изчезне при свиването) – рисува се всеки кадър, докато има предупреждение. */
  private danger: Phaser.GameObjects.Graphics;
  private lastRadius = -1;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.floor = scene.add.graphics().setDepth(-10);
    this.danger = scene.add.graphics().setDepth(-9);
  }

  /**
   * @param warnSeconds от колко секунди преди свиване да се показва опасната зона
   * @param active дали рундът тече (извън него опасна зона не се показва)
   */
  update(arena: Arena, dtSec: number, warnSeconds: number, active: boolean): void {
    this.time += dtSec;
    if (Math.abs(arena.radius - this.lastRadius) >= 0.5) {
      this.lastRadius = arena.radius;
      this.draw(arena);
    }
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

  private draw(arena: Arena): void {
    const g = this.floor;
    const r = arena.radius;
    g.clear();
    // „Сянка“ под ръба – създава усещане за платформа над пропаст.
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(arena.x, arena.y + 26, r + 6);
    // Ръб (страничната стена на платформата).
    g.fillStyle(COLORS.arenaRim, 1);
    g.fillCircle(arena.x, arena.y + 14, r);
    // Под.
    g.fillStyle(COLORS.arenaFloor, 1);
    g.fillCircle(arena.x, arena.y, r);
    // Концентрични пръстени за ориентация и усещане за скорост.
    g.lineStyle(10, COLORS.arenaFloorAlt, 1);
    for (let rr = 150; rr < r - 30; rr += 150) g.strokeCircle(arena.x, arena.y, rr);
    // Светъл ръб.
    g.lineStyle(10, COLORS.arenaEdge, 1);
    g.strokeCircle(arena.x, arena.y, r - 5);
  }
}
