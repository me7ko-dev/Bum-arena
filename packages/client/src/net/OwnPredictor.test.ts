import { describe, expect, it } from 'vitest';
import { World, cloneBalance, type PlayerInput } from '@bum/shared';
import { OwnPredictor } from './OwnPredictor';

/**
 * Симулация: сървър с пинг – входът стига до него след ping/2, а снимката се връща след още ping/2.
 * „Истината“ е свят без закъснение. Предсказанието трябва да е близо до истината,
 * докато суровата снимка изостава с ~скорост × пинг.
 */
function simulate(pingSec: number, inputAt: (t: number) => PlayerInput) {
  const cfg = cloneBalance();
  cfg.coins.startCount = 0;
  const mk = () => {
    const w = new World({ cfg, seed: 1, skipCountdown: true });
    const p = w.addPlayer({ name: 'A', ability: 'dash' });
    p.x = p.prevX = 0;
    p.y = p.prevY = 0;
    return { w, p };
  };
  const truth = mk();
  const server = mk();
  const pred = new OwnPredictor(cfg);
  const tick = 1 / cfg.sim.tickRate;
  const frame = 1 / 60;
  const snaps: { at: number; p: typeof server.p }[] = [];
  let serverClock = 0;
  let truthClock = 0;
  let latest = { ...server.p };
  let out = { x: 0, y: 0 };
  let maxErr = 0;
  let maxLag = 0;
  for (let t = 0; t < 2; t += frame) {
    const input = inputAt(t);
    // Истината: входът се прилага веднага.
    while (truthClock + tick <= t) {
      truthClock += tick;
      truth.w.step(new Map([[truth.p.id, inputAt(truthClock)]]));
    }
    // Сървърът: входът пристига с ping/2 закъснение, снимката тръгва към клиента.
    while (serverClock + tick <= t) {
      serverClock += tick;
      server.w.step(new Map([[server.p.id, inputAt(Math.max(0, serverClock - pingSec / 2))]]));
      snaps.push({ at: serverClock + pingSec / 2, p: { ...server.p } });
    }
    let isNew = false;
    while (snaps.length && snaps[0]!.at <= t) {
      latest = snaps.shift()!.p;
      isNew = true;
    }
    out = pred.update(frame, input, latest, isNew, pingSec);
    if (t > 0.6) {
      maxErr = Math.max(maxErr, Math.hypot(out.x - truth.p.x, out.y - truth.p.y));
      maxLag = Math.max(maxLag, Math.hypot(latest.x - truth.p.x, latest.y - truth.p.y));
    }
  }
  return { maxErr, maxLag, out, truth: truth.p };
}

const right = (t: number): PlayerInput => ({ mx: t > 0.1 ? 1 : 0, my: 0, ability: false });

describe('OwnPredictor', () => {
  it('без вход и без пинг остава там, където е сървърът', () => {
    const r = simulate(0, () => ({ mx: 0, my: 0, ability: false }));
    expect(Math.hypot(r.out.x - r.truth.x, r.out.y - r.truth.y)).toBeLessThan(1);
  });

  it('при пинг 150 ms предсказаното е близо до истината, а суровата снимка изостава', () => {
    const r = simulate(0.15, right);
    expect(r.maxLag).toBeGreaterThan(30); // без предсказване – десетки единици назад
    expect(r.maxErr).toBeLessThan(r.maxLag * 0.4);
  });

  it('смяна на посоката се усеща веднага', () => {
    const zigzag = (t: number): PlayerInput => ({ mx: Math.floor(t * 2) % 2 ? 1 : -1, my: 0, ability: false });
    const r = simulate(0.15, zigzag);
    expect(r.maxErr).toBeLessThan(r.maxLag * 0.5);
  });

  it('дъшът се предсказва веднага (без да чака сървъра)', () => {
    const dashAt = (t: number): PlayerInput => ({ mx: 1, my: 0, ability: t > 0.7 && t < 0.75 });
    const r = simulate(0.2, dashAt);
    expect(r.maxErr).toBeLessThan(r.maxLag);
  });
});
