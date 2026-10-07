import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import { World } from './world';

function runTicks(world: World, n: number, input: { mx: number; my: number; ability: boolean }, id: number) {
  for (let i = 0; i < n; i++) world.step(new Map([[id, input]]));
}

describe('Движение', () => {
  it('ускорява до максималната скорост и не я надминава', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg, skipCountdown: true });
    const p = w.addPlayer({ name: 'A' });
    runTicks(w, 60, { mx: 1, my: 0, ability: false }, p.id);
    expect(p.vx).toBeCloseTo(cfg.player.maxSpeed, 0);
    expect(Math.abs(p.vy)).toBeLessThan(1e-6);
  });

  it('спира, когато пуснеш управлението', () => {
    const w = new World({ cfg: cloneBalance(), skipCountdown: true });
    const p = w.addPlayer({ name: 'A' });
    runTicks(w, 30, { mx: 0, my: 1, ability: false }, p.id);
    runTicks(w, 30, { mx: 0, my: 0, ability: false }, p.id);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThan(1);
  });

  it('не приема вход по-дълъг от 1 (защита срещу измама)', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg, skipCountdown: true });
    const p = w.addPlayer({ name: 'A' });
    runTicks(w, 60, { mx: 50, my: 0, ability: false }, p.id);
    expect(p.vx).toBeLessThanOrEqual(cfg.player.maxSpeed + 1e-6);
  });
});

describe('Рунд', () => {
  it('отброяване → игра; по време на отброяването никой не се движи', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg });
    const p = w.addPlayer({ name: 'A' });
    w.addPlayer({ name: 'B' });
    const x0 = p.x;
    const countdownTicks = cfg.round.countdown * cfg.sim.tickRate;
    const counts: number[] = [];
    for (let i = 0; i < countdownTicks; i++) {
      w.step(new Map([[p.id, { mx: 1, my: 0, ability: true }]]));
      for (const e of w.events) if (e.type === 'countdown') counts.push(e.n);
    }
    expect(p.x).toBe(x0);
    expect(w.round.phase).toBe('playing');
    expect(counts).toEqual([3, 2, 1, 0]);
  });

  it('последният оцелял печели', () => {
    const w = new World({ cfg: cloneBalance(), skipCountdown: true });
    const a = w.addPlayer({ name: 'A' });
    const b = w.addPlayer({ name: 'B' });
    b.x = b.prevX = w.arena.radius + 10;
    w.step(new Map());
    expect(w.round.phase).toBe('ended');
    expect(w.round.winnerId).toBe(a.id);
    expect(w.round.endReason).toBe('lastStanding');
  });

  it('при изтекло време печели оцелелият с най-много избутвания', () => {
    const cfg = cloneBalance();
    cfg.round.duration = 1;
    const w = new World({ cfg, skipCountdown: true });
    w.addPlayer({ name: 'A' });
    const b = w.addPlayer({ name: 'B' });
    w.addPlayer({ name: 'C' });
    b.knockouts = 2;
    for (let i = 0; i < cfg.sim.tickRate + 2; i++) w.step(new Map());
    expect(w.round.phase).toBe('ended');
    expect(w.round.winnerId).toBe(b.id);
    expect(w.round.endReason).toBe('timeUp');
  });

  it('арената се свива по етапите от конфига', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg, skipCountdown: true });
    w.addPlayer({ name: 'A' });
    w.addPlayer({ name: 'B' });
    const st = cfg.arena.shrinkStages[0]!;
    const ticks = Math.ceil((st.at + st.over) * cfg.sim.tickRate) + 1;
    let warned = false;
    for (let i = 0; i < ticks; i++) {
      w.step(new Map());
      if (w.events.some((e) => e.type === 'arenaWarning')) warned = true;
    }
    expect(warned).toBe(true);
    expect(w.arena.radius).toBeCloseTo(cfg.arena.startRadius * st.to, 0);
  });
});
