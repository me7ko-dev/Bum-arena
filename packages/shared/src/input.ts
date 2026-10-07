import { SHOP_ITEM_IDS, type ShopItemId } from './sim/types';

/**
 * Вход на един играч за един тик.
 *
 * Един и същ формат за всички източници: клавиатура, виртуален джойстик,
 * бот и (в етап 3) мрежата. Симулацията не знае откъде идва входът.
 */
export interface PlayerInput {
  /** Посока на движение, X (-1..1). Дължината на (mx, my) е ≤ 1 (аналогов джойстик). */
  mx: number;
  /** Посока на движение, Y (-1..1). Положително е надолу. */
  my: number;
  /** Задържан ли е бутонът за суперсила (в кола – слизане от колата). */
  ability: boolean;
  /** Покупка от магазина този тик (по желание). */
  buy?: ShopItemId | null;
}

export const NO_INPUT: Readonly<PlayerInput> = Object.freeze({ mx: 0, my: 0, ability: false });

/** Нормализира входа: дължина на посоката ≤ 1, без NaN. Пази срещу счупен/злонамерен вход. */
export function sanitizeInput(input: PlayerInput): PlayerInput {
  let mx = Number.isFinite(input.mx) ? input.mx : 0;
  let my = Number.isFinite(input.my) ? input.my : 0;
  const l = Math.sqrt(mx * mx + my * my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  const buy = input.buy && SHOP_ITEM_IDS.includes(input.buy) ? input.buy : null;
  return { mx, my, ability: !!input.ability, buy };
}
