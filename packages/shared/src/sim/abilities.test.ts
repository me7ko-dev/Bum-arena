import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import { World } from './world';

describe('Дъш', () => {
  it('дава скорост в посоката на движение и минава на презареждане', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg, skipCountdown: true });
    const p = w.addPlayer({ name: 'A' });
    w.step(new Map([[p.id, { mx: 0, my: 1, ability: true }]]));
    expect(p.vy).toBeGreaterThan(cfg.abilities.dash.speed * 0.9);
    expect(p.abilityCooldown).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'ability')).toBe(true);
  });

  it('задържан бутон не повтаря дъша, а след презареждане може пак', () => {
    const cfg = cloneBalance();
    const w = new World({ cfg, skipCountdown: true });
    const p = w.addPlayer({ name: 'A' });
    // В центъра и без посока – за да не изтича от арената по време на теста.
    p.x = p.prevX = 0;
    p.y = p.prevY = 0;
    let dashes = 0;
    const ticks = Math.ceil(cfg.abilities.dash.cooldown * cfg.sim.tickRate) + 5;
    for (let i = 0; i < ticks; i++) {
      w.step(new Map([[p.id, { mx: 0, my: 0, ability: true }]]));
      dashes += w.events.filter((e) => e.type === 'ability').length;
    }
    expect(dashes).toBe(1);
    expect(p.alive).toBe(true);
    w.step(new Map([[p.id, { mx: 0, my: 0, ability: false }]]));
    w.step(new Map([[p.id, { mx: 0, my: 0, ability: true }]]));
    expect(w.events.some((e) => e.type === 'ability')).toBe(true);
  });

  it('замаян играч не може да дъшне', () => {
    const w = new World({ cfg: cloneBalance(), skipCountdown: true });
    const p = w.addPlayer({ name: 'A' });
    p.stun = 1;
    w.step(new Map([[p.id, { mx: 1, my: 0, ability: true }]]));
    expect(p.abilityCooldown).toBe(0);
  });

  it('дъш удар е много по-силен от удар при ходене', () => {
    const push = (dash: boolean) => {
      const w = new World({ cfg: cloneBalance(), skipCountdown: true });
      const a = w.addPlayer({ name: 'A' });
      const b = w.addPlayer({ name: 'B' });
      a.x = a.prevX = -150; a.y = a.prevY = 0; a.vx = 330;
      b.x = b.prevX = 0; b.y = b.prevY = 0;
      for (let i = 0; i < 15; i++) w.step(new Map([[a.id, { mx: 1, my: 0, ability: dash && i === 0 }]]));
      return b.x;
    };
    expect(push(true)).toBeGreaterThan(push(false) * 1.8);
  });
});
