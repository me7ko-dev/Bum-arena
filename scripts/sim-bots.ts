/**
 * Симулира рундове само с ботове и печата статистика – за настройка на баланса без браузър.
 *   npx tsx scripts/sim-bots.ts [брой рундове] [брой ботове]
 */
import { BotBrain, World, cloneBalance, pickDifficulty, type PlayerInput } from '../packages/shared/src/index';

const rounds = Number(process.argv[2] ?? 5);
const botCount = Number(process.argv[3] ?? 12);

for (let r = 0; r < rounds; r++) {
  const cfg = cloneBalance();
  const seed = 1000 + r;
  const w = new World({ cfg, seed });
  const brains = new Map<number, BotBrain>();
  for (let i = 0; i < botCount; i++) {
    const p = w.addPlayer({ name: `B${i}`, isBot: true });
    brains.set(p.id, new BotBrain(p.id, pickDifficulty(cfg, w.rng), seed * 100 + i));
  }
  const falls: string[] = [];
  let endTime = 0;
  let hits = 0;
  let dashes = 0;
  const maxTicks = (cfg.round.countdown + cfg.round.duration + 1) * cfg.sim.tickRate;
  for (let i = 0; i < maxTicks && w.round.phase !== 'ended'; i++) {
    const inputs = new Map<number, PlayerInput>();
    for (const b of brains.values()) inputs.set(b.playerId, b.think(w));
    w.step(inputs);
    if (w.round.phase === 'playing') endTime = w.round.phaseTime;
    for (const e of w.events) {
      if (e.type === 'hit') hits++;
      if (e.type === 'ability') dashes++;
      if (e.type === 'fall') {
        const d = brains.get(e.playerId)!.difficulty[0];
        falls.push(`${endTime.toFixed(0)}s:${d}${e.byId ? '←' + brains.get(e.byId)!.difficulty[0] : '(сам)'}`);
      }
    }
  }
  const winner = w.getPlayer(w.round.winnerId);
  console.log(
    `рунд ${r}: край ${w.round.endReason} на ${endTime.toFixed(0)}s, победител ${winner?.name}(${brains.get(winner?.id ?? 0)?.difficulty}), удари ${hits}, дъшове ${dashes}`,
  );
  console.log('   падания: ' + falls.join(' '));
}
