import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../config/balance';
import { BotBrain, pickDifficulty } from '../bots/BotBrain';
import type { PlayerInput } from '../input';
import { World } from '../sim/world';
import { ABILITY_IDS } from '../sim/types';
import { applySnapshot, encodeSnapshot, type RosterEntry } from './protocol';

describe('Мрежов протокол', () => {
  it('огледалото на клиента съвпада със сървъра след всяка снимка', () => {
    const cfg = cloneBalance();
    const server = new World({ cfg, seed: 11 });
    const brains: BotBrain[] = [];
    for (let i = 0; i < 8; i++) {
      const p = server.addPlayer({ name: `B${i}`, isBot: true, skin: 'skin_fox', ability: ABILITY_IDS[i % 5] });
      brains.push(new BotBrain(p.id, pickDifficulty(cfg, server.rng), i));
    }
    // Roster → клиентът създава същите играчи (същите id).
    const roster: RosterEntry[] = server.players.map((p) => ({
      id: p.id,
      name: p.name,
      skin: p.skin,
      ability: p.ability,
      isBot: p.isBot,
      colorIndex: p.colorIndex,
    }));
    const client = new World({ cfg, seed: 999 });
    for (const r of roster) {
      const p = client.addPlayer({ name: r.name, isBot: r.isBot, skin: r.skin, ability: r.ability, colorIndex: r.colorIndex });
      expect(p.id).toBe(r.id);
    }

    let events = 0;
    for (let t = 0; t < 30 * 40; t++) {
      const inputs = new Map<number, PlayerInput>();
      for (const b of brains) inputs.set(b.playerId, b.think(server));
      server.step(inputs);
      // През мрежата минава JSON-подобни данни – симулираме го.
      const snap = JSON.parse(JSON.stringify(encodeSnapshot(server)));
      applySnapshot(client, snap);
      events += client.events.length;
    }
    for (const sp of server.players) {
      const cp = client.getPlayer(sp.id)!;
      expect(cp.x).toBeCloseTo(sp.x, 0);
      expect(cp.y).toBeCloseTo(sp.y, 0);
      expect(cp.alive).toBe(sp.alive);
      expect(cp.coins).toBe(sp.coins);
      expect(cp.knockouts).toBe(sp.knockouts);
    }
    expect(client.coins.length).toBe(server.coins.length);
    expect(client.round.phase).toBe(server.round.phase);
    expect(client.arena.radius).toBeCloseTo(server.arena.radius, 0);
    expect(events).toBeGreaterThan(50);
  });

  it('снимката е компактна (под 6 KB в JSON за 12 играчи)', () => {
    const w = new World({ cfg: cloneBalance(), seed: 2 });
    for (let i = 0; i < 12; i++) w.addPlayer({ name: `P${i}` });
    w.step(new Map());
    expect(JSON.stringify(encodeSnapshot(w)).length).toBeLessThan(6000);
  });
});
