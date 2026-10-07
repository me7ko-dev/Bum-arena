import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import { World } from './world';
import type { PlayerInput } from '../input';

/** Слага двама играчи на линия: a вляво, b вдясно. */
function setup() {
  const w = new World({ cfg: cloneBalance(), seed: 3 });
  const a = w.addPlayer({ name: 'A' });
  const b = w.addPlayer({ name: 'B' });
  a.x = a.prevX = -100;
  a.y = a.prevY = 0;
  b.x = b.prevX = 0;
  b.y = b.prevY = 0;
  return { w, a, b };
}

describe('Сблъсъци', () => {
  it('засиленият играч отблъсква стоящия и го замайва', () => {
    const { w, a, b } = setup();
    a.vx = 600;
    const events = [];
    for (let i = 0; i < 10; i++) {
      w.step(new Map<number, PlayerInput>());
      events.push(...w.events);
    }
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toBeDefined();
    expect(hit && hit.type === 'hit' && hit.attackerId).toBe(a.id);
    expect(b.vx).toBeGreaterThan(300);
    expect(b.lastHitBy).toBe(a.id);
  });

  it('играчите не се припокриват след сблъсък', () => {
    const { w, a, b } = setup();
    a.vx = 900;
    for (let i = 0; i < 5; i++) w.step(new Map());
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(a.radius + b.radius - 0.01);
  });

  it('избутаният извън арената дава точка на удрящия', () => {
    const { w, a, b } = setup();
    const r = w.arena.radius;
    a.x = a.prevX = r - 200;
    b.x = b.prevX = r - 120;
    a.vx = 900;
    const falls = [];
    for (let i = 0; i < 60; i++) {
      w.step(new Map());
      falls.push(...w.events.filter((e) => e.type === 'fall'));
    }
    expect(b.alive).toBe(false);
    expect(a.knockouts).toBe(1);
    expect(falls[0]).toMatchObject({ playerId: b.id, byId: a.id });
  });

  it('падналият сам не дава точка на никого', () => {
    const { w, a } = setup();
    a.x = a.prevX = w.arena.radius - 10;
    for (let i = 0; i < 30; i++) w.step(new Map([[a.id, { mx: 1, my: 0, ability: false }]]));
    expect(a.alive).toBe(false);
    expect(w.players.every((p) => p.knockouts === 0)).toBe(true);
  });
});
