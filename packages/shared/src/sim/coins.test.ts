import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import { World } from './world';

function emptyWorld() {
  const cfg = cloneBalance();
  cfg.coins.startCount = 0;
  cfg.coins.spawnInterval = 1e9; // без автоматично появяване
  return new World({ cfg, seed: 5 });
}

describe('Монети', () => {
  it('рундът започва с монети на картата', () => {
    const w = new World({ cfg: cloneBalance() });
    expect(w.coins.length).toBe(w.cfg.coins.startCount);
    for (const c of w.coins) expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(w.arena.radius);
  });

  it('играчът събира монета, като мине през нея', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'A' });
    p.x = p.prevX = 0;
    p.y = p.prevY = 0;
    w.coinSystem.spawnAt(10, 0);
    w.step(new Map());
    expect(p.coins).toBe(1);
    expect(w.coins.length).toBe(0);
  });

  it('силен удар разпилява част от монетите на ударения', () => {
    const w = emptyWorld();
    const a = w.addPlayer({ name: 'A' });
    const b = w.addPlayer({ name: 'B' });
    a.x = a.prevX = -150; a.y = a.prevY = 0;
    b.x = b.prevX = 0; b.y = b.prevY = 0;
    b.coins = 10;
    a.vx = 1000;
    let dropped = 0;
    for (let i = 0; i < 5; i++) {
      w.step(new Map());
      for (const e of w.events) if (e.type === 'coinDrop') dropped += e.count;
    }
    expect(dropped).toBe(3);
    const onMap = w.coins.reduce((s, c) => s + c.value, 0);
    expect(b.coins + a.coins + onMap).toBe(10); // монетите не изчезват и не се появяват от нищото
  });

  it('при падане всички монети се връщат в арената', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'A' });
    p.coins = 7;
    p.x = p.prevX = w.arena.radius + 5;
    p.y = p.prevY = 0;
    w.step(new Map());
    expect(p.alive).toBe(false);
    expect(p.coins).toBe(0);
    const onMap = w.coins.reduce((s, c) => s + c.value, 0);
    expect(onMap).toBe(7);
  });
});
