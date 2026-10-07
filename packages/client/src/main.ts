/**
 * Входна точка на клиента: създава Phaser играта и сцените.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { COLORS } from './theme';
import { getLang } from './i18n';
import { loadSettings } from './game/settings';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';

document.documentElement.lang = getLang();

const game = new Phaser.Game({
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

// След зареждане на ресурсите → играта. (Тук ще се покаже главното меню.)
game.events.once('boot-ready', () => {
  game.scene.start('Game', { settings: loadSettings() });
});

// Панел за баланса: в режим за разработка или с ?tune в адреса.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('tune')) {
  void import('./dev/TuningPanel').then(({ TuningPanel }) => {
    new TuningPanel(() => (game.scene.getScene('Game') as GameScene).restartRound());
  });
}
