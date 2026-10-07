import Phaser from 'phaser';
import type { Balance, GameEvent } from '@bum/shared';
import { ATLAS } from '../assets';
import { sfx } from '../audio/Sfx';
import { FEEL } from '../config/feel';
import { t } from '../i18n';
import { FONT_FAMILY } from '../theme';
import { LAYERS } from './layers';
import type { PlayerView } from './PlayerView';

/** Какво трябва на ефектите от сцената. */
export interface EffectsHost {
  scene: Phaser.Scene;
  views: Map<number, PlayerView>;
  humanId: number;
  /** Точка, спрямо която се смята силата на звука (твоето човече или камерата). */
  listener(): { x: number; y: number };
  /** Hit-stop на играта. */
  freeze(seconds: number): void;
  /** Кратко „удряне“ на камерата. */
  punchZoom(amount: number): void;
  /** Текущият баланс (за радиусите на ефектите). */
  cfg(): Balance;
}

/**
 * Превръща събитията от симулацията в „сочност“: частици, тресене, звук, hit-stop, надписи.
 * Цялата логика за ефектите е тук, за да е лесно да се настройва и сменя.
 */
export class Effects {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private glints: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Серия бързо взети монети → по-висок звук (приятно „натрупване“). */
  private coinStreak = 0;
  private lastCoinTime = 0;

