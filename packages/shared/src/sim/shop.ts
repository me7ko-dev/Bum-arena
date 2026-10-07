import type { Player, ShopItemId } from './types';
import type { World } from './world';

/** Цена на нещо от магазина. */
export function shopPrice(world: World, item: ShopItemId): number {
  return world.cfg.shop[item].price;
}

/**
 * Покупка в рунда. Връща true при успех.
 * Монетите се смятат на сървъра (етап 3) – клиентът само „иска“ покупката.
 */
export function tryBuy(world: World, p: Player, item: ShopItemId): boolean {
  if (!p.alive || world.round.phase !== 'playing') return false;
  const sc = world.cfg.shop;
  const price = sc[item].price;
  if (p.coins < price) return false;
  p.coins -= price;
  switch (item) {
    case 'size':
      p.buffSize = sc.size.duration;
      break;
    case 'speed':
      p.buffSpeed = sc.speed.duration;
      break;
    case 'shield':
      p.buffShield = sc.shield.duration;
      p.frozen = 0;
      break;
    case 'mega':
      p.buffMega = sc.mega.duration;
      break;
  }
  world.events.push({ type: 'buy', playerId: p.id, item });
  return true;
}
