import Phaser from 'phaser';
import { GAME_VERSION } from '@bum/shared';
import { t } from '../i18n';
import { COLORS, FONT_FAMILY } from '../theme';

/**
 * Основната сцена на играта. Засега само заглавие – тук ще се рисува арената.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 20, t('title'), {
        fontFamily: FONT_FAMILY,
        fontSize: '56px',
        fontStyle: 'bold',
        color: COLORS.accent,
        stroke: COLORS.textShadow,
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 40, `${t('subtitle')}  ·  v${GAME_VERSION}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5);
  }
}
