import Phaser from 'phaser';
import {
  SHOP_ITEM_IDS,
  abilityCooldownTotal,
  placeOf,
  standings,
  type GameEvent,
  type ShopItemId,
} from '@bum/shared';
import { ATLAS } from '../assets';
import { ABILITY_INFO } from '../game/settings';
import { sfx } from '../audio/Sfx';
import { t, toggleLang } from '../i18n';
import { FONT_FAMILY } from '../theme';
import { AbilityButton } from '../ui/AbilityButton';
import { Button } from '../ui/Button';
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
  private aliveText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private spectateText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private soundBtn!: Button;
  private joystick!: VirtualJoystick;
  /** Пръстът, който държи бутона за суперсила (-1 = никой). */
  private abilityPointerId = -1;
  private isTouch = false;
  private shopButtons = new Map<ShopItemId, ShopButton>();
  private feed!: Phaser.GameObjects.Container;
  private feedItems: { c: Phaser.GameObjects.Container; age: number }[] = [];
  private crownArrow!: Phaser.GameObjects.Container;
  /** Панелът „Падна!“ или „Класиране“ (само един наведнъж). */
  private panel: Phaser.GameObjects.Container | null = null;
  private panelKind: 'eliminated' | 'results' | null = null;
  /** Кога е показан панелът „Падна!“ (да не се показва пак след „Гледай“). */
  private eliminatedShown = false;

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
  }

  create(): void {
    const me = this.gameScene.match.human;
    this.abilityBtn = new AbilityButton(this, 46, ABILITY_INFO[me.ability].icon, 'SPACE');
    for (const [i, item] of SHOP_ITEM_IDS.entries()) {
      const btn = new ShopButton(this, 27, SHOP_ICONS[item], this.gameScene.match.world.cfg.shop[item].price, String(i + 1), () => {
        sfx.unlock();
        this.gameScene.humanInput.buy(item);
      });
      this.shopButtons.set(item, btn);
    }
    this.feed = this.add.container(0, 0);
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
    this.timerText = this.add.text(0, 0, '3:00', { ...TEXT_STYLE, fontSize: '34px' }).setOrigin(0.5, 0);
    this.aliveText = this.add.text(0, 0, '', { ...TEXT_STYLE, fontSize: '18px', strokeThickness: 4 }).setOrigin(0.5, 0);
    this.bannerText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '26px', color: '#ff8fa3' })
      .setOrigin(0.5)
      .setVisible(false);
    this.bigText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '120px', color: '#ffd23f', strokeThickness: 14 })
      .setOrigin(0.5)
      .setAlpha(0);
    this.spectateText = this.add
      .text(0, 0, '', { ...TEXT_STYLE, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5, 1);

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
    });
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
    this.feed.setPosition(width - pad - 66, pad + 60);
    this.coinCounter.container.setPosition(pad + 10, pad + 10);
    this.koCounter.container.setPosition(pad + 10, pad + 62);
    this.timerText.setPosition(width / 2, pad - 12);
    this.aliveText.setPosition(width / 2, pad + 28);
    this.bannerText.setPosition(width / 2, pad + 78);
    this.bigText.setPosition(width / 2, height * 0.38);
    this.spectateText.setPosition(width / 2, height - pad);
    this.fpsText.setPosition(pad - 10, pad + 92);
    this.pingText?.setPosition(pad - 10, pad + (this.fpsText.visible ? 110 : 92));
    this.spectatorBanner?.setPosition(width / 2, height - pad - 30);
    this.layoutRoomBox(width, height, pad);
    this.soundBtn.container.setPosition(width - pad - 24, pad + 18);
    this.panel?.setPosition(width / 2, height / 2);
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

    for (const e of this.gameScene.frameEvents) this.onEvent(e);

    // Сензорно движение → входа на човека.
    this.gameScene.humanInput.setTouchMove(this.joystick.x, this.joystick.y);
    if (this.isTouch && me.alive && !this.panel && world.round.phase !== 'ended') {
      const { height } = this.scale;
      const pad = Math.max(24, Math.min(this.scale.width, height) * 0.05);
      this.joystick.showIdleHint(pad + 90, height - pad - 90);
    } else if (!this.joystick.active) {
      this.joystick.setVisible(false);
    }
    if (this.fpsText.visible) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    if (match.online) this.updateNetUi();

    // Суперсила
    const becameReady = this.abilityBtn.update(me.abilityCooldown, abilityCooldownTotal(world.cfg, me), dtSec);
    if (becameReady && me.alive && world.round.phase === 'playing') sfx.ready();
    // В лобито (онлайн) светът стои – без суперсила и магазин.
    const inPlay = me.alive && world.round.phase !== 'ended' && !match.waiting;
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
      btn.update(me.coins >= price && world.round.phase === 'playing', active, dtSec);
    }

    this.updateFeed(dtSec);
    this.updateCrownArrow();

    // Броячи
    this.coinCounter.set(me.coins);
    this.coinCounter.update(dtSec);
    this.koCounter.set(me.knockouts);
    this.koCounter.update(dtSec);

    // Таймер и живи
    const r = world.round;
    const secs = r.phase === 'countdown' ? world.cfg.round.duration : Math.ceil(r.timeLeft);
    this.timerText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.timerText.setColor(r.phase === 'playing' && secs <= 10 ? '#ff8fa3' : '#ffffff');
    this.aliveText.setText(t('alive', { n: world.alivePlayers().length }));

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

    // Наблюдение
    const focus = this.gameScene.focusPlayer;
    this.spectateText.setVisible(!me.alive && focus.id !== me.id && this.panelKind !== 'results');
    this.spectateText.setText(t('spectating', { name: focus.name }));

    // Панели
    if (r.phase === 'ended' && this.panelKind !== 'results') {
      this.time.delayedCall(900, () => this.showResults());
      this.panelKind = 'results'; // за да не се вика пак, докато чака
      this.closePanel(false);
    } else if (!me.alive && !match.isSpectator && r.phase === 'playing' && !this.eliminatedShown && me.fallTime > 0.9) {
      this.eliminatedShown = true;
      this.showEliminated();
    }
  }

  private onEvent(e: GameEvent): void {
    const meId = this.gameScene.match.humanId;
    switch (e.type) {
      case 'countdown':
        sfx.countdown(e.n);
        this.flashBig(e.n > 0 ? String(e.n) : t('go'));
        break;
      case 'arenaWarning':
        sfx.warning();
        break;
      case 'roundEnd':
        if (e.winnerId === meId) sfx.win();
        else if (this.gameScene.match.human.alive) sfx.lose();
        break;
      case 'fall':
        if (e.playerId === meId) this.time.delayedCall(250, () => sfx.lose());
        this.addFeed(e.byId, e.playerId);
        break;
      case 'buy':
        if (e.playerId === meId) this.shopButtons.get(e.item)?.flash();
        break;
      case 'crown':
        if (e.playerId === meId) this.flashBanner(t('crownYours'));
        break;
    }
  }

  /** Кратко съобщение под таймера. */
  private flashBanner(text: string): void {
    const b = this.add.text(this.scale.width / 2, this.scale.height * 0.22, text, { ...TEXT_STYLE, fontSize: '30px', color: '#ffd23f' });
    b.setOrigin(0.5).setScale(0.4);
    this.tweens.add({ targets: b, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, y: b.y - 30, delay: 1400, duration: 400, onComplete: () => b.destroy() });
  }

  /** Лента с избутванията (горе вдясно): „Боби 💥 Мими“. */
  private addFeed(byId: number | null, victimId: number): void {
    const world = this.gameScene.match.world;
    const meId = this.gameScene.match.humanId;
    const victim = world.getPlayer(victimId);
    if (!victim) return;
    const by = byId !== null ? world.getPlayer(byId) : undefined;
    const style = (id: number) => ({
      ...TEXT_STYLE,
      fontSize: '16px',
      strokeThickness: 4,
      color: id === meId ? '#ffd23f' : '#ffffff',
    });
    const parts: Phaser.GameObjects.GameObject[] = [];
    const icon = this.add.image(0, 0, ATLAS, by ? 'boom' : 'skull').setScale(0.2);
    const right = this.add.text(16, 0, victim.name, style(victim.id)).setOrigin(0, 0.5);
    parts.push(icon, right);
    if (by) parts.push(this.add.text(-16, 0, by.name, style(by.id)).setOrigin(1, 0.5));
    const c = this.add.container(0, 0, parts);
    this.feed.add(c);
    this.feedItems.unshift({ c, age: 0 });
    while (this.feedItems.length > 4) this.feedItems.pop()!.c.destroy();
  }

  private updateFeed(dtSec: number): void {
    this.feedItems.forEach((it, i) => {
      it.age += dtSec;
      it.c.setPosition(0, i * 24);
      it.c.setAlpha(it.age > 4 ? Math.max(0, 1 - (it.age - 4)) : 1);
    });
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      if (this.feedItems[i]!.age > 5) this.feedItems.splice(i, 1)[0]!.c.destroy();
    }
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

  /** Голям изскачащ надпис в центъра (3, 2, 1, БУМ!). */
  private flashBig(text: string): void {
    this.bigText.setText(text).setAlpha(1).setScale(1.6);
    this.tweens.killTweensOf(this.bigText);
    this.tweens.add({ targets: this.bigText, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.bigText, alpha: 0, delay: 550, duration: 300 });
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

  private makePanelBg(w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 10, w, h, 28);
    g.fillStyle(0x2a1650, 0.94);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 28);
    g.lineStyle(4, 0xffd23f, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 28);
    return g;
  }

  /** Панел след падане: кой те избута, кое място си, „Нова игра“ или „Гледай“. */
  private showEliminated(): void {
    this.closePanel();
    const match = this.gameScene.match;
    const world = match.world;
    const me = match.human;
    const by = me.lastHitBy >= 0 ? world.getPlayer(me.lastHitBy) : undefined;
    const pushed = by && (me.eliminatedTick - me.lastHitTick) * world.dt <= world.cfg.hit.creditWindow;
    const w = Math.min(460, this.scale.width - 32);
    const h = 300;

    const items: Phaser.GameObjects.GameObject[] = [this.makePanelBg(w, h)];
    items.push(this.add.text(0, -105, t('youFell'), { ...TEXT_STYLE, fontSize: '48px', color: '#ff8fa3' }).setOrigin(0.5));
    items.push(
      this.add
        .text(0, -50, pushed ? t('pushedBy', { name: by!.name }) : t('fellAlone'), { ...TEXT_STYLE, fontSize: '22px' })
        .setOrigin(0.5),
    );
    items.push(
      this.add
        .text(0, -12, t('yourPlace', { n: placeOf(world, me.id), total: world.players.length }), {
          ...TEXT_STYLE,
          fontSize: '22px',
          color: '#ffd23f',
        })
        .setOrigin(0.5),
    );
    const btnW = Math.min(190, (w - 60) / 2);
    // Онлайн рундът продължава без теб – вместо „Нова игра“ има „Меню“ (излиза от стаята).
    const again = match.online
      ? new Button(this, t('menu'), () => this.gameScene.goToMenu(), { width: btnW, color: 0x6b5a8e, fontSize: 24 })
      : new Button(this, t('playAgain'), () => this.gameScene.restartRound(), { width: btnW, fontSize: 24 });
    again.container.setPosition(-btnW / 2 - 10, 75);
    const watch = new Button(this, t('spectate'), () => this.closePanel(), { width: btnW, color: 0x4dabf7, fontSize: 24 });
    watch.container.setPosition(btnW / 2 + 10, 75);
    items.push(again.container, watch.container);

    this.openPanel(items, 'eliminated');
  }

  /** Финален панел: победител и класиране. */
  private showResults(): void {
    this.closePanel();
    const match = this.gameScene.match;
    const world = match.world;
    const meId = match.humanId;
    const winner = world.getPlayer(world.round.winnerId);
    const all = standings(world);
    const rowH = 34;
    // Колко реда се събират на екрана (телефон в хоризонтален режим е нисък).
    // Онлайн долу има още ред: „Следващ рунд след N…“ над бутона „Меню“.
    const extraH = match.online ? 36 : 0;
    const maxRows = Math.max(3, Math.min(8, Math.floor((this.scale.height - 32 - 230 - extraH) / rowH)));
    // Топ N; ако те няма в тях – последният ред е твоят (с истинското ти място).
    const rows = all.slice(0, maxRows).map((p, i) => ({ p, place: i + 1 }));
    const myPlace = all.findIndex((p) => p.id === meId) + 1;
    if (myPlace > maxRows) rows[rows.length - 1] = { p: all[myPlace - 1]!, place: myPlace };
    const w = Math.min(500, this.scale.width - 32);
    const h = Math.min(this.scale.height - 32, 230 + extraH + rows.length * rowH);

    const items: Phaser.GameObjects.GameObject[] = [this.makePanelBg(w, h)];
    let y = -h / 2 + 46;
    const iWon = winner?.id === meId;
    items.push(
      this.add
        .text(0, y, iWon ? t('victory') : t('winnerIs', { name: winner?.name ?? '—' }), {
          ...TEXT_STYLE,
          fontSize: iWon ? '52px' : '36px',
          color: '#ffd23f',
        })
        .setOrigin(0.5),
    );
    y += 44;
    const reason = world.round.endReason === 'timeUp' ? t('reasonTimeUp') : t('reasonLastStanding');
    items.push(this.add.text(0, y, reason, { ...TEXT_STYLE, fontSize: '18px', strokeThickness: 4 }).setOrigin(0.5));
    y += 40;

    rows.forEach(({ p, place }) => {
      const isMe = p.id === meId;
      const color = isMe ? '#ffd23f' : '#ffffff';
      const style = { ...TEXT_STYLE, fontSize: '22px', color, strokeThickness: 4 };
      items.push(this.add.text(-w / 2 + 30, y, `${place}.`, style).setOrigin(0, 0.5));
      items.push(this.add.text(-w / 2 + 70, y, p.name, style).setOrigin(0, 0.5));
      items.push(this.add.image(w / 2 - 150, y, ATLAS, 'boom').setScale(0.22));
      items.push(this.add.text(w / 2 - 132, y, String(p.knockouts), style).setOrigin(0, 0.5));
      items.push(this.add.image(w / 2 - 80, y, ATLAS, 'coin').setScale(0.22));
      items.push(this.add.text(w / 2 - 62, y, String(p.coins), style).setOrigin(0, 0.5));
      y += rowH;
    });

    const menu = new Button(this, t('menu'), () => this.gameScene.goToMenu(), { width: 150, color: 0x6b5a8e });
    if (match.online) {
      // Онлайн следващият рунд започва сам – брояч вместо „Пак!“.
      this.nextRoundText = this.add
        .text(0, h / 2 - 102, '', { ...TEXT_STYLE, fontSize: '20px', color: '#ffd23f', strokeThickness: 5 })
        .setOrigin(0.5);
      menu.container.setPosition(0, h / 2 - 50);
      items.push(this.nextRoundText, menu.container);
      this.updateNetUi();
    } else {
      const again = new Button(this, t('again'), () => this.gameScene.restartRound(), { width: 190 });
      again.container.setPosition(-w / 4 + 10, h / 2 - 50);
      menu.container.setPosition(w / 4 + 10, h / 2 - 50);
      items.push(again.container, menu.container);
    }

    const lang = new Button(
      this,
      t('langToggle'),
      () => {
        toggleLang();
        this.showResults();
      },
      { width: 64, height: 40, fontSize: 18, color: 0x6b5a8e },
    );
    lang.container.setPosition(w / 2 - 44, -h / 2 + 34);
    items.push(lang.container);

    this.openPanel(items, 'results');
  }

  private openPanel(items: Phaser.GameObjects.GameObject[], kind: 'eliminated' | 'results'): void {
    this.panel = this.add.container(this.scale.width / 2, this.scale.height / 2, items);
    this.panelKind = kind;
    this.panel.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
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
