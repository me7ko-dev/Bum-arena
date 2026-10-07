import Phaser from 'phaser';
import { abilityCooldownTotal, placeOf, standings, type GameEvent } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { t, toggleLang } from '../i18n';
import { FONT_FAMILY } from '../theme';
import { AbilityButton } from '../ui/AbilityButton';
import { Button } from '../ui/Button';
import { StatCounter } from '../ui/StatCounter';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import type { GameScene } from './GameScene';

export interface HudData {
  game: GameScene;
}

/** Брояч на FPS: в режим за разработка или с ?fps в адреса. */
function showFps(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('fps');
}

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
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
  /** Панелът „Падна!“ или „Класиране“ (само един наведнъж). */
  private panel: Phaser.GameObjects.Container | null = null;
  private panelKind: 'eliminated' | 'results' | null = null;
  /** Кога е показан панелът „Падна!“ (да не се показва пак след „Гледай“). */
  private eliminatedShown = false;

  constructor() {
    super('Hud');
  }

  init(data: HudData): void {
    this.gameScene = data.game;
    this.panel = null;
    this.panelKind = null;
    this.eliminatedShown = false;
  }

  create(): void {
    const me = this.gameScene.match.human;
    this.abilityBtn = new AbilityButton(this, 46, me.ability, 'SPACE');
    this.coinCounter = new StatCounter(this, 'coin', 0.9, '#ffd23f');
    this.koCounter = new StatCounter(this, 'star', 1.1);
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
    this.coinCounter.container.setPosition(pad + 10, pad + 10);
    this.koCounter.container.setPosition(pad + 10, pad + 62);
    this.timerText.setPosition(width / 2, pad - 12);
    this.aliveText.setPosition(width / 2, pad + 28);
    this.bannerText.setPosition(width / 2, pad + 78);
    this.bigText.setPosition(width / 2, height * 0.38);
    this.spectateText.setPosition(width / 2, height - pad);
    this.fpsText.setPosition(pad - 10, pad + 92);
    this.soundBtn.container.setPosition(width - pad - 24, pad + 18);
    this.panel?.setPosition(width / 2, height / 2);
  }

  /** Сензорно управление: джойстик навсякъде извън бутоните + бутон за суперсила. */
  private setupTouch(): void {
    this.isTouch = this.sys.game.device.input.touch;
    this.abilityBtn.setKeyHintVisible(!this.isTouch);
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

    // Суперсила
    const becameReady = this.abilityBtn.update(me.abilityCooldown, abilityCooldownTotal(world.cfg, me), dtSec);
    if (becameReady && me.alive && world.round.phase === 'playing') sfx.ready();
    this.abilityBtn.container.setVisible(me.alive && world.round.phase !== 'ended');

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
    } else if (!me.alive && r.phase === 'playing' && !this.eliminatedShown && me.fallTime > 0.9) {
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
        break;
    }
  }

  /** Голям изскачащ надпис в центъра (3, 2, 1, БУМ!). */
  private flashBig(text: string): void {
    this.bigText.setText(text).setAlpha(1).setScale(1.6);
    this.tweens.killTweensOf(this.bigText);
    this.tweens.add({ targets: this.bigText, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.bigText, alpha: 0, delay: 550, duration: 300 });
  }

  private onPrimaryKey(): void {
    if (this.panelKind === 'results' && this.panel) this.gameScene.restartRound();
  }

  // ───────────── Панели ─────────────

  private closePanel(resetKind = true): void {
    this.panel?.destroy();
    this.panel = null;
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
    const again = new Button(this, t('playAgain'), () => this.gameScene.restartRound(), { width: btnW, fontSize: 24 });
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
    const maxRows = Math.max(3, Math.min(8, Math.floor((this.scale.height - 32 - 230) / rowH)));
    // Топ N; ако те няма в тях – последният ред е твоят (с истинското ти място).
    const rows = all.slice(0, maxRows).map((p, i) => ({ p, place: i + 1 }));
    const myPlace = all.findIndex((p) => p.id === meId) + 1;
    if (myPlace > maxRows) rows[rows.length - 1] = { p: all[myPlace - 1]!, place: myPlace };
    const w = Math.min(500, this.scale.width - 32);
    const h = Math.min(this.scale.height - 32, 230 + rows.length * rowH);

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
      items.push(this.add.image(w / 2 - 150, y, 'star').setScale(0.8));
      items.push(this.add.text(w / 2 - 132, y, String(p.knockouts), style).setOrigin(0, 0.5));
      items.push(this.add.image(w / 2 - 80, y, 'coin').setScale(0.6));
      items.push(this.add.text(w / 2 - 62, y, String(p.coins), style).setOrigin(0, 0.5));
      y += rowH;
    });

    const again = new Button(this, t('again'), () => this.gameScene.restartRound(), { width: 200 });
    again.container.setPosition(0, h / 2 - 50);
    items.push(again.container);

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
