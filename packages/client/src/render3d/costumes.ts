/**
 * Костюми на 3D героите. Всеки скин е описание с данни – цветове, шарка по тялото,
 * уши и „екстри“ (муцунка, клюн, рог …). Героят се сглобява от тях с код (Character.ts),
 * затова нов скин за магазина = нов ред тук, без 3D художник.
 *
 * Ключовете са същите като в game/settings.ts (SKINS).
 */

export type EarType = 'none' | 'pointy' | 'small' | 'round' | 'long' | 'floppy' | 'mouse' | 'side';
export type Pattern = 'plain' | 'belly' | 'stripes' | 'spots' | 'face' | 'tuxedo';
export type Extra =
  | 'snoutPig'
  | 'snoutBear'
  | 'snoutCow'
  | 'beak'
  | 'comb'
  | 'unicornHorn'
  | 'unicornMane'
  | 'dragonHorns'
  | 'dragonSpikes'
  | 'cowHorns'
  | 'lionMane'
  | 'pandaPatches'
  | 'koalaNose'
  | 'whiskers'
  | 'cheeks'
  | 'tongue';

export interface Costume {
  /** Основен цвят на тялото. */
  body: number;
  /** Втори цвят (коремче, ивици, петна – според шарката). */
  accent: number;
  pattern: Pattern;
  ears: EarType;
  /** Цвят на ушите (по подразбиране – като тялото). */
  earColor?: number;
  /** Вътрешност на ушите. */
  earInner?: number;
  /** Цвят на обувките. */
  shoes: number;
  extras: Extra[];
  /** Очи по-високо и по-големи (жаба). */
  bigEyes?: boolean;
}

export const COSTUMES: Record<string, Costume> = {
  skin_fox: { body: 0xff7a1a, accent: 0xfff4e6, pattern: 'belly', ears: 'pointy', earInner: 0x3b2418, shoes: 0x3b2418, extras: ['whiskers'] },
  skin_dog: { body: 0xe8b47a, accent: 0xfff1de, pattern: 'belly', ears: 'floppy', earColor: 0x8a5a33, shoes: 0x4d7cff, extras: ['snoutBear', 'tongue'] },
  skin_cat: { body: 0xffc93c, accent: 0xfff6d6, pattern: 'stripes', ears: 'small', earInner: 0xff9fb2, shoes: 0xff5d8f, extras: ['whiskers', 'cheeks'] },
  skin_panda: { body: 0xffffff, accent: 0x22202a, pattern: 'plain', ears: 'round', earColor: 0x22202a, shoes: 0x22202a, extras: ['pandaPatches', 'cheeks'] },
  skin_tiger: { body: 0xff8c1a, accent: 0x2a1a12, pattern: 'stripes', ears: 'small', earInner: 0xfff1de, shoes: 0x2a1a12, extras: ['whiskers'] },
  skin_frog: { body: 0x6fd14f, accent: 0xd9f99d, pattern: 'belly', ears: 'none', shoes: 0xff8fab, extras: ['cheeks'], bigEyes: true },
  skin_pig: { body: 0xffa8c5, accent: 0xffd1e0, pattern: 'belly', ears: 'small', earInner: 0xff7aa2, shoes: 0x8a5a33, extras: ['snoutPig', 'cheeks'] },
  skin_rabbit: { body: 0xf5f5f7, accent: 0xffffff, pattern: 'plain', ears: 'long', earInner: 0xffb3c6, shoes: 0x74c0fc, extras: ['cheeks', 'whiskers'] },
  skin_bear: { body: 0x9c6b43, accent: 0xe8c9a0, pattern: 'belly', ears: 'round', earInner: 0xe8c9a0, shoes: 0x2f9e44, extras: ['snoutBear'] },
  skin_koala: { body: 0xa8adb8, accent: 0xe9ecef, pattern: 'belly', ears: 'mouse', earInner: 0xf1f3f5, shoes: 0x5c7cfa, extras: ['koalaNose'] },
  skin_lion: { body: 0xffc94d, accent: 0xfff1c9, pattern: 'belly', ears: 'small', earColor: 0xd9822b, shoes: 0xc92a2a, extras: ['lionMane', 'snoutBear'] },
  skin_cow: { body: 0xffffff, accent: 0x2b2b33, pattern: 'spots', ears: 'side', earInner: 0xffb3c6, shoes: 0x5f3dc4, extras: ['snoutCow', 'cowHorns'] },
  skin_monkey: { body: 0x8b5a3c, accent: 0xf2c9a1, pattern: 'face', ears: 'side', earInner: 0xf2c9a1, shoes: 0xffd43b, extras: ['tongue'] },
  skin_mouse: { body: 0xb8bcc8, accent: 0xf1f3f5, pattern: 'belly', ears: 'mouse', earInner: 0xffb3c6, shoes: 0xe03131, extras: ['whiskers', 'cheeks'] },
  skin_hamster: { body: 0xf2a65a, accent: 0xfff4e6, pattern: 'belly', ears: 'round', earInner: 0xffc9a8, shoes: 0x1c7ed6, extras: ['cheeks'] },
  skin_polarbear: { body: 0xf8f9fa, accent: 0xe7f5ff, pattern: 'belly', ears: 'round', shoes: 0x1971c2, extras: ['snoutBear'] },
  skin_chicken: { body: 0xfffaf0, accent: 0xffe8a3, pattern: 'belly', ears: 'none', shoes: 0xffa94d, extras: ['beak', 'comb'] },
  skin_penguin: { body: 0x2b2d42, accent: 0xffffff, pattern: 'tuxedo', ears: 'none', shoes: 0xff922b, extras: ['beak', 'cheeks'] },
  skin_unicorn: { body: 0xffffff, accent: 0xfce4ff, pattern: 'belly', ears: 'small', earInner: 0xffb3c6, shoes: 0xcc5de8, extras: ['unicornHorn', 'unicornMane', 'cheeks'] },
  skin_dragon: { body: 0x2fbf9f, accent: 0xffe066, pattern: 'belly', ears: 'none', shoes: 0x7048e8, extras: ['dragonHorns', 'dragonSpikes'] },
};

export function costumeFor(skin: string): Costume {
  return COSTUMES[skin] ?? COSTUMES.skin_fox!;
}
