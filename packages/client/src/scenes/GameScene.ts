import Phaser from 'phaser';
import { BALANCE, standings, type GameEvent, type Player } from '@bum/shared';
import { ATLAS } from '../assets';
import { sfx } from '../audio/Sfx';
import { LocalGame } from '../game/LocalGame';
import type { Match } from '../game/Match';
import { HumanInput } from '../input/HumanInput';
import { loadSettings, type PlayerSettings } from '../game/settings';
import { Effects3D } from '../render3d/Effects3D';
import { World3D } from '../render3d/World3D';
// Кинематография и музика: прелитане при старт, подиум в края, фонова музика.
import { IntroCamera } from '../render3d/IntroCamera';
import { Podium } from '../render3d/Podium';
import { RoundMusic } from '../audio/Music';
import { t } from '../i18n';
import { FONT_FAMILY } from '../theme';

/** Брой ботове (общо 12 с теб). */
const BOTS = 11;

/** 3D светът се създава веднъж за цялата игра (един WebGL контекст). */
let world3d: World3D | null = null;

/** Етикет над главата: име + лента за живота на колата. */
interface Label {
  container: Phaser.GameObjects.Container;
  text: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
}

/** Данни при пускане на сцената: настройките и (онлайн) вече свързана игра. */
export interface GameSceneData {
  settings?: PlayerSettings;
  /** Онлайн игра (NetGame). Без нея – офлайн „Тренировка“ срещу ботове. */
  match?: Match;
}

/**
 * Основната сцена: върти играта (Match – LocalGame офлайн или NetGame онлайн),
 * подава данните на 3D света (Three.js)
 * и рисува плоския слой отгоре – имена над главите и изскачащи надписи.
 * Самата Phaser сцена е прозрачна: под нея се вижда 3D платното.
 */
export class GameScene extends Phaser.Scene {
  match!: Match;
  /** Онлайн играта, подадена отвън (оцелява при презареждане на сцената за нов рунд). */
  private netMatch: Match | null = null;
  /** Рундът (match.roundId), за който е построена сцената. */
  private roundId = 0;
  /** Входът на човека (клавиатура + сензорно). HUD-ът пише в него от джойстика. */
  humanInput!: HumanInput;
  /** С какво играе човекът (от менюто). */
  settings!: PlayerSettings;
  world3d!: World3D;
  private effects!: Effects3D;
  private labels = new Map<number, Label>();
  /** Собствено измерване на времето между кадрите (Phaser изглажда delta-та). */
  private lastFrameMs = 0;
  /** Събитията от този кадър (HUD-ът също ги чете). */
  frameEvents: GameEvent[] = [];
  /** Кого следи камерата, след като си паднал (-1 = теб). */
  spectateId = -1;
  /** Прелитане на камерата по време на отброяването (HUD-ът показва „пропусни“). */
  intro!: IntroCamera;
  /** Подиумът в края на рунда (HUD-ът рисува имената над героите). */
  podium!: Podium;
  private roundMusic!: RoundMusic;

  constructor() {
    super('Game');
  }

  init(data: GameSceneData): void {
    this.settings = data.settings ?? this.settings ?? loadSettings();
    this.netMatch = data.match ?? null;
  }

