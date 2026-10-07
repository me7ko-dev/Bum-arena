import type { Balance } from '../config/balance';
import type { Player } from './types';

/**
 * Изчислява „живите“ характеристики на играча от базовите стойности в конфига
 * и всички активни ефекти (суперсила, магазин, кола). Вика се всеки тик.
 * Така няма разпръснати „+= / -=“ по кода и няма как ефект да „залепне“.
 */
export function updateStats(cfg: Balance, p: Player): void {
  const pc = cfg.player;
  let radius = pc.radius;
  let mass = pc.mass;
  let maxSpeed = pc.maxSpeed;
  let accel = pc.accel;
  let hitPower = 1;

  if (p.inCar) {
    const cc = cfg.cars;
    radius = cc.radius;
    mass = cc.mass;
    maxSpeed = cc.maxSpeed;
    accel = cc.accel;
    hitPower *= cc.hitMult;
  } else {
    const active = p.abilityTime > 0;
    if (active && p.ability === 'dash') mass *= cfg.abilities.dash.massMult;
    if (active && p.ability === 'giant') {
      const g = cfg.abilities.giant;
      radius *= g.scale;
      mass *= g.massMult;
      maxSpeed *= g.speedMult;
    }
    if (p.buffSize > 0) {
      radius *= cfg.shop.size.scale;
      mass *= cfg.shop.size.massMult;
    }
  }
  if (p.buffSpeed > 0) maxSpeed *= cfg.shop.speed.mult;
  if (p.buffMega > 0) hitPower *= cfg.shop.mega.hitMult;

  p.radius = radius;
  p.mass = mass;
  p.maxSpeed = maxSpeed;
  p.accel = accel;
  p.hitPower = hitPower;
  p.immune = p.buffShield > 0 || (!p.inCar && p.ability === 'shield' && p.abilityTime > 0);
}