  constructor(private host: EffectsHost) {
    const scene = host.scene;
    this.sparks = scene.add
      .particles(0, 0, 'dot', {
        lifespan: { min: 180, max: 420 },
        speed: { min: 180, max: 560 },
        scale: { start: 0.42, end: 0 },
        alpha: { start: 1, end: 0.3 },
        tint: [0xffffff, 0xfff3b0, 0xffd23f],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(LAYERS.effects);
    this.dust = scene.add
      .particles(0, 0, 'dot', {
        lifespan: { min: 300, max: 650 },
        speed: { min: 40, max: 200 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xffffff, 0xd9f7ef],
        emitting: false,
      })
      .setDepth(LAYERS.dust);
    this.glints = scene.add
      .particles(0, 0, 'dot', {
        lifespan: { min: 200, max: 380 },
        speed: { min: 60, max: 180 },
        scale: { start: 0.3, end: 0 },
        tint: [0xffd23f, 0xfff3b0, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(LAYERS.effects);
  }

  handle(events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.onHit(e);
          break;
        case 'fall':
          this.onFall(e);
          break;
        case 'ability':
          this.onAbility(e);
          break;
        case 'coinPickup':
          this.onCoinPickup(e);
          break;
        case 'coinDrop':
          this.onCoinDrop(e);
          break;
        case 'carEnter':
        case 'carExit': {
          const { vol, pan } = this.spatial(e.x, e.y);
          if (e.type === 'carEnter') sfx.carEnter(e.playerId === this.host.humanId ? 1 : vol, pan);
          if (this.onScreen(e.x, e.y)) this.dust.explode(14, e.x, e.y);
          break;
        }
        case 'carWreck': {
          const { vol, pan } = this.spatial(e.x, e.y);
          sfx.explosion(e.playerId === this.host.humanId ? 1 : vol, pan);
          if (this.onScreen(e.x, e.y)) {
            this.burst(e.x, e.y, 'boom', 1.3);
            this.burst(e.x + 30, e.y - 20, 'fire', 0.8);
            this.sparks.explode(30, e.x, e.y);
            this.shockwave(e.x, e.y, 2.2);
            this.host.scene.cameras.main.shake(260, 0.012, true);
            this.host.freeze(0.08);
          }
          break;
        }
        case 'buy':
          if (e.playerId === this.host.humanId) {
            sfx.buy();
            const p = this.host.views.get(e.playerId)?.container;
            if (p) this.glints.explode(16, p.x, p.y);
          }
          break;
        case 'crown':
          if (e.playerId >= 0) {
            sfx.crown();
            const v = this.host.views.get(e.playerId)?.container;
            if (v) this.burst(v.x, v.y - 60, 'crown', 0.9);
          }
          break;
        case 'bounty':
          if (e.playerId === this.host.humanId) {
            const v = this.host.views.get(e.playerId)?.container;
            if (v) this.popText(v.x, v.y - 90, `+${e.coins}`, '#ffd23f', 1.3);
          }
          break;
      }
    }
  }

  /** Сила на звука и стерео позиция според разстоянието до слушателя. */
  private spatial(x: number, y: number): { vol: number; pan: number } {
    const l = this.host.listener();
    const d = Math.hypot(x - l.x, y - l.y);
    return {
      vol: Phaser.Math.Clamp(1 - d / FEEL.soundRange, 0, 1),
      pan: Phaser.Math.Clamp((x - l.x) / (FEEL.soundRange * 0.6), -1, 1),
    };
  }

  private onScreen(x: number, y: number, margin = 100): boolean {
    const v = this.host.scene.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  private onHit(e: Extract<GameEvent, { type: 'hit' }>): void {
    const s = e.strength;
    const meInvolved = e.attackerId === this.host.humanId || e.victimId === this.host.humanId;
    const visible = this.onScreen(e.x, e.y);

    this.host.views.get(e.victimId)?.hitReact(s);
    this.host.views.get(e.attackerId)?.hitReact(s * 0.4);

    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.hit(s, meInvolved ? 1 : vol, pan);

    if (!visible) return;

    this.sparks.explode(Math.round(4 + s * FEEL.sparksMax), e.x, e.y);
    if (s > 0.35) this.shockwave(e.x, e.y, 0.4 + s * 0.8);

    // Тресенето е по-силно, ако ударът е с теб.
    if (s >= FEEL.shakeMinStrength) {
      const k = meInvolved ? 1 : 0.45;
      const intensity = (FEEL.shakeBase + FEEL.shakeStrong * s) * k;
      this.host.scene.cameras.main.shake(FEEL.shakeDuration * (0.6 + s * 0.6), intensity, true);
    }
    if (s >= FEEL.hitStopMinStrength) {
      this.host.freeze((FEEL.hitStopMs * (meInvolved ? 1 : 0.6)) / 1000);
    }
    if (meInvolved && s > 0.4) this.host.punchZoom(FEEL.zoomPunch * s);
    if (s > 0.6) this.burst(e.x, e.y, 'boom', 0.4 + s * 0.5);
    if (s > 0.75) this.popText(e.x, e.y - 40, t('boom'), '#ffd23f', 1 + s * 0.3);
  }

  private onAbility(e: Extract<GameEvent, { type: 'ability' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    const mine = e.playerId === this.host.humanId;
    const v = mine ? 1 : vol;
    const visible = this.onScreen(e.x, e.y, 400);
    switch (e.ability) {
      case 'dash':
        sfx.dash(v, pan);
        if (visible) this.dust.explode(8, e.x - e.dirX * 20, e.y - e.dirY * 20);
        break;
      case 'freeze':
        sfx.freeze(v, pan);
        if (visible) {
          this.ringBlast(e.x, e.y, 0x74c0fc, (this.cfgRadius('freeze') * 2) / 128);
          for (const id of e.targets ?? []) {
            const t = this.host.views.get(id)?.container;
            if (t) this.burst(t.x, t.y - 20, 'snowflake', 0.5);
          }
        }
        break;
      case 'shield':
        sfx.shield(v, pan);
        if (visible) {
          this.ringBlast(e.x, e.y, 0xa5d8ff, (this.cfgRadius('shield') * 2) / 128);
          this.burst(e.x, e.y - 40, 'shield', 0.7);
        }
        break;
      case 'magnet':
        sfx.magnet(v, pan);
        if (visible) this.burst(e.x, e.y - 60, 'magnet', 0.6);
        break;
      case 'giant':
        sfx.giant(v, pan);
        if (visible) {
          this.burst(e.x, e.y - 50, 'mushroom', 0.8);
          this.dust.explode(20, e.x, e.y);
          this.host.scene.cameras.main.shake(200, mine ? 0.008 : 0.003, true);
        }
        break;
    }
  }

  private onCoinPickup(e: Extract<GameEvent, { type: 'coinPickup' }>): void {
    const mine = e.playerId === this.host.humanId;
    if (mine) {
      const now = this.host.scene.time.now;
      this.coinStreak = now - this.lastCoinTime < 600 ? Math.min(this.coinStreak + 1, 8) : 0;
      this.lastCoinTime = now;
      sfx.coin(1, 0, 1 + this.coinStreak * 0.06);
      this.popText(e.x, e.y - 20, `+${e.value}`, '#ffd23f', 0.6);
    } else {
      const { vol, pan } = this.spatial(e.x, e.y);
      sfx.coin(vol * 0.35, pan);
    }
    if (this.onScreen(e.x, e.y)) this.glints.explode(mine ? 8 : 4, e.x, e.y);
  }

  private onCoinDrop(e: Extract<GameEvent, { type: 'coinDrop' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.coinScatter(e.playerId === this.host.humanId ? 1 : vol, pan, e.count);
    if (e.playerId === this.host.humanId) this.popText(e.x, e.y - 50, `-${e.count}`, '#ff8787', 0.8);
  }

  private onFall(e: Extract<GameEvent, { type: 'fall' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.fall(e.playerId === this.host.humanId ? 1 : vol, pan);
    if (e.byId === this.host.humanId) {
      sfx.knockout();
      this.popText(e.x, e.y - 60, '+1', '#8ce99a', 1.4);
    }
    if (this.onScreen(e.x, e.y)) {
      this.dust.explode(18, e.x, e.y);
      this.shockwave(e.x, e.y, 1.2);
    }
  }

  /** Радиус на суперсила от конфига (за визуализацията). */
  private cfgRadius(id: 'freeze' | 'shield'): number {
    return this.host.cfg().abilities[id].radius;
  }

  /** Изскачащ спрайт от атласа (💥, ❄️, 👑 …), който се уголемява и изчезва. */
  burst(x: number, y: number, frame: string, scale: number): void {
    const img = this.host.scene.add.image(x, y, ATLAS, frame).setDepth(LAYERS.popText).setScale(scale * 0.3);
    img.setRotation((Math.random() - 0.5) * 0.6);
    this.host.scene.tweens.add({
      targets: img,
      scale: scale,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.host.scene.tweens.add({
          targets: img,
          alpha: 0,
          y: y - 30,
          duration: 300,
          delay: 120,
          onComplete: () => img.destroy(),
        }),
    });
  }

  /** Цветна ударна вълна до даден мащаб. */
  private ringBlast(x: number, y: number, color: number, scale: number): void {
    const ring = this.host.scene.add.image(x, y, 'ring').setDepth(LAYERS.effects).setScale(0.2).setTint(color);
    this.host.scene.tweens.add({
      targets: ring,
      scale,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Разширяващ се пръстен. */
  private shockwave(x: number, y: number, size: number): void {
    const ring = this.host.scene.add.image(x, y, 'ring').setDepth(LAYERS.effects).setScale(0.2).setAlpha(0.9);
    this.host.scene.tweens.add({
      targets: ring,
      scale: size,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Изскачащ надпис („БУМ!“, „+1“). */
  popText(x: number, y: number, text: string, color: string, scale = 1): void {
    const t = this.host.scene.add
      .text(x, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: '900',
        color,
        stroke: '#2a1650',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(LAYERS.popText)
      .setScale(0.3 * scale);
    this.host.scene.tweens.add({
      targets: t,
      scale: scale,
      y: y - 50,
      duration: 260,
      ease: 'Back.easeOut',
      onComplete: () =>
        this.host.scene.tweens.add({
          targets: t,
          alpha: 0,
          y: y - 80,
          duration: 350,
          delay: 200,
          onComplete: () => t.destroy(),
        }),
    });
  }
}
