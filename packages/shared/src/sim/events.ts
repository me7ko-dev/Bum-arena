import type { AbilityId, EndReason, ShopItemId } from './types';

/**
 * Събития, които симулацията изпраща навън за всеки тик.
 *
 * Логиката НЕ рисува и НЕ пуска звуци. Тя само казва „стана удар със сила 0.8 тук“,
 * а клиентът решава как да го покаже (тресене, частици, звук, hit-stop).
 * В етап 3 същите събития ще идват от сървъра.
 */
export type GameEvent =
  | {
      type: 'hit';
      /** Кой удря (по-бързо движещият се към другия). */
      attackerId: number;
      victimId: number;
      /** Точка на контакт. */
      x: number;
      y: number;
      /** Сила 0..1. */
      strength: number;
    }
  | {
      type: 'ability';
      playerId: number;
      ability: AbilityId;
      x: number;
      y: number;
      /** Посока (единичен вектор), ако суперсилата има такава. */
      dirX: number;
      dirY: number;
      /** Засегнатите играчи (замразяване, щит). */
      targets?: number[];
    }
  | { type: 'carSpawn'; carId: number; x: number; y: number }
  | { type: 'carEnter'; playerId: number; x: number; y: number }
  | { type: 'carExit'; playerId: number; x: number; y: number }
  | { type: 'carWreck'; playerId: number; x: number; y: number }
  | { type: 'buy'; playerId: number; item: ShopItemId }
  /** Короната смени собственика (-1 = никой). */
  | { type: 'crown'; playerId: number }
  | { type: 'bounty'; playerId: number; victimId: number; coins: number }
  | {
      type: 'coinPickup';
      playerId: number;
      value: number;
      x: number;
      y: number;
    }
  | {
      type: 'coinDrop';
      playerId: number;
      count: number;
      x: number;
      y: number;
    }
  | {
      /** Отброяване: 3, 2, 1, после 0 = старт. */
      type: 'countdown';
      n: number;
    }
  | {
      /** Арената ще се свие след inSec секунди. */
      type: 'arenaWarning';
      inSec: number;
      toRadius: number;
    }
  | { type: 'arenaShrink'; toRadius: number }
  | { type: 'roundEnd'; winnerId: number; reason: EndReason }
  | {
      type: 'fall';
      playerId: number;
      /** Кой го е избутал (null = падна сам). */
      byId: number | null;
      x: number;
      y: number;
    };
