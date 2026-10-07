/**
 * „Сочност“ в 3D: събитията от симулацията → частици, ударни вълни, тресене,
 * hit-stop, звуци и изскачащи надписи (надписите се рисуват в плоския слой отгоре).
 */
import type { Balance, GameEvent, Player } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { FEEL } from '../config/feel';
import { t } from '../i18n';
import type { World3D } from './World3D';

export interface Effects3DHost {
  world3d: World3D;
  humanId: number;
  cfg(): Balance;
  player(id: number): Player | undefined;
  /** Точка, спрямо която се смята силата на звука (наблюдаваният играч). */
  listener(): { x: number; y: number };
  freeze(seconds: number): void;
  /** Изскачащ текст над точка от света. */
  popText(x: number, y: number, height: number, text: string, color: string, scale?: number): void;
  /** Изскачаща иконка (кадър от атласа) над точка от света. */
  popIcon(x: number, y: number, height: number, frame: string, scale?: number): void;
  /** Вижда ли се точката на екрана. */
  visible(x: number, y: number): boolean;
}

const SPARK = [0xffffff, 0xfff3b0, 0xffd23f, 0xff9f1c];
const CONFETTI = [0xff5d73, 0xffd23f, 0x4dabf7, 0x8ce99a, 0xb197fc, 0xff922b];

export class Effects3D {
  private coinStreak = 0;
  private lastCoinTime = 0;
  private now = 0;

  constructor(private host: Effects3DHost) {}

