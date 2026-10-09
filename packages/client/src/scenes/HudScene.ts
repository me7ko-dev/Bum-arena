import Phaser from 'phaser';
import {
  SHOP_ITEM_IDS,
  abilityCooldownTotal,
  type GameEvent,
  type Player,
  type ShopItemId,
} from '@bum/shared';
import { ATLAS } from '../assets';
import { ABILITY_INFO } from '../game/settings';
import { sfx } from '../audio/Sfx';
import { t, toggleLang } from '../i18n';
import { FONT_FAMILY } from '../theme';
import { AbilityButton } from '../ui/AbilityButton';
import { showBanner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { CoinFly } from '../ui/CoinFly';
import { CountdownFx } from '../ui/CountdownFx';
import { addFace, ensureFaces } from '../ui/faces';
import { KillFeed } from '../ui/KillFeed';
import { buildEliminatedPanel, buildResultsPanel } from '../ui/Panels';
import { ShopButton } from '../ui/ShopButton';
import { StatCounter } from '../ui/StatCounter';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { inviteLink } from '../net/links';
import type { GameScene } from './GameScene';

export interface HudData {
  game: GameScene;
}

/** Брояч на FPS: в режим за разработка или с ?fps в адреса. */
function showFps(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('fps');
}

/** Иконки на нещата от магазина. */
const SHOP_ICONS: Record<ShopItemId, string> = { size: 'muscle', speed: 'shoe', shield: 'bubbles', mega: 'glove' };

/** Височина на картата със стаята (онлайн). */
const ROOM_BOX_H = 132;

/** След колко ms от края на рунда се показва класирането (камерата вече лети към подиума). */
const RESULTS_DELAY = 2000;

/** Цветът на медала за 1, 2, 3 място (етикетите над подиума). */
const MEDAL_COLORS = [0xffc928, 0x9fd3ff, 0xff9a62];

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontStyle: '900',
  color: '#ffffff',
  stroke: '#2a1650',
  strokeThickness: 6,
};

/**
 * HUD – всичко, което е „върху екрана“ и не се мащабира с камерата:
 * бутон за суперсила, таймер, броячи, отброяване, панели „Падна!“ и „Класиране“.
 * Работи паралелно с GameScene и само чете състоянието ѝ.
 */
