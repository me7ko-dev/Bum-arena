import Phaser from 'phaser';
import type { PlayerInput } from '@bum/shared';

/**
 * Клавиатура: WASD / стрелки за движение, Space / Shift / J за суперсила.
 */
export class KeyboardInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys(
      {
        up: K.W,
        down: K.S,
        left: K.A,
        right: K.D,
        up2: K.UP,
        down2: K.DOWN,
        left2: K.LEFT,
        right2: K.RIGHT,
        ability: K.SPACE,
        ability2: K.SHIFT,
        ability3: K.J,
      },
      true, // enableCapture – стрелките и Space да не скролват страницата
    ) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private down(...names: string[]): boolean {
    return names.some((n) => this.keys[n]?.isDown);
  }

  /** Има ли натиснат клавиш за движение (за да знаем дали клавиатурата е активна). */
  isMoving(): boolean {
    return this.down('up', 'down', 'left', 'right', 'up2', 'down2', 'left2', 'right2');
  }

  read(): PlayerInput {
    let mx = 0;
    let my = 0;
    if (this.down('left', 'left2')) mx -= 1;
    if (this.down('right', 'right2')) mx += 1;
    if (this.down('up', 'up2')) my -= 1;
    if (this.down('down', 'down2')) my += 1;
    if (mx !== 0 && my !== 0) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }
    return { mx, my, ability: this.down('ability', 'ability2', 'ability3') };
  }
}