  update(dt: number): void {
    this.now += dt;
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
        case 'coinDrop': {
          const { vol, pan } = this.spatial(e.x, e.y);
          sfx.coinScatter(e.playerId === this.host.humanId ? 1 : vol, pan, e.count);
          if (e.playerId === this.host.humanId) this.host.popText(e.x, e.y, 90, `-${e.count}`, '#ff8787', 0.8);
          break;
        }
        case 'carEnter':
        case 'carExit': {
          const { vol, pan } = this.spatial(e.x, e.y);
          if (e.type === 'carEnter') sfx.carEnter(e.playerId === this.host.humanId ? 1 : vol, pan);
          this.dust(e.x, e.y, 14);
          break;
        }
        case 'carWreck':
          this.onWreck(e);
          break;
        case 'buy':
          if (e.playerId === this.host.humanId) {
            sfx.buy();
            const p = this.host.player(e.playerId);
            if (p) this.host.world3d.particles.burst(p.x, 40, p.y, { count: 22, colors: [0xffd23f, 0xffffff, 0xb197fc], speed: [150, 380], size: [3, 6], life: [0.4, 0.8], up: 0.8 });
          }
          break;
        case 'crown':
          if (e.playerId >= 0) {
            sfx.crown();
            const p = this.host.player(e.playerId);
            if (p) {
              this.host.popIcon(p.x, p.y, 120, 'crown', 0.9);
              this.host.world3d.particles.burst(p.x, 90, p.y, { count: 20, colors: [0xffd23f, 0xffe066, 0xffffff], speed: [120, 300], size: [3, 5], life: [0.5, 0.9], up: 0.9 });
            }
          }
          break;
        case 'bounty':
          if (e.playerId === this.host.humanId) {
            const p = this.host.player(e.playerId);
            if (p) this.host.popText(p.x, p.y, 140, `+${e.coins}`, '#ffd23f', 1.3);
          }
          break;
        case 'roundEnd': {
          const w = this.host.player(e.winnerId);
          if (w) {
            for (let i = 0; i < 3; i++) {
              this.host.world3d.particles.burst(w.x, 60, w.y, { count: 40, colors: CONFETTI, speed: [250, 650], size: [3, 7], life: [1.2, 2.2], up: 0.95, gravity: 500, drag: 1.2 });
            }
          }
          break;
        }
      }
    }
  }

  /** Сила на звука и стерео позиция според разстоянието до слушателя. */
  private spatial(x: number, y: number): { vol: number; pan: number } {
    const l = this.host.listener();
    const d = Math.hypot(x - l.x, y - l.y);
    return {
      vol: Math.max(0, Math.min(1, 1 - d / FEEL.soundRange)),
      pan: Math.max(-1, Math.min(1, (x - l.x) / (FEEL.soundRange * 0.6))),
    };
  }

  private dust(x: number, y: number, count: number): void {
    if (!this.host.visible(x, y)) return;
    this.host.world3d.puffs.burst(x, 8, y, { count, colors: [0xffffff, 0xf1f3f5], speed: [60, 200], size: [6, 13], life: [0.35, 0.7], up: 0.25, gravity: -60, drag: 3 });
  }

  private onHit(e: Extract<GameEvent, { type: 'hit' }>): void {
    const s = e.strength;
    const w3 = this.host.world3d;
    const meInvolved = e.attackerId === this.host.humanId || e.victimId === this.host.humanId;
    w3.character(e.victimId)?.hit(s);
    w3.character(e.attackerId)?.hit(s * 0.4);

    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.hit(s, meInvolved ? 1 : vol, pan);
    if (!this.host.visible(e.x, e.y)) return;

    w3.particles.burst(e.x, 40, e.y, {
      count: Math.round(5 + s * FEEL.sparksMax),
      colors: SPARK,
      speed: [200, 500 + s * 400],
      size: [2.5, 5 + s * 3],
      life: [0.25, 0.55],
      up: 0.55,
    });
    if (s > 0.35) w3.shockwaves.spawn(e.x, e.y, 60 + s * 140, 0xffffff);

    if (s >= FEEL.shakeMinStrength) {
      // FEEL.shake* са в „дял от екрана“ – тук ги превръщаме в единици на света.
      const k = meInvolved ? 1 : 0.45;
      w3.shake((FEEL.shakeBase + FEEL.shakeStrong * s) * k * 1400);
    }
    if (s >= FEEL.hitStopMinStrength) this.host.freeze((FEEL.hitStopMs * (meInvolved ? 1 : 0.6)) / 1000);
    if (meInvolved && s > 0.4) w3.punchZoom(FEEL.zoomPunch * s * 1.4);
    if (s > 0.6) this.host.popIcon(e.x, e.y, 70, 'boom', 0.45 + s * 0.5);
    if (s > 0.75) this.host.popText(e.x, e.y, 110, t('boom'), '#ffd23f', 1 + s * 0.3);
  }

  private onFall(e: Extract<GameEvent, { type: 'fall' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.fall(e.playerId === this.host.humanId ? 1 : vol, pan);
    if (e.byId === this.host.humanId) {
      sfx.knockout();
      this.host.popText(e.x, e.y, 120, '+1', '#8ce99a', 1.4);
    }
    if (this.host.visible(e.x, e.y)) {
      this.host.world3d.shockwaves.spawn(e.x, e.y, 160, 0xffffff, 0.45, 0);
      this.host.world3d.puffs.burst(e.x, 0, e.y, { count: 16, colors: [0xffffff], speed: [80, 220], size: [8, 15], life: [0.4, 0.8], up: 0.4, gravity: -40, drag: 2.5 });
    }
  }

  private onCoinPickup(e: Extract<GameEvent, { type: 'coinPickup' }>): void {
    const mine = e.playerId === this.host.humanId;
    if (mine) {
      this.coinStreak = this.now - this.lastCoinTime < 0.6 ? Math.min(this.coinStreak + 1, 8) : 0;
      this.lastCoinTime = this.now;
      sfx.coin(1, 0, 1 + this.coinStreak * 0.06);
      this.host.popText(e.x, e.y, 70, `+${e.value}`, '#ffd23f', 0.6);
    } else {
      const { vol, pan } = this.spatial(e.x, e.y);
      sfx.coin(vol * 0.35, pan);
    }
    if (this.host.visible(e.x, e.y)) {
      this.host.world3d.particles.burst(e.x, 24, e.y, { count: mine ? 10 : 5, colors: [0xffd23f, 0xfff3b0, 0xffffff], speed: [80, 220], size: [2, 3.5], life: [0.25, 0.45], up: 0.8, gravity: 300 });
    }
  }

  private onAbility(e: Extract<GameEvent, { type: 'ability' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    const mine = e.playerId === this.host.humanId;
    const v = mine ? 1 : vol;
    const w3 = this.host.world3d;
    const cfg = this.host.cfg();
    const visible = this.host.visible(e.x, e.y);
    switch (e.ability) {
      case 'dash':
        sfx.dash(v, pan);
        if (visible) this.dust(e.x - e.dirX * 25, e.y - e.dirY * 25, 10);
        break;
      case 'freeze':
        sfx.freeze(v, pan);
        if (!visible) break;
        w3.shockwaves.spawn(e.x, e.y, cfg.abilities.freeze.radius, 0x74c0fc, 0.45);
        w3.particles.burst(e.x, 30, e.y, { count: 40, colors: [0xffffff, 0xa5d8ff, 0x74c0fc], speed: [200, 520], size: [3, 6], life: [0.4, 0.8], up: 0.35, gravity: 200 });
        for (const id of e.targets ?? []) {
          const p = this.host.player(id);
          if (p) this.host.popIcon(p.x, p.y, 110, 'snowflake', 0.5);
        }
        break;
      case 'shield':
        sfx.shield(v, pan);
        if (!visible) break;
        w3.shockwaves.spawn(e.x, e.y, cfg.abilities.shield.radius, 0xa5d8ff, 0.4);
        w3.shockwaves.spawn(e.x, e.y, cfg.abilities.shield.radius * 0.7, 0xffffff, 0.3);
        break;
      case 'magnet':
        sfx.magnet(v, pan);
        if (visible) this.host.popIcon(e.x, e.y, 130, 'magnet', 0.6);
        break;
      case 'giant':
        sfx.giant(v, pan);
        if (!visible) break;
        this.dust(e.x, e.y, 22);
        w3.shockwaves.spawn(e.x, e.y, 200, 0xffd23f, 0.4);
        w3.shake(mine ? 14 : 5);
        break;
    }
  }

  private onWreck(e: Extract<GameEvent, { type: 'carWreck' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.explosion(e.playerId === this.host.humanId ? 1 : vol, pan);
    if (!this.host.visible(e.x, e.y)) return;
    const w3 = this.host.world3d;
    w3.particles.burst(e.x, 30, e.y, { count: 50, colors: [0xff922b, 0xffd23f, 0xff4d4d, 0x343a40], speed: [250, 700], size: [4, 9], life: [0.5, 1.1], up: 0.7 });
    w3.puffs.burst(e.x, 20, e.y, { count: 18, colors: [0x868e96, 0xadb5bd, 0x495057], speed: [60, 200], size: [14, 26], life: [0.7, 1.3], up: 0.7, gravity: -120, drag: 2 });
    w3.shockwaves.spawn(e.x, e.y, 300, 0xffa94d, 0.5);
    w3.shake(26);
    this.host.popIcon(e.x, e.y, 80, 'boom', 1.3);
    this.host.freeze(0.08);
  }
}
