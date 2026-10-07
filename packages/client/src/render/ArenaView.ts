import type Phaser from 'phaser';
import type { Arena } from '@bum/shared';
import { COLORS } from '../theme';

/**
 * Рисува кръглата арена. Прерисува се само когато радиусът се промени.
 */
export class ArenaView {
  private floor: Phaser.GameObjects.Graphics;
  private lastRadius = -1;

  constructor(scene: Phaser.Scene) {
    this.floor = scene.add.graphics().setDepth(-10);
  }

  update(arena: Arena): void {
    if (Math.abs(arena.radius - this.lastRadius) < 0.5) return;
    this.lastRadius = arena.radius;
    this.draw(arena);
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
