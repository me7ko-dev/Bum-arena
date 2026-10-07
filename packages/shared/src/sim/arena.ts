import type { Balance } from '../config/balance';
import type { World } from './world';

/** Плавно ускорение/забавяне 0..1 → 0..1. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Радиусът на арената като функция от времето в рунда.
 * Без вътрешно състояние → еднакъв резултат на сървър и клиент, лесно за превъртане.
 */
export function arenaRadiusAt(cfg: Balance, t: number): number {
  const ac = cfg.arena;
  let r = ac.startRadius;
  for (const st of ac.shrinkStages) {
    if (t < st.at) break;
    const target = ac.startRadius * st.to;
    const k = st.over > 0 ? Math.min(1, (t - st.at) / st.over) : 1;
    r = r + (target - r) * smooth(k);
  }
  return r;
}

/**
 * Обновява арената за текущото време на рунда и пуска събития
 * (предупреждение преди свиване и начало на свиването).
 */
export function updateArena(world: World, playTime: number, prevPlayTime: number): void {
  const { cfg, arena } = world;
  const ac = cfg.arena;
  arena.radius = arenaRadiusAt(cfg, playTime);

  arena.shrinking = false;
  arena.shrinkIn = -1;
  arena.nextRadius = arena.radius;
  for (const st of ac.shrinkStages) {
    const target = ac.startRadius * st.to;
    if (playTime >= st.at && playTime < st.at + st.over) {
      arena.shrinking = true;
      arena.nextRadius = target;
    }
    if (playTime < st.at) {
      if (arena.shrinkIn < 0) {
        arena.shrinkIn = st.at - playTime;
        if (!arena.shrinking) arena.nextRadius = target;
      }
    }
    // Събития при пресичане на моментите (prev < момент ≤ сега).
    const warnAt = st.at - ac.shrinkWarning;
    if (prevPlayTime < warnAt && playTime >= warnAt) {
      world.events.push({ type: 'arenaWarning', inSec: ac.shrinkWarning, toRadius: target });
    }
    if (prevPlayTime < st.at && playTime >= st.at) {
      world.events.push({ type: 'arenaShrink', toRadius: target });
    }
  }
}
