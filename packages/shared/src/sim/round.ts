import type { Player } from './types';
import type { World } from './world';

/**
 * Класиране: победителят, после оцелелите (по избутвания, монети),
 * после падналите – който е паднал по-късно, е по-напред.
 */
export function standings(world: World): Player[] {
  const winnerId = world.round.winnerId;
  return [...world.players].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive && a.eliminatedTick !== b.eliminatedTick) return b.eliminatedTick - a.eliminatedTick;
    if (a.knockouts !== b.knockouts) return b.knockouts - a.knockouts;
    return b.coins - a.coins;
  });
}

/** Място (1 = първо) на играча в класирането. */
export function placeOf(world: World, playerId: number): number {
  return standings(world).findIndex((p) => p.id === playerId) + 1;
}

/** Най-добрият по избутвания, после монети (за край по време). */
function bestBy(players: Player[]): Player | undefined {
  return [...players].sort((a, b) => b.knockouts - a.knockouts || b.coins - a.coins || a.id - b.id)[0];
}

/** Проверява дали рундът е свършил. Вика се веднъж на тик по време на игра. */
export function checkRoundEnd(world: World): void {
  const r = world.round;
  if (r.phase !== 'playing') return;
  const alive = world.alivePlayers();

  // Последен оцелял (ако е имало поне двама в началото).
  if (world.players.length >= 2 && alive.length <= 1) {
    let winner: Player | undefined = alive[0];
    if (!winner) {
      // Всички паднаха в един и същи тик – печели най-добрият от последно падналите.
      const lastTick = Math.max(...world.players.map((p) => p.eliminatedTick));
      winner = bestBy(world.players.filter((p) => p.eliminatedTick === lastTick));
    }
    endRound(world, winner?.id ?? -1, 'lastStanding');
    return;
  }

  if (r.timeLeft <= 0) {
    const pool = world.cfg.round.timeUpAliveOnly && alive.length > 0 ? alive : world.players;
    endRound(world, bestBy(pool)?.id ?? -1, 'timeUp');
  }
}

function endRound(world: World, winnerId: number, reason: 'lastStanding' | 'timeUp'): void {
  const r = world.round;
  r.phase = 'ended';
  r.phaseTicks = 0;
  r.phaseTime = 0;
  r.winnerId = winnerId;
  r.endReason = reason;
  world.events.push({ type: 'roundEnd', winnerId, reason });
}
