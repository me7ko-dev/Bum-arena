import Phaser from 'phaser';
import { BALANCE, standings, type GameEvent, type Player } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { LocalGame } from '../game/LocalGame';
import { HumanInput } from '../input/HumanInput';
import { ArenaView } from '../render/ArenaView';
import { CarsView } from '../render/CarsView';
import { CoinsView } from '../render/CoinsView';
import { loadSettings, type PlayerSettings } from '../game/settings';
import { Effects } from '../render/Effects';
import { PlayerView } from '../render/PlayerView';
import { t } from '../i18n';

/** Колко единици от света да се виждат по по-късата страна на екрана. */
const VIEW_SIZE = 660;
/** На изправен телефон – малко по-близо, за да не са човечетата дребни. */
const VIEW_SIZE_PORTRAIT = 560;
/** Брой ботове в етап 1 (общо 12 с теб). */
const BOTS = 11;

/**
 * Основната сцена: свързва логиката (LocalGame) с рисуването, ефектите и входа.
 */
export class GameScene extends Phaser.Scene {
  match!: LocalGame;
  /** Входът на човека (клавиатура + сензорно). HUD-ът пише в него от джойстика. */
  humanInput!: HumanInput;
  arenaView!: ArenaView;
  private coinsView!: CoinsView;
  private carsView!: CarsView;
  /** С какво играе човекът (от менюто). */
  settings!: PlayerSettings;
  private effects!: Effects;
  private playerViews = new Map<number, PlayerView>();
  private baseZoom = 1;
  private zoomPunch = 0;
  /** Собствено измерване на времето между кадрите (Phaser изглажда delta-та). */
  private lastFrameMs = 0;
  /** Събитията от този кадър (HUD-ът също ги чете). */
  frameEvents: GameEvent[] = [];
  /** Кого следи камерата, след като си паднал (-1 = теб). */
  spectateId = -1;

  constructor() {
    super('Game');
  }

  init(data: { settings?: PlayerSettings }): void {
    this.settings = data.settings ?? this.settings ?? loadSettings();
  }

  create(): void {
    this.playerViews.clear();
    this.lastFrameMs = 0;
    this.frameEvents = [];
    this.spectateId = -1;
    this.match = new LocalGame({
      cfg: BALANCE,
      seed: Date.now() >>> 0,
      humanName: this.settings.name || t('you'),
      humanSkin: this.settings.skin,
      humanAbility: this.settings.ability,
      bots: BOTS,
    });
    this.humanInput = new HumanInput(this);
    this.arenaView = new ArenaView(this, this.match.world.cfg.arena.startRadius);
    this.coinsView = new CoinsView(this, this.match.world.cfg.coins.radius);
    this.carsView = new CarsView(this, this.match.world.cfg.cars.radius);

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
      cfg: () => this.match.world.cfg,
    });

    const cam = this.cameras.main;
    cam.startFollow(this.playerViews.get(this.match.humanId)!.container, false, 0.12, 0.12);
    this.updateZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    });

    this.setupGlobalKeys();

    // HUD върви като отделна сцена върху играта.
    this.scene.stop('Hud');
    this.scene.launch('Hud', { game: this });

    // В dev режим сцената е достъпна от конзолата: window.__bum.match.world …
    if (import.meta.env.DEV) (window as unknown as { __bum: GameScene }).__bum = this;
  }

  /** Звукът се разрешава при първо действие; R = нов рунд; M = без звук. */
  private setupGlobalKeys(): void {
    const unlock = () => sfx.unlock();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, unlock);
    this.input.keyboard?.on('keydown', unlock);
    this.input.keyboard?.on('keydown-R', () => this.restartRound());
    this.input.keyboard?.on('keydown-M', () => (sfx.muted = !sfx.muted));
  }

  /** Нов рунд веднага (със същите настройки). */
  restartRound(): void {
    this.scene.restart({ settings: this.settings });
  }

  /** Обратно към главното меню. */
  goToMenu(): void {
    this.scene.stop('Hud');
    this.scene.stop();
    this.game.events.emit('show-menu');
  }

  /** Играчът, когото гледаме (ние или наблюдаваният след падане). */
  get focusPlayer(): Player {
    const w = this.match.world;
    if (this.spectateId >= 0) return w.getPlayer(this.spectateId) ?? this.match.human;
    return this.match.human;
  }

  /**
   * След като си паднал, камерата следи този, който те е избутал,
   * а ако и той падне – водещия (най-много избутвания) от живите.
   */
  private updateSpectate(): void {
    const me = this.match.human;
    if (me.alive) return;
    const w = this.match.world;
    const current = this.spectateId >= 0 ? w.getPlayer(this.spectateId) : undefined;
    if (current?.alive) return;

    let next: Player | undefined;
    if (this.spectateId < 0 && me.lastHitBy >= 0) next = w.getPlayer(me.lastHitBy);
    if (!next?.alive) next = standings(w).find((p) => p.alive);
    if (!next) return;
    this.spectateId = next.id;
    this.cameras.main.startFollow(this.playerViews.get(next.id)!.container, false, 0.08, 0.08);
  }

  private updateZoom(): void {
    const { width, height } = this.scale;
    const portrait = height > width * 1.3;
    this.baseZoom = Math.min(width, height) / (portrait ? VIEW_SIZE_PORTRAIT : VIEW_SIZE);
  }

  override update(): void {
    const now = performance.now();
    const dtSec = this.lastFrameMs ? Math.min((now - this.lastFrameMs) / 1000, 0.1) : 1 / 60;
    this.lastFrameMs = now;
    this.match.update(dtSec, this.humanInput);
    this.frameEvents = this.match.drainEvents();
    this.effects.handle(this.frameEvents);

    const alpha = this.match.alpha;
    const cfg = this.match.world.cfg;
    this.arenaView.update(
      this.match.world.arena,
      dtSec,
      cfg.arena.shrinkWarning,
      this.match.world.round.phase === 'playing',
    );
    this.coinsView.update(this.match.world.coins, alpha, dtSec);
    this.carsView.update(this.match.world.cars, dtSec);
    for (const p of this.match.world.players) {
      this.playerViews.get(p.id)?.update(p, alpha, dtSec, cfg, p.id === this.match.world.crownId);
    }

    // Чакаме малко след падането, за да видиш как летиш, после камерата превключва.
    if (!this.match.human.alive && this.match.human.fallTime > 1.2) this.updateSpectate();

    this.zoomPunch *= Math.exp(-dtSec * 12);
    this.cameras.main.setZoom(this.baseZoom * (1 + this.zoomPunch));
  }
}
