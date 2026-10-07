import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import { World } from './world';

function runTicks(world: World, n: number, input: { mx: number; my: number; ability: boolean }, id: number) {
  for (let i = 0; i < n; i++) world.step(new Map([[id, input]]));
}

describe('Движение', () => {
  it('ускорява до максималната скорост и не я надминава', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg });
    const p = w.addPlayer({ name: 'A' });
    runTicks(w, 60, { mx: 1, my: 0, ability: false }, p.id);
    expect(p.vx).toBeCloseTo(cfg.player.maxSpeed, 0);
    expect(Math.abs(p.vy)).toBeLessThan(1e-6);
  });

  it('спира, когато пуснеш управлението', () => {
    const w = new World({ cfg: cloneBalance() });
    const p = w.addPlayer({ name: 'A' });
    runTicks(w, 30, { mx: 0, my: 1, ability: false }, p.id);
    runTicks(w, 30, { mx: 0, my: 0, ability: false }, p.id);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThan(1);
  });

  it('не приема вход по-дълъг от 1 (защита срещу измама)', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg });
    const p = w.addPlayer({ name: 'A' });
    runTicks(w, 60, { mx: 50, my: 0, ability: false }, p.id);
    expect(p.vx).toBeLessThanOrEqual(cfg.player.maxSpeed + 1e-6);
  });
});
