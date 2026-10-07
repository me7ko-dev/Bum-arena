import Phaser from 'phaser';
import type { GameEvent } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { FEEL } from '../config/feel';
import { t } from '../i18n';
import { FONT_FAMILY } from '../theme';
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
}

/**
 * Превръща събитията от симулацията в „сочност“: частици, тресене, звук, hit-stop, надписи.
 * Цялата логика за ефектите е тук, за да е лесно да се настройва и сменя.
 */
export class Effects {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;

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
      .setDepth(20000);
    this.dust = scene.add
      .particles(0, 0, 'dot', {
        lifespan: { min: 300, max: 650 },
        speed: { min: 40, max: 200 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xffffff, 0xd9f7ef],
        emitting: false,
      })
      .setDepth(-5);
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
    if (s > 0.75) this.popText(e.x, e.y - 40, t('boom'), '#ffd23f', 1 + s * 0.3);
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

  /** Разширяващ се пръстен. */
  private shockwave(x: number, y: number, size: number): void {
    const ring = this.host.scene.add.image(x, y, 'ring').setDepth(19999).setScale(0.2).setAlpha(0.9);
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
        fontStyle: 'bold',
        color,
        stroke: '#2a1650',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(20001)
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
