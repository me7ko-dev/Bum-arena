import { clamp } from '../math/vec';
import { damageCar } from './cars';
import type { World } from './world';
import type { Player } from './types';

/**
 * Сблъсъци между играчите (кръг срещу кръг) за една подстъпка.
 *
 * Два слоя:
 *  1) Физичен отскок (импулс с restitution) – запазва усещането за маса.
 *  2) „Геймплей“ бонус: всеки отблъсква другия пропорционално на СВОЯТА скорост към него.
 *     Който се засили повече – печели сблъсъка. Това е сърцето на „бутането“.
 */
export function resolvePlayerCollisions(world: World): void {
  const players = world.players;
  const hc = world.cfg.hit;

  for (let i = 0; i < players.length; i++) {
    const a = players[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j]!;
      if (!b.alive) continue;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      let dist = Math.sqrt(distSq);
      if (dist < 1e-6) {
        // Точно един върху друг – избираме случайна посока (детерминирано чрез rng).
        const ang = world.rng.next() * Math.PI * 2;
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        dist = 1e-6;
      }
      const nx = dx / dist; // нормала от a към b
      const ny = dy / dist;

      // ── Раздалечаване (според масата – по-лекият се мести повече) ──
      const invA = 1 / a.mass;
      const invB = 1 / b.mass;
      const invSum = invA + invB;
      const overlap = minDist - dist;
      a.x -= nx * overlap * (invA / invSum);
      a.y -= ny * overlap * (invA / invSum);
      b.x += nx * overlap * (invB / invSum);
      b.y += ny * overlap * (invB / invSum);

      // ── Относителна скорост по нормалата ──
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv >= 0) continue; // вече се раздалечават
      const closing = -rv;

      // 1) Физичен импулс.
      const impulse = ((1 + hc.restitution) * closing) / invSum;
      a.vx -= nx * impulse * invA;
      a.vy -= ny * impulse * invA;
      b.vx += nx * impulse * invB;
      b.vy += ny * impulse * invB;

      if (closing < hc.minSpeed) continue; // просто допир

      // 2) Геймплей бонус: всеки бута другия със собствената си скорост към него,
      //    умножена по силата на удара (кола, мега удар). Щитът отразява бутането.
      const aApproach = Math.max(0, a.vx * nx + a.vy * ny + impulse * invA); // скоростта на a преди импулса
      const bApproach = Math.max(0, -(b.vx * nx + b.vy * ny) + impulse * invB);
      let bonusToB = hc.knockbackBonus * aApproach * a.hitPower * (a.mass / b.mass);
      let bonusToA = hc.knockbackBonus * bApproach * b.hitPower * (b.mass / a.mass);
      if (b.immune) {
        bonusToA += bonusToB * 0.8;
        bonusToB = 0;
      }
      if (a.immune) {
        bonusToB += bonusToA * 0.8;
        bonusToA = 0;
      }
      b.vx += nx * bonusToB;
      b.vy += ny * bonusToB;
      a.vx -= nx * bonusToA;
      a.vy -= ny * bonusToA;

      const strength = clamp((closing - hc.minSpeed) / (hc.strongSpeed - hc.minSpeed), 0, 1);
      const attacker = aApproach >= bApproach ? a : b;
      const victim = attacker === a ? b : a;
      const power = Math.min(1, strength * attacker.hitPower);

      registerHit(world, attacker, victim, power);
      // Ако и двамата са се засилили, и „атакуващият“ отнася малко.
      const otherApproach = attacker === a ? bApproach : aApproach;
      if (otherApproach > hc.minSpeed) registerHit(world, victim, attacker, strength * 0.5, false);

      // Колите поемат щети, мега ударът се изразходва.
      damageCar(world, a, strength);
      damageCar(world, b, strength);
      if (attacker.buffMega > 0 && strength > 0.15) attacker.buffMega = 0;

      world.events.push({
        type: 'hit',
        attackerId: attacker.id,
        victimId: victim.id,
        x: a.x + nx * a.radius,
        y: a.y + ny * a.radius,
        strength: power,
      });
    }
  }
}

/** Записва удара върху жертвата: замайване и кой е ударил последно. */
function registerHit(world: World, attacker: Player, victim: Player, strength: number, stun = true): void {
  const hc = world.cfg.hit;
  victim.lastHitBy = attacker.id;
  victim.lastHitTick = world.tick;
  if (victim.immune) return;
  if (stun && strength >= hc.stunThreshold) {
    const t = hc.stunMin + (hc.stunMax - hc.stunMin) * strength;
    victim.stun = Math.max(victim.stun, t);
  }
  // Силен удар → удареният изпуска част от монетите си.
  const cc = world.cfg.coins;
  if (stun && strength >= cc.dropThreshold && victim.coins > 0) {
    const n = Math.max(cc.hitDropMin, Math.floor(victim.coins * cc.hitDropFraction));
    world.coinSystem.scatter(victim, n, victim.x, victim.y);
  }
}