export class HudScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private abilityBtn!: AbilityButton;
  private coinCounter!: StatCounter;
  private koCounter!: StatCounter;
  private timerText!: Phaser.GameObjects.Text;
  private aliveBox!: Phaser.GameObjects.Container;
  private aliveBg!: Phaser.GameObjects.Graphics;
  private aliveText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private countdown!: CountdownFx;
  private spectateText!: Phaser.GameObjects.Text;
  private skipHint!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private soundBtn!: Button;
  private joystick!: VirtualJoystick;
  /** Пръстът, който държи бутона за суперсила (-1 = никой). */
  private abilityPointerId = -1;
  private isTouch = false;
  private shopButtons = new Map<ShopItemId, ShopButton>();
  private feed!: KillFeed;
  private coinFly!: CoinFly;
  private crownArrow!: Phaser.GameObjects.Container;
  /** Червено сияние по ръбовете в последните 10 секунди. */
  private vignette!: Phaser.GameObjects.Image;
  /** Панелът „Падна!“ или „Класиране“ (само един наведнъж). */
  private panel: Phaser.GameObjects.Container | null = null;
  private panelKind: 'eliminated' | 'results' | null = null;
  /** Кога е показан панелът „Падна!“ (да не се показва пак след „Гледай“). */
  private eliminatedShown = false;
  /** Последно показаните секунди / живи – за „подскоците“ при промяна. */
  private lastSecs = -1;
  private lastAlive = -1;
  /** Етикетите с имената над героите на подиума. */
  private podiumLabels: Phaser.GameObjects.Container[] = [];

  // ── Онлайн ──
  /** Карта със стаята и „Копирай линк“ (в лобито и при отброяването). */
  private roomBox: Phaser.GameObjects.Container | null = null;
  private roomTitle!: Phaser.GameObjects.Text;
  private roomHint!: Phaser.GameObjects.Text;
  /** Линкът като текст – ако копирането не е успяло. */
  private linkText!: Phaser.GameObjects.Text;
  private pingText: Phaser.GameObjects.Text | null = null;
  private spectatorBanner: Phaser.GameObjects.Text | null = null;
  /** До кога (this.time.now) в картата пише „Линкът е копиран!“. */
  private copiedUntil = 0;
  /** „Следващ рунд след N…“ в панела с класирането. */
  private nextRoundText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Hud');
  }

  init(data: HudData): void {
    this.gameScene = data.game;
    this.panel = null;
    this.panelKind = null;
    this.eliminatedShown = false;
    this.roomBox = null;
    this.pingText = null;
    this.spectatorBanner = null;
    this.nextRoundText = null;
    this.shopButtons = new Map();
    this.lastSecs = -1;
    this.lastAlive = -1;
    this.podiumLabels = [];
  }

  create(): void {
    const me = this.gameScene.match.human;
    ensureFaces(this);
    this.makeVignetteTexture();
    this.vignette = this.add.image(0, 0, 'hud-vignette').setOrigin(0).setAlpha(0).setDepth(-2);
    this.abilityBtn = new AbilityButton(this, 46, ABILITY_INFO[me.ability].icon, 'SPACE');
    for (const [i, item] of SHOP_ITEM_IDS.entries()) {
      const btn = new ShopButton(this, 27, SHOP_ICONS[item], this.gameScene.match.world.cfg.shop[item].price, String(i + 1), () => {
        sfx.unlock();
        this.gameScene.humanInput.buy(item);
      });
      this.shopButtons.set(item, btn);
    }
    this.feed = new KillFeed(this);
    const arrowG = this.add.graphics();
    arrowG.fillStyle(0xffd23f, 1);
    arrowG.fillTriangle(30, 0, 14, -12, 14, 12);
    this.crownArrow = this.add.container(0, 0, [
      arrowG,
      this.add.image(0, 0, ATLAS, 'crown').setScale(0.28),
    ]);
    this.crownArrow.setVisible(false);
    this.coinCounter = new StatCounter(this, 'coin', 0.3, '#ffd23f');
    this.koCounter = new StatCounter(this, 'boom', 0.3);
    this.coinFly = new CoinFly(
      this,
      () => ({ x: this.coinCounter.container.x, y: this.coinCounter.container.y }),
      (step) => {
        sfx.coinLand(step);
        this.tweens.add({ targets: this.coinCounter.container, scale: { from: 1.18, to: 1 }, duration: 180, ease: 'Back.easeOut' });
      },
    );
    // Център в средата – при пулсиране в последните секунди расте във всички посоки.
    this.timerText = this.add.text(0, 0, '3:00', { ...TEXT_STYLE, fontSize: '34px' }).setOrigin(0.5, 0.5);
    this.aliveBg = this.add.graphics();
    this.aliveText = this.add.text(0, 0, '', { ...TEXT_STYLE, fontSize: '17px', strokeThickness: 4 }).setOrigin(0.5);
    this.aliveBox = this.add.container(0, 0, [this.aliveBg, this.aliveText]);
    this.bannerText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '26px', color: '#ff8fa3' })
      .setOrigin(0.5)
      .setVisible(false);
    this.countdown = new CountdownFx(this);
    this.spectateText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5, 1);
    this.skipHint = this.add
      .text(0, 0, t('hud.skipIntro'), { ...TEXT_STYLE, fontSize: '17px', strokeThickness: 4, color: '#e5dbff' })
      .setOrigin(0.5, 1)
      .setVisible(false);

    this.fpsText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '14px', strokeThickness: 3 })
      .setOrigin(0, 0)
      .setVisible(showFps());
    this.soundBtn = new Button(this, sfx.muted ? '×' : '♪', () => this.toggleSound(), {
      width: 48,
      height: 44,
      fontSize: 24,
      color: 0x6b5a8e,
    });

    if (this.gameScene.match.online) this.createNetUi();

    this.setupTouch();

    // Enter / Space на панелите
    this.input.keyboard?.on('keydown-ENTER', () => this.onPrimaryKey());
    this.input.keyboard?.on('keydown-SPACE', () => this.onPrimaryKey());

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.coinFly.reset();
    });
  }

  /** Червено сияние по ръбовете (текстура, рисувана веднъж). */
  private makeVignetteTexture(): void {
    if (this.textures.exists('hud-vignette')) return;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 70, 128, 128, 182);
    grad.addColorStop(0, 'rgba(255,40,80,0)');
    grad.addColorStop(1, 'rgba(255,40,80,0.85)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    this.textures.addCanvas('hud-vignette', c);
  }

  /** Подрежда елементите според размера на екрана. */
  private layout(): void {
    const { width, height } = this.scale;
    const pad = Math.max(24, Math.min(width, height) * 0.05);
    this.abilityBtn.container.setPosition(width - pad - 46, height - pad - 56);
    // Магазинът – колона над бутона за суперсила (лесно с палец).
    let i = 0;
    for (const btn of this.shopButtons.values()) {
      btn.container.setPosition(width - pad - 34, height - pad - 56 - 112 - i * 66);
      i++;
    }
    // Лентата с избутванията – горе вдясно, под бутона за звука (подравнена отдясно).
    // На тесен екран – по-ниско, за да не опира в хапчето „N в игра“ под таймера.
    this.feed.container.setPosition(width - pad + 8, pad + (width < 520 ? 88 : 66));
    this.feed.maxName = width < 520 ? 7 : 12;
    this.feed.maxRows = width < 520 ? 3 : 4;
    this.coinCounter.container.setPosition(pad + 10, pad + 10);
    this.koCounter.container.setPosition(pad + 10, pad + 62);
    this.timerText.setPosition(width / 2, pad + 9);
    this.aliveBox.setPosition(width / 2, pad + 42);
    this.bannerText.setPosition(width / 2, pad + 84);
    this.countdown.layout(width, height);
    this.vignette.setDisplaySize(width, height);
    this.spectateText.setPosition(width / 2, height - pad);
    this.skipHint.setPosition(width / 2, height - pad + 6);
    this.fpsText.setPosition(pad - 10, pad + 92);
    this.pingText?.setPosition(pad - 10, pad + (this.fpsText.visible ? 110 : 92));
    this.spectatorBanner?.setPosition(width / 2, height - pad - 30);
    this.layoutRoomBox(width, height, pad);
    this.soundBtn.container.setPosition(width - pad - 24, pad + 18);
    if (this.panelKind === 'results' && this.panel) this.showResults(false);
    else this.panel?.setPosition(width / 2, this.eliminatedY());
  }

  /** Височина на големите ленти: на тесен екран – под лентата с избутванията. */
  private bannerY(): number {
    const { width, height } = this.scale;
    return width < 700 ? Math.max(height * 0.34, 290) : height * 0.27;
  }

  /** „Падна!“ – в центъра; на изправен телефон малко по-ниско (горе е таймерът и лентата). */
  private eliminatedY(): number {
    const { width, height } = this.scale;
    return width < height ? height * 0.54 : height / 2 + 10;
  }

  /** Сензорно управление: джойстик навсякъде извън бутоните + бутон за суперсила. */
  private setupTouch(): void {
    this.isTouch = this.sys.game.device.input.touch;
    this.abilityBtn.setKeyHintVisible(!this.isTouch);
    for (const b of this.shopButtons.values()) b.setKeyHintVisible(!this.isTouch);
    this.joystick = new VirtualJoystick(this);
    this.joystick.setDepth(-1);
    this.input.addPointer(2); // общо 3 пръста

    // Бутонът за суперсила.
    const btn = this.abilityBtn;
    btn.container.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      this.abilityPointerId = p.id;
      btn.pressed = true;
      this.gameScene.humanInput.setTouchAbility(true);
    });

    // Джойстик – при докосване на празно място (не върху бутон/панел).
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        sfx.unlock();
        if (over.length > 0 || this.panel || !p.wasTouch) return;
        if (!this.joystick.active) this.joystick.start(p);
      },
    );
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.joystick.move(p));
    const release = (p: Phaser.Input.Pointer) => {
      this.joystick.end(p);
      if (p.id === this.abilityPointerId) {
        this.abilityPointerId = -1;
        btn.pressed = false;
        this.gameScene.humanInput.setTouchAbility(false);
      }
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  }

  private toggleSound(): void {
    sfx.unlock();
    sfx.muted = !sfx.muted;
    this.soundBtn.setLabel(sfx.muted ? '×' : '♪');
  }

  override update(_time: number, deltaMs: number): void {
    const match = this.gameScene.match;
    const world = match.world;
    const me = match.human;
    const dtSec = deltaMs / 1000;
    const r = world.round;
    const ended = r.phase === 'ended';

    for (const e of this.gameScene.frameEvents) this.onEvent(e);

    // Сензорно движение → входа на човека.
    this.gameScene.humanInput.setTouchMove(this.joystick.x, this.joystick.y);
    if (this.isTouch && me.alive && !this.panel && !ended && !this.gameScene.intro.active) {
      const { height } = this.scale;
      const pad = Math.max(24, Math.min(this.scale.width, height) * 0.05);
      this.joystick.showIdleHint(pad + 90, height - pad - 90);
    } else if (!this.joystick.active) {
      this.joystick.setVisible(false);
    }
    if (this.fpsText.visible) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    if (match.online) this.updateNetUi();
    this.soundBtn.setLabel(sfx.muted ? '×' : '♪');

    // Суперсила
    const becameReady = this.abilityBtn.update(me.abilityCooldown, abilityCooldownTotal(world.cfg, me), dtSec);
    if (becameReady && me.alive && r.phase === 'playing') sfx.ready();
    // В лобито (онлайн) светът стои – без суперсила и магазин.
    const inPlay = me.alive && !ended && !match.waiting;
    this.abilityBtn.container.setVisible(inPlay);
    this.abilityBtn.setIcon(me.inCar ? 'wrench' : ABILITY_INFO[me.ability].icon);

    // Магазин
    for (const [item, btn] of this.shopButtons) {
      btn.container.setVisible(inPlay);
      const price = world.cfg.shop[item].price;
      const active =
        (item === 'size' && me.buffSize > 0) ||
        (item === 'speed' && me.buffSpeed > 0) ||
        (item === 'shield' && me.buffShield > 0) ||
        (item === 'mega' && me.buffMega > 0);
      btn.update(me.coins >= price && r.phase === 'playing', active, dtSec);
    }

    this.feed.update(dtSec);
    this.updateCrownArrow();

    // Броячи (монетите – без летящите към брояча: числото скача, когато пристигнат)
    this.coinCounter.set(Math.max(0, me.coins - Math.round(this.coinFly.inFlight)));
    this.coinCounter.update(dtSec);
    this.koCounter.set(me.knockouts);
    this.koCounter.update(dtSec);

    this.updateTimer();
    this.updateAlive(world.alivePlayers().length);

    // В края (подиумът): махаме всичко от играта – остават само подиумът и класирането.
    for (const o of [this.timerText, this.aliveBox, this.coinCounter.container, this.koCounter.container]) o.setVisible(!ended);
    this.feed.setVisible(!ended);

    // Предупреждение за свиване
    const arena = world.arena;
    if (r.phase === 'playing' && arena.shrinking) {
      this.bannerText.setVisible(true).setText(t('arenaShrinking'));
    } else if (r.phase === 'playing' && arena.shrinkIn >= 0 && arena.shrinkIn <= world.cfg.arena.shrinkWarning) {
      this.bannerText.setVisible(true).setText(t('arenaShrinkIn', { n: Math.ceil(arena.shrinkIn) }));
    } else {
      this.bannerText.setVisible(false);
    }
    if (this.bannerText.visible) this.bannerText.setScale(1 + 0.06 * Math.sin(this.time.now / 90));

    // Подсказка „Натисни, за да пропуснеш“ по време на прелитането.
    const intro = this.gameScene.intro.active && !match.waiting && !this.roomBox?.visible;
    this.skipHint.setVisible(intro);
    if (intro) this.skipHint.setAlpha(0.55 + 0.45 * Math.sin(this.time.now / 220));

    // Наблюдение
    const focus = this.gameScene.focusPlayer;
    this.spectateText.setVisible(!me.alive && focus.id !== me.id && !ended && !this.panel);
    this.spectateText.setText(t('spectating', { name: focus.name }));

    this.updatePodiumLabels();

    // Панели
    if (ended && this.panelKind !== 'results') {
      this.time.delayedCall(RESULTS_DELAY, () => this.showResults(true));
      this.panelKind = 'results'; // за да не се вика пак, докато чака
      this.closePanel(false);
    } else if (!me.alive && !match.isSpectator && r.phase === 'playing' && !this.eliminatedShown && me.fallTime > 0.9) {
      this.eliminatedShown = true;
      this.showEliminated();
    }
  }

  /** Таймерът: в последните 10 сек – червен, пулсира всяка секунда, „тик“ и червено сияние. */
  private updateTimer(): void {
    const world = this.gameScene.match.world;
    const r = world.round;
    const secs = r.phase === 'countdown' ? world.cfg.round.duration : Math.ceil(r.timeLeft);
    this.timerText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    const final = r.phase === 'playing' && secs <= 10;
    this.timerText.setColor(final ? '#ff5d73' : r.phase === 'playing' && secs <= 30 ? '#ffd23f' : '#ffffff');
    if (r.phase === 'playing' && this.lastSecs > 0 && secs < this.lastSecs) {
      const { width } = this.scale;
      // Ако е отворен панел („Падна!“) – без голяма лента върху него.
      if (secs === 30 && !this.panel) {
        showBanner(this, width / 2, this.bannerY(), width - 40, { title: t('hud.last30'), icon: 'bolt', color: 0x9c6bff, hold: 1300 });
      }
      if (secs === 10 && !this.panel) {
        showBanner(this, width / 2, this.bannerY(), width - 40, { title: t('hud.last10'), icon: 'fire', color: 0xff5d73, hold: 1300 });
      }
      if (final && secs > 0) {
        sfx.tick(secs <= 5);
        this.tweens.killTweensOf(this.timerText);
        this.timerText.setScale(secs <= 5 ? 1.75 : 1.5);
        this.tweens.add({ targets: this.timerText, scale: 1.15, duration: 420, ease: 'Back.easeOut' });
        this.vignette.setAlpha(secs <= 5 ? 0.75 : 0.45);
        this.tweens.killTweensOf(this.vignette);
        this.tweens.add({ targets: this.vignette, alpha: 0, duration: 700, ease: 'Cubic.easeOut' });
      }
    }
    if (!final && this.timerText.scale !== 1 && !this.tweens.isTweening(this.timerText)) this.timerText.setScale(1);
    this.lastSecs = secs;
  }

  /** „8 в игра“ – хапче под таймера, което подскача (и почервенява за миг), щом някой падне. */
  private updateAlive(n: number): void {
    if (n === this.lastAlive) return;
    const first = this.lastAlive < 0;
    const fewer = n < this.lastAlive;
    this.lastAlive = n;
    this.aliveText.setText(t('alive', { n }));
    const w = this.aliveText.width + 28;
    const g = this.aliveBg;
    g.clear();
    g.fillStyle(0x2a1650, 0.65);
    g.fillRoundedRect(-w / 2, -15, w, 30, 15);
    if (first) return;
    this.tweens.killTweensOf(this.aliveBox);
    this.aliveBox.setScale(1.5);
    this.tweens.add({ targets: this.aliveBox, scale: 1, duration: 380, ease: 'Back.easeOut' });
    if (fewer) {
      this.aliveText.setColor('#ff8fa3');
      this.time.delayedCall(450, () => this.aliveText.setColor('#ffffff'));
    }
  }

  private onEvent(e: GameEvent): void {
    const match = this.gameScene.match;
    const meId = match.humanId;
    const world = match.world;
    switch (e.type) {
      case 'countdown':
        sfx.countdown(e.n);
        this.countdown.show(e.n, e.n > 0 ? String(e.n) : t('go'));
        break;
      case 'arenaWarning':
        sfx.warning();
        break;
      case 'coinPickup':
        if (e.playerId === meId) {
          const s = this.gameScene.worldToScreen(e.x, e.y, 30);
          if (s.visible) this.coinFly.spawn(s.x, s.y, e.value);
        }
        break;
      case 'fall': {
        if (e.playerId === meId) this.time.delayedCall(1000, () => sfx.lose());
        const victim = world.getPlayer(e.playerId);
        const by = e.byId !== null ? world.getPlayer(e.byId) : undefined;
        if (victim) {
          this.feed.add(by, victim, meId);
          if (e.byId === meId && meId >= 0) this.koToast(victim);
        }
        break;
      }
      case 'buy':
        if (e.playerId === meId) this.shopButtons.get(e.item)?.flash();
        break;
      case 'crown':
        if (e.playerId === meId && meId >= 0) {
          const { width } = this.scale;
          showBanner(this, width / 2, this.bannerY(), width - 40, {
            title: t('hud.leader'),
            subtitle: t('hud.leaderSub'),
            icon: 'crown',
            color: 0xffb81f,
          });
        }
        break;
    }
  }

  /** Малко съобщение при твое избутване: [лице] „Избута Мими!“. */
  private koToast(victim: Player): void {
    const { width, height } = this.scale;
    const face = addFace(this, victim.skin, 40);
    const txt = this.add
      .text(0, 0, t('hud.knockedOut', { name: victim.name }), { ...TEXT_STYLE, fontSize: '22px', color: '#8ce99a', strokeThickness: 5 })
      .setOrigin(0, 0.5);
    const w = txt.width + 40 + 26;
    face.setPosition(-w / 2 + 26, 0);
    txt.setPosition(-w / 2 + 52, 0);
    const bg = this.add.graphics();
    bg.fillStyle(0x2a1650, 0.8);
    bg.fillRoundedRect(-w / 2, -25, w + 6, 50, 25);
    bg.lineStyle(3, 0x8ce99a, 1);
    bg.strokeRoundedRect(-w / 2, -25, w + 6, 50, 25);
    const c = this.add.container(width / 2, height * 0.7, [bg, face, txt]).setDepth(55).setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: c.y - 50, alpha: 0, delay: 1300, duration: 400, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  /** Стрелка по ръба на екрана към короната, ако носителят не се вижда. */
  private updateCrownArrow(): void {
    const world = this.gameScene.match.world;
    const holder = world.crownId >= 0 ? world.getPlayer(world.crownId) : undefined;
    if (!holder || !holder.alive || holder.id === this.gameScene.focusPlayer.id || world.round.phase !== 'playing') {
      this.crownArrow.setVisible(false);
      return;
    }
    const sp = this.gameScene.worldToScreen(holder.x, holder.y, 40);
    if (sp.visible) {
      this.crownArrow.setVisible(false);
      return;
    }
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const ang = Math.atan2(sp.y - cy, sp.x - cx);
    const margin = 46;
    const kx = (cx - margin) / Math.max(1e-6, Math.abs(Math.cos(ang)));
    const ky = (cy - margin) / Math.max(1e-6, Math.abs(Math.sin(ang)));
    const k = Math.min(kx, ky);
    this.crownArrow.setVisible(true).setPosition(cx + Math.cos(ang) * k, cy + Math.sin(ang) * k);
    (this.crownArrow.list[0] as Phaser.GameObjects.Graphics).setRotation(ang);
  }

  /** Имената над героите на подиума: медал с мястото + име (твоето – в злато). */
  private updatePodiumLabels(): void {
    const podium = this.gameScene.podium;
    if (!podium.showLabels) {
      for (const l of this.podiumLabels) l.setVisible(false);
      return;
    }
    const labels = podium.labels();
    if (this.podiumLabels.length === 0) {
      const meId = this.gameScene.match.humanId;
      const narrow = this.scale.width < 600;
      for (const l of labels) {
        const name = this.add
          .text(0, 0, l.name, {
            ...TEXT_STYLE,
            fontSize: narrow ? '15px' : '18px',
            strokeThickness: 5,
            color: l.playerId === meId ? '#ffd23f' : '#ffffff',
          })
          .setOrigin(0, 0.5);
        const maxW = narrow ? 84 : 130;
        if (name.width > maxW) name.setScale(maxW / name.width);
        const w = name.displayWidth + 44;
        const g = this.add.graphics();
        g.fillStyle(0x2a1650, 0.85);
        g.fillRoundedRect(-w / 2, -16, w, 32, 16);
        g.lineStyle(3, MEDAL_COLORS[l.place - 1]!, 1);
        g.strokeRoundedRect(-w / 2, -16, w, 32, 16);
        g.fillStyle(MEDAL_COLORS[l.place - 1]!, 1);
        g.fillCircle(-w / 2 + 16, 0, 12);
        const num = this.add.text(-w / 2 + 16, 1, String(l.place), { ...TEXT_STYLE, fontSize: '16px', strokeThickness: 4 }).setOrigin(0.5);
        name.setPosition(-w / 2 + 34, 0);
        const c = this.add.container(0, 0, [g, num, name]).setDepth(40).setScale(0.2);
        this.tweens.add({ targets: c, scale: 1, duration: 360, delay: (3 - l.place) * 90, ease: 'Back.easeOut' });
        this.podiumLabels.push(c);
      }
    }
    labels.forEach((l, i) => {
      const c = this.podiumLabels[i];
      if (!c) return;
      const s = this.gameScene.worldToScreen(l.x, l.z, l.y);
      c.setVisible(s.visible).setPosition(s.x, s.y - 18);
    });
  }

  private onPrimaryKey(): void {
    // Онлайн следващият рунд го пуска сървърът.
    if (this.panelKind === 'results' && this.panel && !this.gameScene.match.online) this.gameScene.restartRound();
  }

  // ───────────── Онлайн: стая, пинг, гледане ─────────────

  private createNetUi(): void {
    const match = this.gameScene.match;
    this.pingText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '14px', strokeThickness: 3 })
      .setOrigin(0, 0);
    this.spectatorBanner = this.add
      .text(0, 0, t('net.spectatorBanner'), { ...TEXT_STYLE, fontSize: '20px', color: '#9be7ff', strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    if (!match.roomId) return;

    const w = Math.min(340, this.scale.width - 32);
    const h = ROOM_BOX_H;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.3);
    bg.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 22);
    bg.fillStyle(0x2a1650, 0.88);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    bg.lineStyle(3, 0xffd23f, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.roomTitle = this.add
      .text(0, -h / 2 + 22, '', { ...TEXT_STYLE, fontSize: '22px', color: '#ffd23f', strokeThickness: 5 })
      .setOrigin(0.5);
    this.roomHint = this.add
      .text(0, -h / 2 + 50, '', { ...TEXT_STYLE, fontSize: '15px', strokeThickness: 4, color: '#e5dbff' })
      .setOrigin(0.5);
    const copy = new Button(this, t('net.copyLink'), () => this.copyLink(), {
      width: Math.min(220, w - 40),
      height: 44,
      fontSize: 20,
      color: 0x4dabf7,
    });
    copy.container.setPosition(0, h / 2 - 34);
    this.linkText = this.add
      .text(0, h / 2 + 18, '', {
        ...TEXT_STYLE,
        fontSize: '14px',
        strokeThickness: 4,
        align: 'center',
        wordWrap: { width: w - 16, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.roomBox = this.add.container(0, 0, [bg, this.roomTitle, this.roomHint, copy.container, this.linkText]);
    this.roomBox.setVisible(false);
  }

  /**
   * Картата със стаята не бива да закрива отброяването (3, 2, 1) в центъра:
   * на широк екран е долу в средата (между джойстика и бутоните),
   * на тесен (телефон изправен) – горе, под броячите.
   */
  private layoutRoomBox(width: number, height: number, pad: number): void {
    if (!this.roomBox) return;
    const h = ROOM_BOX_H;
    const bottom = width >= 760;
    this.roomBox.setPosition(width / 2, bottom ? height - pad - h / 2 - 8 : pad + 132 + h / 2);
    // Линкът за ръчно копиране – откъм свободната страна на картата.
    if (bottom) this.linkText.setOrigin(0.5, 1).setPosition(0, -h / 2 - 10);
    else this.linkText.setOrigin(0.5, 0).setPosition(0, h / 2 + 14);
  }

  private updateNetUi(): void {
    const match = this.gameScene.match;
    const phase = match.world.round.phase;

    if (this.pingText) {
      const ping = match.ping;
      this.pingText.setText(ping === null ? t('net.ping', { n: '…' }) : t('net.ping', { n: ping }));
      this.pingText.setColor(ping === null || ping < 90 ? '#b2f2bb' : ping < 180 ? '#ffd23f' : '#ff8fa3');
    }
    this.spectatorBanner?.setVisible(match.isSpectator && phase !== 'ended' && !this.panel);

    if (this.roomBox && match.roomId) {
      const show = (match.waiting || phase === 'countdown') && !this.panel;
      this.roomBox.setVisible(show);
      if (show) {
        this.roomTitle.setText(t('net.room', { id: match.roomId }));
        const n = match.startsIn;
        const copied = this.time.now < this.copiedUntil;
        this.roomHint.setColor(copied ? '#b2f2bb' : '#e5dbff');
        this.roomHint.setText(
          copied
            ? t('net.copied')
            : n !== null && n > 0
              ? t('net.startsIn', { n })
              : match.waiting
                ? t('net.waiting')
                : t('net.inviteHint'),
        );
      }
    }

    if (this.nextRoundText) {
      const n = match.nextRoundIn;
      this.nextRoundText.setText(n !== null && n > 0 ? t('net.nextRound', { n }) : t('net.nextRoundSoon'));
    }
  }

  /** Копира линка за покана; ако не може – показва го като текст. */
  private copyLink(): void {
    sfx.unlock();
    const roomId = this.gameScene.match.roomId;
    if (!roomId) return;
    const link = inviteLink(roomId);
    const ok = () => {
      this.copiedUntil = this.time.now + 2000;
      this.linkText.setVisible(false);
      sfx.coin(0.6, 0);
    };
    const fail = () => {
      if (copyWithTextarea(link)) ok();
      else this.linkText.setText(`${t('net.copyManually')}\n${link}`).setVisible(true);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(ok, fail);
    else fail();
  }

  // ───────────── Панели ─────────────

  private closePanel(resetKind = true): void {
    this.panel?.destroy();
    this.panel = null;
    this.nextRoundText = null;
    if (resetKind) this.panelKind = null;
  }

  /** Панел след падане: кой те избута, кое място си, „Нова игра“ или „Гледай“. */
  private showEliminated(): void {
    this.closePanel();
    const match = this.gameScene.match;
    const panel = buildEliminatedPanel(this, {
      world: match.world,
      me: match.human,
      online: match.online,
      width: this.scale.width,
      onAgain: () => this.gameScene.restartRound(),
      onMenu: () => this.gameScene.goToMenu(),
      onSpectate: () => this.closePanel(),
    });
    panel.setPosition(this.scale.width / 2, this.eliminatedY());
    this.panel = panel;
    this.panelKind = 'eliminated';
    panel.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  }

  /**
   * Класирането в края: карта отстрани (широк екран) или лист отдолу (телефон),
   * за да се вижда подиумът. animate=false – при смяна на размера/езика.
   */
  private showResults(animate: boolean): void {
    this.closePanel();
    const match = this.gameScene.match;
    const res = buildResultsPanel(this, {
      world: match.world,
      meId: match.humanId,
      online: match.online,
      width: this.scale.width,
      height: this.scale.height,
      onAgain: () => this.gameScene.restartRound(),
      onMenu: () => this.gameScene.goToMenu(),
      onLang: () => {
        toggleLang();
        this.showResults(false);
      },
    });
    this.panel = res.container;
    this.panelKind = 'results';
    this.nextRoundText = res.nextRoundText;
    if (match.online) this.updateNetUi();
    res.enter(animate);
  }
}

/** Старият начин за копиране (работи и без https, напр. от телефон в местната мрежа). */
function copyWithTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
