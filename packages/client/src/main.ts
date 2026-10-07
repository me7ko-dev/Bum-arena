/**
 * Входна точка на клиента: създава Phaser играта и сцените.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene, type GameSceneData } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { getLang } from './i18n';
import { hideMenu, playerSettings, setMenuStatus, setSkinThumbnails, showMenu, type MenuOptions } from './menu/Menu';
import { SKINS, type PlayerSettings } from './game/settings';
import { clearRoomFromUrl, roomFromUrl } from './net/links';
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

// ───────────── Меню → игра ─────────────

/** Текущият опит за свързване (за „Отказ“): по-старите опити се пренебрегват. */
let connectAttempt = 0;

function startGame(data: GameSceneData): void {
  hideMenu();
  game.scene.start('Game', data);
}

/** Онлайн: свързва се (бърза игра, нова частна стая или стая по линк) и пуска играта. */
async function startOnline(settings: PlayerSettings, mode: 'online' | 'friends', roomId?: string): Promise<void> {
  const attempt = ++connectAttempt;
  setMenuStatus(
    roomId
      ? { kind: 'connecting', key: 'menu.joiningRoom', params: { id: roomId } }
      : { kind: 'connecting', key: mode === 'friends' ? 'menu.creatingRoom' : 'menu.connecting' },
  );
  try {
    // Мрежовата библиотека се зарежда чак при нужда – „Тренировка“ не я тегли.
    const net = await import('./net/NetGame');
    const match = await (roomId
      ? net.joinRoom(roomId, settings)
      : mode === 'friends'
        ? net.createPrivate(settings)
        : net.quickPlay(settings));
    if (attempt !== connectAttempt) {
      match.dispose(); // междувременно е натиснат „Отказ“
      return;
    }
    startGame({ settings, match });
  } catch (err) {
    if (attempt !== connectAttempt) return;
    console.warn('Свързването не успя:', err);
    setMenuStatus({ kind: 'error', key: errorKey(err) });
  }
}

/** Ключ за превод от грешка при свързване (NetError има key). */
function errorKey(err: unknown): string {
  const key = (err as { key?: unknown } | null)?.key;
  return typeof key === 'string' ? key : 'net.error.unreachable';
}

const menuOptions: MenuOptions = {
  onPlay: (settings, mode) => {
    if (mode === 'training') startGame({ settings });
    else void startOnline(settings, mode);
  },
  onCancel: () => {
    connectAttempt++;
  },
};

// След зареждане на ресурсите → главното меню. „Меню“ в играта (или прекъсната връзка) → обратно тук.
const openMenu = (data?: { errorKey?: string }) =>
  showMenu(menuOptions, data?.errorKey ? { kind: 'error', key: data.errorKey } : null);

game.events.once('boot-ready', () => {
  openMenu();
  // 3D снимките на героите – след като менюто вече се вижда (отнема миг).
  setTimeout(() => setSkinThumbnails(renderSkinThumbnails(SKINS)), 50);
  // Линк за покана (?room=ID) → направо в стаята.
  const roomId = roomFromUrl();
  if (roomId) {
    clearRoomFromUrl();
    void startOnline(playerSettings(), 'online', roomId);
  }
});
game.events.on('show-menu', openMenu);

// Панел за баланса: в режим за разработка или с ?tune в адреса.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('tune')) {
  void import('./dev/TuningPanel').then(({ TuningPanel }) => {
    new TuningPanel(() => (game.scene.getScene('Game') as GameScene).restartRound());
  });
}
