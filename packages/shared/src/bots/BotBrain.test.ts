import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import type { PlayerInput } from '../input';
import { World } from '../sim/world';
import { BotBrain, pickDifficulty } from './BotBrain';

/** Пълен рунд само с ботове – „дим тест“ за цялата симулация. */
function simulateBotRound(seed: number, bots = 12) {
  const cfg = cloneBalance();
  const w = new World({ cfg, seed });
  const brains: BotBrain[] = [];
  for (let i = 0; i < bots; i++) {
    const p = w.addPlayer({ name: `B${i}`, isBot: true });
    brains.push(new BotBrain(p.id, pickDifficulty(cfg, w.rng), seed * 100 + i));
  }
  const maxTicks = (cfg.round.countdown + cfg.round.duration + 1) * cfg.sim.tickRate;
  let aliveAt10s = -1;
  let endTime = 0;
  let dashes = 0;
  for (let i = 0; i < maxTicks && w.round.phase !== 'ended'; i++) {
    const inputs = new Map<number, PlayerInput>();
    for (const b of brains) inputs.set(b.playerId, b.think(w));
    w.step(inputs);
    dashes += w.events.filter((e) => e.type === 'ability').length;
    if (w.round.phase === 'playing') {
      endTime = w.round.phaseTime;
      if (w.round.phaseTicks === 10 * cfg.sim.tickRate) aliveAt10s = w.alivePlayers().length;
    }
    for (const p of w.players) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('NaN позиция');
    }
  }
  return { w, aliveAt10s, endTime, dashes };
}

describe('Ботове', () => {
  it('изиграват цял рунд до победител без грешки', () => {
    for (const seed of [1, 2, 3]) {
      const { w, aliveAt10s, endTime, dashes } = simulateBotRound(seed);
      expect(w.round.phase).toBe('ended');
      expect(w.round.winnerId).toBeGreaterThan(0);
      // Не се избиват масово в началото и рундът не е твърде кратък.
      expect(aliveAt10s).toBeGreaterThanOrEqual(6);
      expect(endTime).toBeGreaterThan(30);
      // Използват суперсилата.
      expect(dashes).toBeGreaterThan(10);
      // Бутат се помежду си (има избутвания).
      expect(w.players.reduce((s, p) => s + p.knockouts, 0)).toBeGreaterThan(3);
    }
  });

  it('еднакъв seed → еднакъв рунд (детерминизъм)', () => {
    const a = simulateBotRound(7, 8).w;
    const b = simulateBotRound(7, 8).w;
    expect(a.tick).toBe(b.tick);
    expect(a.round.winnerId).toBe(b.round.winnerId);
    expect(a.players.map((p) => p.x)).toEqual(b.players.map((p) => p.x));
  });
});
