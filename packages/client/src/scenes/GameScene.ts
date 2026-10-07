import Phaser from 'phaser';
import { BALANCE } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { LocalGame } from '../game/LocalGame';
import { KeyboardInput } from '../input/KeyboardInput';
import { ArenaView } from '../render/ArenaView';
import { Effects } from '../render/Effects';
import { PlayerView } from '../render/PlayerView';
import { t } from '../i18n';

/** Колко единици от света да се виждат по по-късата страна на екрана. */
const VIEW_SIZE = 760;
/** Брой противници в етап 1 (засега манекени без мозък – ботовете идват в стъпка 7). */
const OPPONENTS = 9;

/**
 * Основната сцена: свързва логиката (LocalGame) с рисуването, ефектите и входа.
 */
export class GameScene extends Phaser.Scene {
  match!: LocalGame;
  private keyboard!: KeyboardInput;
  private arenaView!: ArenaView;
  private effects!: Effects;
  private playerViews = new Map<number, PlayerView>();
  private baseZoom = 1;
  private zoomPunch = 0;
  /** Собствено измерване на времето между кадрите (Phaser изглажда delta-та). */
  private lastFrameMs = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.playerViews.clear();
    this.lastFrameMs = 0;
    this.match = new LocalGame({
      cfg: BALANCE,
      seed: Date.now() >>> 0,
      humanName: t('you'),
      opponents: OPPONENTS,
    });
    this.keyboard = new KeyboardInput(this);
    this.arenaView = new ArenaView(this);

    for (const p of this.match.world.players) {
      this.playerViews.set(p.id, new PlayerView(this, p, p.id === this.match.humanId));
    }

    this.effects = new Effects({
      scene: this,
      views: this.playerViews,
      humanId: this.match.humanId,
      listener: () => {
        const v = this.cameras.main.worldView;
        return { x: v.centerX, y: v.centerY };
      },
      freeze: (s) => this.match.freeze(s),
      punchZoom: (a) => (this.zoomPunch = Math.max(this.zoomPunch, a)),
    });

    const cam = this.cameras.main;
    cam.startFollow(this.playerViews.get(this.match.humanId)!.container, false, 0.12, 0.12);
    this.updateZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    });

    this.setupGlobalKeys();

    // В dev режим сцената е достъпна от конзолата: window.__bum.match.world …
    if (import.meta.env.DEV) (window as unknown as { __bum: GameScene }).__bum = this;
  }

  /** Звукът се разрешава при първо действие; R = нов рунд; M = без звук. */
  private setupGlobalKeys(): void {
    const unlock = () => sfx.unlock();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, unlock);
    this.input.keyboard?.on('keydown', unlock);
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());
    this.input.keyboard?.on('keydown-M', () => (sfx.muted = !sfx.muted));
  }

  private updateZoom(): void {
    const { width, height } = this.scale;
    this.baseZoom = Math.min(width, height) / VIEW_SIZE;
  }

  override update(): void {
    const now = performance.now();
    const dtSec = this.lastFrameMs ? Math.min((now - this.lastFrameMs) / 1000, 0.1) : 1 / 60;
    this.lastFrameMs = now;
    this.match.update(dtSec, this.keyboard.read());
    this.effects.handle(this.match.drainEvents());

    const alpha = this.match.alpha;
    const cfg = this.match.world.cfg;
    this.arenaView.update(this.match.world.arena);
    for (const p of this.match.world.players) {
      this.playerViews.get(p.id)?.update(p, alpha, dtSec, cfg);
    }

    this.zoomPunch *= Math.exp(-dtSec * 12);
    this.cameras.main.setZoom(this.baseZoom * (1 + this.zoomPunch));
  }
}
