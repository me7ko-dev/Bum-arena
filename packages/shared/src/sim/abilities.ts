import type { Balance } from '../config/balance';
import type { PlayerInput } from '../input';
import type { AbilityId, Player } from './types';
import type { World } from './world';

/**
 * Суперсили. Всяка суперсила е малък обект с три „куки“:
 *   cooldown – колко е презареждането (от конфига);
 *   activate – какво става в момента на натискане;
 *   update   – какво прави всеки тик, докато е активна (по желание).
 *
 * За нова суперсила (етап 2): добави id в AbilityId, числа в balance.abilities
 * и запис в ABILITIES по-долу. Нищо друго в симулацията не трябва да се променя.
 */
interface AbilityDef {
  cooldown(cfg: Balance): number;
  activate(world: World, p: Player, input: PlayerInput): void;
  update?(world: World, p: Player, dt: number): void;
}

const ABILITIES: Record<AbilityId, AbilityDef> = {
  dash: {
    cooldown: (cfg) => cfg.abilities.dash.cooldown,
    activate(world, p, input) {
      const dc = world.cfg.abilities.dash;
      // Посока: накъдето натиска играчът, иначе накъдето гледа.
      const l = Math.hypot(input.mx, input.my);
      const dirX = l > 0.2 ? input.mx / l : Math.cos(p.facing);
      const dirY = l > 0.2 ? input.my / l : Math.sin(p.facing);
      p.vx = dirX * dc.speed;
      p.vy = dirY * dc.speed;
      p.facing = Math.atan2(dirY, dirX);
      p.abilityTime = dc.duration;
      world.events.push({ type: 'ability', playerId: p.id, ability: 'dash', x: p.x, y: p.y, dirX, dirY });
    },
  },
};

/** Обработва натискането на бутона за суперсила (веднъж на тик, преди движението). */
export function handleAbilityInput(world: World, p: Player, input: PlayerInput, canUse: boolean): void {
  const pressed = input.ability && !p.abilityHeld;
  p.abilityHeld = input.ability;
  if (!pressed || !canUse || p.abilityCooldown > 0) return;

  const def = ABILITIES[p.ability];
  p.abilityCooldown = def.cooldown(world.cfg);
  def.activate(world, p, input);
}

/** Таймери и ефекти на суперсилите (веднъж на тик). */
export function updateAbilities(world: World, p: Player, dt: number): void {
  if (p.abilityCooldown > 0) p.abilityCooldown = Math.max(0, p.abilityCooldown - dt);
  if (p.abilityTime > 0) {
    ABILITIES[p.ability].update?.(world, p, dt);
    p.abilityTime = Math.max(0, p.abilityTime - dt);
  }
  p.mass = currentMass(world.cfg, p);
}

/** Масата зависи от активните ефекти (дъш – по-тежък). */
export function currentMass(cfg: Balance, p: Player): number {
  let m = cfg.player.mass;
  if (p.ability === 'dash' && p.abilityTime > 0) m *= cfg.abilities.dash.massMult;
  return m;
}

/** Дали играчът „задържа инерцията“ (без затихване) – напр. по време на дъш. */
export function keepsMomentum(p: Player): boolean {
  return p.ability === 'dash' && p.abilityTime > 0;
}

/** Колко е пълното презареждане на суперсилата на играча (за HUD). */
export function abilityCooldownTotal(cfg: Balance, p: Player): number {
  return ABILITIES[p.ability].cooldown(cfg);
}
