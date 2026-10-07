/**
 * Проверка на данните, с които клиентът влиза (име, скин, суперсила).
 * Нищо от клиента не се приема на доверие – невалидното се заменя със стойност по подразбиране.
 */
import { ABILITY_IDS, type AbilityId } from '@bum/shared';

/**
 * Скиновете – кадри от атласа на клиента.
 * Копие на списъка от packages/client/src/game/settings.ts (сървърът не импортира клиентски код).
 */
export const SKINS: readonly string[] = [
  'skin_fox', 'skin_dog', 'skin_cat', 'skin_panda', 'skin_tiger', 'skin_frog', 'skin_pig', 'skin_rabbit',
  'skin_bear', 'skin_koala', 'skin_lion', 'skin_cow', 'skin_monkey', 'skin_mouse', 'skin_hamster',
  'skin_polarbear', 'skin_chicken', 'skin_penguin', 'skin_unicorn', 'skin_dragon',
];

/** Максимална дължина на името (в знаци, не в байтове). */
export const MAX_NAME_LENGTH = 14;

export interface Profile {
  name: string;
  skin: string;
  ability: AbilityId;
}

/** Име: без контролни знаци и излишни интервали, до 14 знака; празно → „Player NN“. */
export function sanitizeName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  // Контролни и „невидими“ знаци (нов ред, нулева ширина, посока на текста …) → интервал.
  const clean = text.replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const name = [...clean].slice(0, MAX_NAME_LENGTH).join('').trim();
  return name || `Player ${10 + Math.floor(Math.random() * 90)}`;
}

/** Валиден скин или първият от списъка. */
export function sanitizeSkin(raw: unknown): string {
  return typeof raw === 'string' && SKINS.includes(raw) ? raw : SKINS[0]!;
}

/** Валидна суперсила или „дъш“. */
export function sanitizeAbility(raw: unknown): AbilityId {
  return typeof raw === 'string' && (ABILITY_IDS as readonly string[]).includes(raw) ? (raw as AbilityId) : 'dash';
}

/** Профил на играча от опциите при влизане (JoinOptions, но непроверени). */
export function sanitizeProfile(options: unknown): Profile {
  const o = (options && typeof options === 'object' ? options : {}) as Record<string, unknown>;
  return { name: sanitizeName(o.name), skin: sanitizeSkin(o.skin), ability: sanitizeAbility(o.ability) };
}
