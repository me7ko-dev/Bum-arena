/**
 * Настройките на играча (име, скин, суперсила) – пазят се в браузъра.
 */
import { ABILITY_IDS, type AbilityId } from '@bum/shared';

/** Скиновете са кадри от атласа sprites.json (виж scripts/build-atlas.py). */
export const SKINS: readonly string[] = [
  'skin_fox', 'skin_dog', 'skin_cat', 'skin_panda', 'skin_tiger', 'skin_frog', 'skin_pig', 'skin_rabbit',
  'skin_bear', 'skin_koala', 'skin_lion', 'skin_cow', 'skin_monkey', 'skin_mouse', 'skin_hamster',
  'skin_polarbear', 'skin_chicken', 'skin_penguin', 'skin_unicorn', 'skin_dragon',
];

/** Иконка (кадър от атласа) и ключове за превод на всяка суперсила. */
export const ABILITY_INFO: Record<AbilityId, { icon: string; nameKey: string; descKey: string }> = {
  dash: { icon: 'dash', nameKey: 'ability.dash', descKey: 'ability.dash.desc' },
  magnet: { icon: 'magnet', nameKey: 'ability.magnet', descKey: 'ability.magnet.desc' },
  giant: { icon: 'mushroom', nameKey: 'ability.giant', descKey: 'ability.giant.desc' },
  freeze: { icon: 'ice', nameKey: 'ability.freeze', descKey: 'ability.freeze.desc' },
  shield: { icon: 'shield', nameKey: 'ability.shield', descKey: 'ability.shield.desc' },
};

export interface PlayerSettings {
  name: string;
  skin: string;
  ability: AbilityId;
}

const KEY = 'bum.settings';

export function loadSettings(): PlayerSettings {
  const def: PlayerSettings = { name: '', skin: SKINS[0]!, ability: 'dash' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<PlayerSettings>;
    return {
      name: typeof s.name === 'string' ? s.name.slice(0, 14) : '',
      skin: s.skin && SKINS.includes(s.skin) ? s.skin : def.skin,
      ability: s.ability && ABILITY_IDS.includes(s.ability) ? s.ability : def.ability,
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: PlayerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // частен режим – няма значение
  }
}
