import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import type { PlayerInput } from '../input';
import type { AbilityId } from './types';
import { World } from './world';

function duo(ability: AbilityId = 'dash') {
  const cfg = cloneBalance();
  cfg.coins.startCount = 0;
  cfg.cars.firstSpawnAt = 1e9;
  const w = new World({ cfg, seed: 9, skipCountdown: true });
  const a = w.addPlayer({ name: 'A', ability });
  const b = w.addPlayer({ name: 'B' });
  a.x = a.prevX = 0; a.y = a.prevY = 0;
  b.x = b.prevX = 120; b.y = b.prevY = 0;
  return { w, a, b };
}
const press = (id: number, extra: Partial<PlayerInput> = {}) =>
  new Map<number, PlayerInput>([[id, { mx: 0, my: 0, ability: true, ...extra }]]);

describe('Етап 2: суперсили', () => {
  it('замразяването спира близките', () => {
    const { w, a, b } = duo('freeze');
    w.step(press(a.id));
    expect(b.frozen).toBeGreaterThan(0);
    expect(w.canControl(b)).toBe(false);
  });

  it('щитът отблъсква близките', () => {
    const { w, a, b } = duo('shield');
    w.step(press(a.id));
    expect(b.vx).toBeGreaterThan(200);
    expect(a.immune).toBe(true);
  });

  it('гигантът става по-голям и по-тежък', () => {
    const { w, a } = duo('giant');
    const r0 = a.radius;
    w.step(press(a.id));
    expect(a.radius).toBeGreaterThan(r0 * 1.5);
    expect(a.mass).toBeGreaterThan(2);
  });

  it('магнитът дърпа монети', () => {
    const { w, a } = duo('magnet');
    const c = w.coinSystem.spawnAt(300, 0);
    w.step(press(a.id));
    expect(c.vx).toBeLessThan(0);
  });
});

describe('Етап 2: коли, магазин, корона', () => {
  it('влизаш в кола, като минеш през нея, и слизаш с бутона', () => {
    const { w, a } = duo();
    w.carSystem.park(30, 0, 100, 0, 1);
    w.step(new Map());
    expect(a.inCar).toBe(true);
    expect(a.radius).toBe(w.cfg.cars.radius);
    w.step(press(a.id));
    expect(a.inCar).toBe(false);
    expect(w.cars.length).toBe(1);
  });

  it('колата се разбива след достатъчно удари', () => {
    const { w, a } = duo();
    a.inCar = true;
    a.carHp = 1;
    a.vx = 900;
    const events: string[] = [];
    for (let i = 0; i < 10; i++) {
      w.step(new Map());
      events.push(...w.events.map((e) => e.type));
    }
    expect(events).toContain('carWreck');
    expect(a.inCar).toBe(false);
  });

  it('купуваш от магазина с монети', () => {
    const { w, a } = duo();
    a.coins = 20;
    w.step(new Map([[a.id, { mx: 0, my: 0, ability: false, buy: 'speed' }]]));
    expect(a.coins).toBe(20 - w.cfg.shop.speed.price);
    expect(a.maxSpeed).toBeGreaterThan(w.cfg.player.maxSpeed);
  });

  it('без пари не се купува', () => {
    const { w, a } = duo();
    a.coins = 1;
    w.step(new Map([[a.id, { mx: 0, my: 0, ability: false, buy: 'mega' }]]));
    expect(a.coins).toBe(1);
    expect(a.buffMega).toBe(0);
  });

  it('водачът по избутвания взима короната', () => {
    const { w, b } = duo();
    b.knockouts = 2;
    w.step(new Map());
    expect(w.crownId).toBe(b.id);
  });
});
