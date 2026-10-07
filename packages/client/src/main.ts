/**
 * Входна точка на клиента: създава Phaser играта и сцените.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { getLang } from './i18n';
import { hideMenu, setSkinThumbnails, showMenu } from './menu/Menu';
import { SKINS } from './game/settings';
import { renderSkinThumbnails } from './render3d/thumbnails';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';

document.documentElement.lang = getLang();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Прозрачно: отдолу се вижда 3D платното (Three.js), Phaser рисува само слоя отгоре.
  transparent: true,
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

// Phaser платното е над 3D платното (то получава и докосванията).
game.events.once(Phaser.Core.Events.READY, () => {
  game.canvas.style.position = 'absolute';
  game.canvas.style.inset = '0';
  game.canvas.style.zIndex = '1';
});

// След зареждане на ресурсите → главното меню. „ИГРАЙ!“ → рунд; „Меню“ в края → обратно тук.
const openMenu = () =>
  showMenu({
    onPlay: (settings) => {
      hideMenu();
      game.scene.start('Game', { settings });
    },
  });
game.events.once('boot-ready', () => {
  openMenu();
  // 3D снимките на героите – след като менюто вече се вижда (отнема миг).
  setTimeout(() => setSkinThumbnails(renderSkinThumbnails(SKINS)), 50);
});
game.events.on('show-menu', openMenu);

// Панел за баланса: в режим за разработка или с ?tune в адреса.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('tune')) {
  void import('./dev/TuningPanel').then(({ TuningPanel }) => {
    new TuningPanel(() => (game.scene.getScene('Game') as GameScene).restartRound());
  });
}
