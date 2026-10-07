import type Phaser from 'phaser';
import type { PlayerInput } from '@bum/shared';
import { KeyboardInput } from './KeyboardInput';

/**
 * Вход на човека: обединява клавиатура и сензорно управление (джойстик + бутон).
 *
 * Бързо натискане на суперсилата се „запомня“, докато светът не го прочете:
 * иначе докосване, по-кратко от един тик (33 ms), може да се изгуби.
 */
export class HumanInput {
  private keyboard: KeyboardInput;
  private touchX = 0;
  private touchY = 0;
  private touchAbilityHeld = false;
  private abilityLatch = false;

  constructor(scene: Phaser.Scene) {
    this.keyboard = new KeyboardInput(scene, () => this.pressAbility());
  }

  /** От виртуалния джойстик (-1..1). */
  setTouchMove(x: number, y: number): void {
    this.touchX = x;
    this.touchY = y;
  }

  /** От сензорния бутон: задържан ли е. */
  setTouchAbility(held: boolean): void {
    if (held && !this.touchAbilityHeld) this.pressAbility();
    this.touchAbilityHeld = held;
  }

  /** Натискане на суперсилата (клавиш или бутон) – запомня се до следващия тик. */
  pressAbility(): void {
    this.abilityLatch = true;
  }

  read(): PlayerInput {
    const kb = this.keyboard.read();
    // Клавиатурата е с приоритет, ако е натисната; иначе – джойстикът.
    const useKb = kb.mx !== 0 || kb.my !== 0;
    return {
      mx: useKb ? kb.mx : this.touchX,
      my: useKb ? kb.my : this.touchY,
      ability: kb.ability || this.touchAbilityHeld || this.abilityLatch,
    };
  }

  /** Вика се, след като тик е използвал входа. */
  consumeAbility(): void {
    this.abilityLatch = false;
  }
}
