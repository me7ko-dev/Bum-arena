/**
 * Входна точка на клиента: създава Phaser играта и сцените.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { COLORS } from './theme';
import { getLang } from './i18n';

document.documentElement.lang = getLang();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // Без физика на Phaser – цялата физика е в @bum/shared (виж README).
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 }, // джойстик + бутон + резерва
  fps: { target: 60 },
  scene: [BootScene, GameScene, HudScene],
});
