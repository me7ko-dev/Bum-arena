import Phaser from 'phaser';
import { BALANCE } from '@bum/shared';
import { LocalGame } from '../game/LocalGame';
import { KeyboardInput } from '../input/KeyboardInput';
import { ArenaView } from '../render/ArenaView';
import { PlayerView } from '../render/PlayerView';
import { t } from '../i18n';

/** Колко единици от света да се виждат по по-късата страна на екрана. */
const VIEW_SIZE = 760;

/**
 * Основната сцена: свързва логиката (LocalGame) с рисуването и входа.
 */
export class GameScene extends Phaser.Scene {
  private match!: LocalGame;
  private keyboard!: KeyboardInput;
  private arenaView!: ArenaView;
  private playerViews = new Map<number, PlayerView>();

  constructor() {
    super('Game');
  }

  create(): void {
    this.match = new LocalGame(BALANCE, Date.now() >>> 0, t('you'));
    this.keyboard = new KeyboardInput(this);
    this.arenaView = new ArenaView(this);

    for (const p of this.match.world.players) {
      this.playerViews.set(p.id, new PlayerView(this, p, p.id === this.match.humanId));
    }

    const cam = this.cameras.main;
    cam.startFollow(this.playerViews.get(this.match.humanId)!.container, false, 0.12, 0.12);
    this.updateZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    });
  }

  private updateZoom(): void {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(Math.min(width, height) / VIEW_SIZE);
  }

  override update(_time: number, deltaMs: number): void {
    const dtSec = deltaMs / 1000;
    this.match.update(dtSec, this.keyboard.read());

    const alpha = this.match.alpha;
    this.arenaView.update(this.match.world.arena);
    for (const p of this.match.world.players) {
      this.playerViews.get(p.id)?.update(p, alpha, dtSec);
    }
  }
}
