import type { Balance } from '../config/balance';
import type { PlayerInput } from '../input';
import { exitCar } from './cars';
import type { AbilityId, Player } from './types';
import type { World } from './world';

/**
 * Суперсили. Всяка суперсила е малък обект с „куки“:
 *   cooldown – колко е презареждането (от конфига);
 *   duration – колко трае ефектът (0 = мигновен);
 *   activate – какво става в момента на натискане;
 *   update   – какво прави всеки тик, докато е активна (по желание).
 *
 * Размерът/масата/скоростта по време на ефекта се смятат в stats.ts.
 * За нова суперсила: id в AbilityId, числа в balance.abilities, запис тук.
 */
interface AbilityDef {
  cooldown(cfg: Balance): number;
  duration(cfg: Balance): number;
  activate(world: World, p: Player, input: PlayerInput): void;
  update?(world: World, p: Player, dt: number): void;
}

/** Помощна: всички живи противници в радиус r около p. */
function othersInRadius(world: World, p: Player, r: number): Player[] {
  return world.players.filter((o) => {
    if (o === p || !o.alive) return false;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const rr = r + o.radius;
    return dx * dx + dy * dy <= rr * rr;
  });
}

function emit(world: World, p: Player, ability: AbilityId, dirX = 0, dirY = 0, targets?: number[]): void {
  world.events.push({ type: 'ability', playerId: p.id, ability, x: p.x, y: p.y, dirX, dirY, targets });
}

const ABILITIES: Record<AbilityId, AbilityDef> = {
  dash: {
    cooldown: (cfg) => cfg.abilities.dash.cooldown,
    duration: (cfg) => cfg.abilities.dash.duration,
    activate(world, p, input) {
      const dc = world.cfg.abilities.dash;
      // Посока: накъдето натиска играчът, иначе накъдето гледа.
      const l = Math.hypot(input.mx, input.my);
      const dirX = l > 0.2 ? input.mx / l : Math.cos(p.facing);
      const dirY = l > 0.2 ? input.my / l : Math.sin(p.facing);
      p.vx = dirX * dc.speed;
      p.vy = dirY * dc.speed;
      p.facing = Math.atan2(dirY, dirX);
      emit(world, p, 'dash', dirX, dirY);
    },
  },

  magnet: {
    cooldown: (cfg) => cfg.abilities.magnet.cooldown,
    duration: (cfg) => cfg.abilities.magnet.duration,
    activate(world, p) {
      emit(world, p, 'magnet');
    },
    update(world, p, dt) {
      const mc = world.cfg.abilities.magnet;
      // Монетите летят към теб.
      for (const c of world.coins) {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > mc.radius || d < 1) continue;
        c.vx = (dx / d) * mc.coinPull;
        c.vy = (dy / d) * mc.coinPull;
        c.pickupDelay = Math.min(c.pickupDelay, 0);
      }
      // Противниците се дърпат към теб.
      for (const o of othersInRadius(world, p, mc.radius)) {
        if (o.immune) continue;
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = mc.playerPull * dt * (1 - (d / mc.radius) * 0.5);
        o.vx += (dx / d) * k;
        o.vy += (dy / d) * k;
      }
    },
  },

  giant: {
    cooldown: (cfg) => cfg.abilities.giant.cooldown,
    duration: (cfg) => cfg.abilities.giant.duration,
    activate(world, p) {
      emit(world, p, 'giant');
    },
  },

  freeze: {
    cooldown: (cfg) => cfg.abilities.freeze.cooldown,
    duration: () => 0.4, // само за визуалния ефект
    activate(world, p) {
      const fc = world.cfg.abilities.freeze;
      const hit = othersInRadius(world, p, fc.radius).filter((o) => !o.immune);
      for (const o of hit) {
        o.frozen = Math.max(o.frozen, fc.duration);
        o.lastHitBy = p.id;
        o.lastHitTick = world.tick;
      }
      emit(world, p, 'freeze', 0, 0, hit.map((o) => o.id));
    },
  },

  shield: {
    cooldown: (cfg) => cfg.abilities.shield.cooldown,
    duration: (cfg) => cfg.abilities.shield.duration,
    activate(world, p) {
      const sc = world.cfg.abilities.shield;
      const hit = othersInRadius(world, p, sc.radius).filter((o) => !o.immune);
      for (const o of hit) {
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = (sc.force * (1 - (d / (sc.radius + o.radius)) * 0.5)) / o.mass;
        o.vx += (dx / d) * k;
        o.vy += (dy / d) * k;
        o.stun = Math.max(o.stun, 0.3);
        o.lastHitBy = p.id;
        o.lastHitTick = world.tick;
      }
      emit(world, p, 'shield', 0, 0, hit.map((o) => o.id));
    },
  },
};

/**
 * Обработва натискането на бутона (веднъж на тик, преди движението).
 * В кола бутонът означава „слез от колата“.
 */
export function handleAbilityInput(world: World, p: Player, input: PlayerInput, canUse: boolean): void {
  const pressed = input.ability && !p.abilityHeld;
  p.abilityHeld = input.ability;
  if (!pressed || !canUse) return;

  if (p.inCar) {
    exitCar(world, p);
    return;
  }
  if (p.abilityCooldown > 0) return;
  const def = ABILITIES[p.ability];
  p.abilityCooldown = def.cooldown(world.cfg);
  p.abilityTime = def.duration(world.cfg);
  def.activate(world, p, input);
}

/** Таймери и ефекти на суперсилите (веднъж на тик). */
export function updateAbilities(world: World, p: Player, dt: number): void {
  if (p.abilityCooldown > 0) p.abilityCooldown = Math.max(0, p.abilityCooldown - dt);
  if (p.abilityTime > 0) {
    if (p.alive && !p.inCar) ABILITIES[p.ability].update?.(world, p, dt);
    p.abilityTime = Math.max(0, p.abilityTime - dt);
  }
}

/** Дали играчът „задържа инерцията“ (без затихване) – напр. по време на дъш. */
export function keepsMomentum(p: Player): boolean {
  return p.ability === 'dash' && p.abilityTime > 0 && !p.inCar;
}

/** Колко е пълното презареждане на суперсилата на играча (за HUD). */
export function abilityCooldownTotal(cfg: Balance, p: Player): number {
  return ABILITIES[p.ability].cooldown(cfg);
}
