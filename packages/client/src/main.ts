/**
 * Входна точка на клиента: създава Phaser играта и сцените.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { COLORS } from './theme';
import { getLang } from './i18n';
import { hideMenu, showMenu } from './menu/Menu';
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

// След зареждане на ресурсите → главното меню. „ИГРАЙ!“ → рунд; „Меню“ в края → обратно тук.
const openMenu = () =>
  showMenu({
    onPlay: (settings) => {
      hideMenu();
      game.scene.start('Game', { settings });
    },
  });
game.events.once('boot-ready', openMenu);
game.events.on('show-menu', openMenu);

// Панел за баланса: в режим за разработка или с ?tune в адреса.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('tune')) {
  void import('./dev/TuningPanel').then(({ TuningPanel }) => {
    new TuningPanel(() => (game.scene.getScene('Game') as GameScene).restartRound());
  });
}