  create(): void {
    this.labels.clear();
    this.lastFrameMs = 0;
    this.frameEvents = [];
    this.spectateId = -1;
    this.match =
      this.netMatch ??
      new LocalGame({
        cfg: BALANCE,
        seed: Date.now() >>> 0,
        humanName: this.settings.name || t('you'),
        humanSkin: this.settings.skin,
        humanAbility: this.settings.ability,
        bots: BOTS,
      });
    this.roundId = this.match.roundId;
    this.humanInput = new HumanInput(this);

    world3d ??= new World3D(document.getElementById('game')!);
    this.world3d = world3d;
    this.world3d.reset();
    this.world3d.resize();

    for (const p of this.match.world.players) this.labels.set(p.id, this.makeLabel(p));

    this.effects = new Effects3D({
      world3d: this.world3d,
      humanId: this.match.humanId,
      cfg: () => this.match.world.cfg,
      player: (id) => this.match.world.getPlayer(id),
      listener: () => this.focusPlayer,
      freeze: (s) => this.match.freeze(s),
      popText: (x, y, h, text, color, scale) => this.popText(x, y, h, text, color, scale),
      popIcon: (x, y, h, frame, scale) => this.popIcon(x, y, h, frame, scale),
      visible: (x, y) => this.world3d.project(x, 30, y).visible,
    });

    const onResize = () => this.world3d.resize();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));

    // ── Кинематография: прелитане при старта + подиум в края (виж IntroCamera/Podium) ──
    this.intro = new IntroCamera();
    this.podium = new Podium(this.world3d, () => ({ width: this.scale.width, height: this.scale.height }));
    this.world3d.cameraOverride = (cam, dt, target) => this.podium.applyCamera(cam) || this.intro.apply(cam, dt, target);
    this.roundMusic = new RoundMusic();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.world3d.cameraOverride = null;
      this.podium.dispose();
    });

    this.setupGlobalKeys();

    // HUD върви като отделна сцена върху играта.
    this.scene.stop('Hud');
    this.scene.launch('Hud', { game: this });

    // В dev режим сцената е достъпна от конзолата: window.__bum.match.world …
    if (import.meta.env.DEV) (window as unknown as { __bum: GameScene }).__bum = this;
  }

  private makeLabel(p: Player): Label {
    const isMe = p.id === this.match.humanId;
    const text = this.add
      .text(0, 0, p.name, {
        fontFamily: FONT_FAMILY,
        fontSize: isMe ? '18px' : '16px',
        fontStyle: '900',
        color: isMe ? '#ffd23f' : '#ffffff',
        stroke: '#2a1650',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1);
    const bar = this.add.graphics();
    const container = this.add.container(0, 0, [bar, text]);
    return { container, text, bar };
  }

  /** Звукът се разрешава при първо действие; R = нов рунд; M = без звук. */
  private setupGlobalKeys(): void {
    // Всяко натискане отключва звука и пропуска прелитането на камерата.
    const unlock = () => {
      sfx.unlock();
      this.intro.skip();
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, unlock);
    this.input.keyboard?.on('keydown', unlock);
    this.input.keyboard?.on('keydown-R', () => this.restartRound());
    this.input.keyboard?.on('keydown-M', () => (sfx.muted = !sfx.muted));
  }

  /** Нов рунд веднага (със същите настройки). Онлайн рундовете ги пуска сървърът. */
  restartRound(): void {
    if (this.match.online) return;
    this.scene.restart({ settings: this.settings });
  }

  /** Обратно към главното меню (онлайн – излиза от стаята). errorKey – съобщение в менюто. */
  goToMenu(errorKey?: string): void {
    this.match.dispose();
    this.netMatch = null;
    this.scene.stop('Hud');
    this.scene.stop();
    this.game.events.emit('show-menu', errorKey ? { errorKey } : undefined);
  }

  /** Играчът, когото гледаме (ние или наблюдаваният след падане). */
  get focusPlayer(): Player {
    const w = this.match.world;
    if (this.spectateId >= 0) return w.getPlayer(this.spectateId) ?? this.match.human;
    return this.match.human;
  }

  /** Точка от света върху екрана (за HUD-а – напр. стрелката към короната). */
  worldToScreen(x: number, y: number, height = 0): { x: number; y: number; visible: boolean } {
    return this.world3d.project(x, height, y);
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
    if (next) this.spectateId = next.id;
  }

  // ───────────── Изскачащи надписи (екранни, закотвени към точка от света) ─────────────

  private popText(x: number, y: number, h: number, text: string, color: string, scale = 1): void {
    const s = this.world3d.project(x, h, y);
    if (!s.visible) return;
    const txt = this.add
      .text(s.x, s.y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: '900',
        color,
        stroke: '#2a1650',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setScale(0.3 * scale);
    this.tweens.add({
      targets: txt,
      scale,
      y: s.y - 40,
      duration: 260,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.tweens.add({ targets: txt, alpha: 0, y: s.y - 70, duration: 350, delay: 200, onComplete: () => txt.destroy() }),
    });
  }

  private popIcon(x: number, y: number, h: number, frame: string, scale = 1): void {
    const s = this.world3d.project(x, h, y);
    if (!s.visible) return;
    const img = this.add.image(s.x, s.y, ATLAS, frame).setDepth(99).setScale(scale * 0.3);
    img.setRotation((Math.random() - 0.5) * 0.6);
    this.tweens.add({
      targets: img,
      scale: scale * 0.8,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.tweens.add({ targets: img, alpha: 0, y: s.y - 30, duration: 300, delay: 120, onComplete: () => img.destroy() }),
    });
  }

  /** Имената над главите и лентата за живота на колата. */
  private updateLabels(): void {
    const w = this.match.world;
    const cfg = w.cfg;
    for (const p of w.players) {
      const label = this.labels.get(p.id);
      const view = this.world3d.character(p.id);
      if (!label || !view) continue;
      if (!p.alive || this.podium.active) {
        label.container.setVisible(false);
        continue;
      }
      const x = p.prevX + (p.x - p.prevX) * this.match.alpha;
      const y = p.prevY + (p.y - p.prevY) * this.match.alpha;
      const s = this.world3d.project(x, view.headHeight() + (w.crownId === p.id ? 26 : 0), y);
      label.container.setVisible(s.visible).setPosition(s.x, s.y);
      label.container.setDepth(s.y);
      const g = label.bar;
      g.clear();
      if (p.inCar) {
        const frac = Phaser.Math.Clamp(p.carHp / cfg.cars.hp, 0, 1);
        const bw = 56;
        g.fillStyle(0x2a1650, 0.9);
        g.fillRoundedRect(-bw / 2 - 3, 2, bw + 6, 11, 5);
        g.fillStyle(frac > 0.5 ? 0x8ce99a : frac > 0.25 ? 0xffd23f : 0xff5d73, 1);
        g.fillRoundedRect(-bw / 2, 5, bw * frac, 5, 2.5);
      }
    }
  }

  /** Прелитането, подиумът и музиката следват фазата на рунда (преди рисуването на кадъра). */
  private updateCinematics(dtSec: number): void {
    const w = this.match.world;
    const r = w.round;
    const total = w.cfg.round.countdown;
    const elapsed = Math.min(total, r.phaseTime + this.match.alpha * w.dt);
    this.intro.update(dtSec, { phase: r.phase, waiting: this.match.waiting, elapsed, total, arenaRadius: w.arena.radius });
    this.podium.update(dtSec, w);
    this.roundMusic.update({
      phase: r.phase,
      waiting: this.match.waiting,
      countdownLeft: total - elapsed,
      timeLeft: r.timeLeft,
      shrinking: w.arena.shrinking,
      iWon: r.winnerId >= 0 && r.winnerId === this.match.humanId,
    });
  }

  override update(): void {
    // Онлайн: прекъсната връзка → менюто; нов рунд от сървъра → сцената наново.
    if (this.match.disconnected) {
      this.goToMenu(this.match.disconnected);
      return;
    }
    if (this.match.roundId !== this.roundId) {
      this.scene.restart({ settings: this.settings, match: this.match });
      return;
    }
    const now = performance.now();
    const dtSec = this.lastFrameMs ? Math.min((now - this.lastFrameMs) / 1000, 0.1) : 1 / 60;
    this.lastFrameMs = now;
    this.match.update(dtSec, this.humanInput);
    this.frameEvents = this.match.drainEvents();
    this.effects.update(dtSec);
    this.effects.handle(this.frameEvents);

    // Чакаме малко след падането, за да видиш как летиш, после камерата превключва.
    if (!this.match.human.alive && this.match.human.fallTime > 1.2) this.updateSpectate();

    this.updateCinematics(dtSec);
    this.world3d.update(this.match.world, this.match.alpha, dtSec, this.focusPlayer, this.match.humanId);
    this.updateLabels();
  }
}
