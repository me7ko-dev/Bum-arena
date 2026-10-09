/**
 * „Сочност“ в 3D: събитията от симулацията → частици, пръстени, комикс-звезди, куполи,
 * тресене, hit-stop, забавен каданс, звуци и изскачащи надписи
 * (надписите се рисуват в плоския слой отгоре).
 *
 * Това е ЕДИНСТВЕНОТО място, където събитие се превръща в ефект. Принципи:
 *  - нокаутът е най-големият момент (следа, плясък, „НОКАУТ!“, забавяне, камера);
 *  - ефектът расте със силата на удара (звезда, искри, тресене, бял ръб);
 *  - показваме риска (обхват на суперсилите, посока на удара).
 */
import type { Balance, GameEvent, Player } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { FEEL } from '../config/feel';
import { t } from '../i18n';
import type { SplashInfo } from './KnockoutFx';
import type { World3D } from './World3D';

export interface Effects3DHost {
  world3d: World3D;
  humanId: number;
  cfg(): Balance;
  player(id: number): Player | undefined;
  /** Точка, спрямо която се смята силата на звука (наблюдаваният играч). */
  listener(): { x: number; y: number };
  freeze(seconds: number): void;
  /** Забавен каданс (Match.slowmo). Онлайн не прави нищо. */
  slowmo?(scale: number, seconds: number): void;
  /** Изскачащ текст над точка от света. */
  popText(x: number, y: number, height: number, text: string, color: string, scale?: number): void;
  /** Изскачаща иконка (кадър от атласа) над точка от света. */
  popIcon(x: number, y: number, height: number, frame: string, scale?: number): void;
  /** Вижда ли се точката на екрана. */
  visible(x: number, y: number): boolean;
}

const SPARK = [0xffffff, 0xfff3b0, 0xffd23f, 0xff9f1c];
const CONFETTI = [0xff5d73, 0xffd23f, 0x4dabf7, 0x8ce99a, 0xb197fc, 0xff922b];
const WATER = [0xffffff, 0xe3f8ff, 0x9fe3fa, 0x5cc8f0];
const ICE = [0xffffff, 0xd0f0ff, 0xa5d8ff, 0x74c0fc];
/** Думи за силен удар (ключове за превод). */
const HIT_WORDS = ['boom', 'fx.bam', 'fx.pow'];

export class Effects3D {
  private coinStreak = 0;
  private lastCoinTime = 0;
  private now = 0;
  /** Паднали, чийто плясък е „важен“ (човекът е участвал) – с надпис. */
  private importantSplash = new Set<number>();

  constructor(private host: Effects3DHost) {
    host.world3d.knockouts.onSplash = (s) => this.onSplash(s);
  }

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
            if (p) {
              this.host.world3d.particles.burst(p.x, 40, p.y, { count: 22, colors: [0xffd23f, 0xffffff, 0xb197fc], speed: [150, 380], size: [3, 6], life: [0.4, 0.8], up: 0.8 });
              this.host.world3d.fx.ring(p.x, 45, p.y, 90, 0xb197fc, 0.35, { billboard: true });
            }
          }
          break;
        case 'crown':
          if (e.playerId >= 0) {
            sfx.crown();
            const p = this.host.player(e.playerId);
            if (p) {
              this.host.popIcon(p.x, p.y, 120, 'crown', 0.9);
              this.host.world3d.particles.burst(p.x, 90, p.y, { count: 20, colors: [0xffd23f, 0xffe066, 0xffffff], speed: [120, 300], size: [3, 5], life: [0.5, 0.9], up: 0.9 });
              this.host.world3d.fx.ring(p.x, 95, p.y, 80, 0xffd23f, 0.4, { billboard: true });
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
            this.host.world3d.fx.ring(w.x, 3, w.y, 260, 0xffd23f, 0.7);
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

  // ───────────── Удар ─────────────

  private onHit(e: Extract<GameEvent, { type: 'hit' }>): void {
    const s = e.strength;
    const w3 = this.host.world3d;
    const meInvolved = e.attackerId === this.host.humanId || e.victimId === this.host.humanId;
    w3.character(e.victimId)?.hit(s);
    w3.character(e.attackerId)?.hit(s * 0.4);

    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.hit(s, meInvolved ? 1 : vol, pan);
    if (!this.host.visible(e.x, e.y)) return;

    // Посока на удара: от нападателя към жертвата.
    const a = this.host.player(e.attackerId);
    const v = this.host.player(e.victimId);
    let dx = v && a ? v.x - a.x : 0;
    let dz = v && a ? v.y - a.y : 0;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.01) {
      dx /= dl;
      dz /= dl;
    } else {
      dx = 1;
      dz = 0;
    }

    // Комикс-звезда в точката на удара – расте и „загрява“ със силата.
    const color = s > 0.7 ? 0xff7b1c : s > 0.4 ? 0xffc21a : 0xffe680;
    w3.fx.flash(e.x, 42, e.y, 22 + s * FEEL.burstSize, color, 0.14 + s * 0.12);

    // Насочени искри (черти) по посоката на бутането + малко във всички посоки.
    w3.particles.burst(e.x, 40, e.y, {
      count: Math.round(4 + s * FEEL.sparksMax),
      colors: SPARK,
      speed: [260, 560 + s * 520],
      size: [2, 3.2 + s * 2],
      life: [0.16, 0.36 + s * 0.12],
      up: 0.22,
      gravity: 700,
      dirX: dx,
      dirZ: dz,
      spread: 0.55,
      stretch: 0.012,
    });
    w3.particles.burst(e.x, 40, e.y, { count: Math.round(3 + s * 6), colors: SPARK, speed: [150, 320], size: [2.5, 4.5], life: [0.2, 0.4], up: 0.5 });
    if (s > 0.35) w3.fx.ring(e.x, 3, e.y, 60 + s * 140, 0xffffff, 0.35);
    // Силен удар: радиален пръстен във въздуха (обърнат към камерата).
    if (s > 0.7) {
      w3.fx.ring(e.x, 42, e.y, 90 + s * 110, 0xffffff, 0.24, { billboard: true });
      w3.fx.ring(e.x, 42, e.y, 60 + s * 80, 0xffd23f, 0.22, { billboard: true, delay: 0.04 });
    }

    if (s >= FEEL.shakeMinStrength) {
      // FEEL.shake* са в „дял от екрана“ – тук ги превръщаме в единици на света.
      const k = meInvolved ? 1 : 0.45;
      w3.shake((FEEL.shakeBase + FEEL.shakeStrong * s) * k * 1400);
    }
    if (s >= FEEL.hitStopMinStrength) this.host.freeze((FEEL.hitStopMs * (meInvolved ? 1 : 0.6)) / 1000);
    if (meInvolved && s > 0.4) w3.punchZoom(FEEL.zoomPunch * s * 1.4);
    if (s > 0.6) this.host.popIcon(e.x, e.y, 70, 'boom', 0.45 + s * 0.5);
    if (s > 0.75) {
      const word = t(HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)]!);
      this.host.popText(e.x, e.y, 110, word, '#ffd23f', 1 + s * 0.3);
    }
  }

  // ───────────── Нокаут ─────────────

  private onFall(e: Extract<GameEvent, { type: 'fall' }>): void {
    const w3 = this.host.world3d;
    const human = this.host.humanId;
    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.fall(e.playerId === human ? 1 : vol, pan);

    // Цветна следа при падането + плясък (виж onSplash).
    const involved = e.byId === human || e.playerId === human;
    const view = w3.character(e.playerId);
    w3.knockouts.start(e.playerId, view?.bodyColor ?? 0xffffff, involved);

    if (involved) {
      this.importantSplash.add(e.playerId);
      // Драматичен момент: забавяне + камерата „поглежда“ към падащия.
      this.host.slowmo?.(FEEL.koSlowmoScale, FEEL.koSlowmoSeconds);
      w3.kickToward(e.x, e.y, 0.4, FEEL.koPunch);
      w3.shake(e.byId === human ? 16 : 22);
    }
    // Надписите са над човека, ако той е избутал (наградата му; ръбът може да е извън екрана),
    // иначе над падащия (тогава камерата следи него).
    const me = this.host.player(human);
    // Падналият е човекът: по-близо до центъра на екрана (ръбът може да е встрани – текстът се реже).
    const look = w3.lookTarget;
    const ax = e.byId === human && me ? me.x : e.x + (look.x - e.x) * 0.6;
    const ay = e.byId === human && me ? me.y : e.y + (look.z - e.y) * 0.6;
    if (e.byId === human) {
      sfx.knockout();
      this.host.popText(ax, ay, 100, '+1', '#8ce99a', 1.3);
    }
    if (involved) this.host.popText(ax, ay, 150, t('fx.ko'), e.byId === human ? '#ffd23f' : '#ff5d73', 1.75);

    if (this.host.visible(e.x, e.y)) {
      w3.fx.ring(e.x, 0, e.y, 170, 0xffffff, 0.45);
      w3.fx.flash(e.x, 30, e.y, involved ? 120 : 70, involved ? 0xff5d73 : 0xffd23f, 0.32);
      w3.puffs.burst(e.x, 0, e.y, { count: 16, colors: [0xffffff], speed: [80, 220], size: [8, 15], life: [0.4, 0.8], up: 0.4, gravity: -40, drag: 2.5 });
    }
  }

  /** Падащият „цопна“ (KnockoutFx) – голям плясък: капки, пяна, пръстени. */
  private onSplash(s: SplashInfo): void {
    const important = this.importantSplash.delete(s.playerId);
    if (!s.visible) return;
    const w3 = this.host.world3d;
    const k = s.scale;
    w3.particles.burst(s.x, s.y, s.z, {
      count: Math.round(important ? 46 : 32),
      colors: WATER,
      speed: [280 * k, 640 * k],
      size: [5 * k, 10 * k],
      life: [0.7, 1.15],
      up: 0.97,
      gravity: 1500 * k,
      drag: 0.4,
      floor: s.y - 4,
      kill: true,
      jitter: 22 * k,
    });
    w3.puffs.burst(s.x, s.y, s.z, {
      count: 12,
      colors: [0xffffff, 0xeefbff],
      speed: [140 * k, 340 * k],
      size: [13 * k, 24 * k],
      life: [0.45, 0.8],
      up: 0.96,
      gravity: 380 * k,
      drag: 2,
      floor: s.y - 40,
      kill: true,
      jitter: 16 * k,
    });
    w3.fx.ring(s.x, s.y + 2, s.z, 230 * k, 0xffffff, 0.8);
    w3.fx.ring(s.x, s.y + 2, s.z, 150 * k, 0xbdf0ff, 0.65, { delay: 0.12 });
    w3.fx.flash(s.x, s.y + 25 * k, s.z, 70 * k, 0x7fd8f8, 0.3);
    if (important) this.host.popText(s.x, s.z, s.y + 90 * k, t('fx.splash'), '#a5e8ff', 1.25);
  }

  // ───────────── Монети ─────────────

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
      const w3 = this.host.world3d;
      w3.particles.burst(e.x, 24, e.y, { count: mine ? 10 : 5, colors: [0xffd23f, 0xfff3b0, 0xffffff], speed: [80, 220], size: [2, 3.5], life: [0.25, 0.45], up: 0.8, gravity: 300 });
      // „Дзин“: златен пръстен + малка звездичка.
      w3.fx.ring(e.x, 26, e.y, mine ? 46 : 32, 0xffd23f, 0.28, { billboard: true });
      if (mine) w3.fx.flash(e.x, 26, e.y, 22, 0xfff3b0, 0.16);
    }
  }

  // ───────────── Суперсили ─────────────

  private onAbility(e: Extract<GameEvent, { type: 'ability' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    const mine = e.playerId === this.host.humanId;
    const v = mine ? 1 : vol;
    const w3 = this.host.world3d;
    const cfg = this.host.cfg();
    const visible = this.host.visible(e.x, e.y);
    switch (e.ability) {
      case 'dash': {
        sfx.dash(v, pan);
        if (!visible) break;
        this.dust(e.x - e.dirX * 25, e.y - e.dirY * 25, 10);
        // „Ууш“: дълга бяла черта по пътя на скока + пръстен на старта.
        const len = cfg.abilities.dash.speed * cfg.abilities.dash.duration;
        w3.fx.streak(e.x + e.dirX * len, 34, e.y + e.dirY * len, e.dirX, e.dirY, len + 60, 30, 0xbfeeff, 0.24);
        w3.fx.ring(e.x - e.dirX * 10, 34, e.y - e.dirY * 10, 60, 0xffffff, 0.22, { billboard: true });
        break;
      }
      case 'freeze': {
        sfx.freeze(v, pan);
        if (!visible) break;
        const r = cfg.abilities.freeze.radius;
        // Леден купол с размера на обхвата + пръстени + ледени парченца.
        w3.fx.dome(e.x, e.y, r, 0x9fe8ff, 0.8);
        w3.fx.ring(e.x, 3, e.y, r, 0x74c0fc, 0.45);
        w3.fx.ring(e.x, 3, e.y, r * 0.75, 0xffffff, 0.4, { delay: 0.06 });
        w3.particles.burst(e.x, 30, e.y, { count: 40, colors: ICE, speed: [200, 520], size: [3, 6], life: [0.4, 0.8], up: 0.35, gravity: 200 });
        w3.particles.burst(e.x, 20, e.y, { count: 18, colors: ICE, speed: [300, 600], size: [2.5, 4], life: [0.3, 0.5], up: 0.15, gravity: 300, stretch: 0.01 });
        for (const id of e.targets ?? []) {
          const p = this.host.player(id);
          if (!p) continue;
          this.host.popIcon(p.x, p.y, 110, 'snowflake', 0.5);
          w3.fx.flash(p.x, 45, p.y, 50, 0xa5e8ff, 0.25);
        }
        break;
      }
      case 'shield': {
        sfx.shield(v, pan);
        if (!visible) break;
        const r = cfg.abilities.shield.radius;
        // Сапунен мехур, който се разширява до обхвата на отблъскването.
        w3.fx.bubble(e.x, 40, e.y, 55, r, 0x8fd8ff, 0.5);
        w3.fx.ring(e.x, 3, e.y, r, 0xa5d8ff, 0.4);
        w3.fx.ring(e.x, 3, e.y, r * 0.7, 0xffffff, 0.3, { delay: 0.05 });
        break;
      }
      case 'magnet': {
        sfx.magnet(v, pan);
        if (!visible) break;
        this.host.popIcon(e.x, e.y, 130, 'magnet', 0.6);
        // Обхватът на магнита – пръстен, който „се свива“ навътре (дърпане).
        const r = cfg.abilities.magnet.radius;
        w3.fx.ring(e.x, 3, e.y, r, 0xff4d6d, 0.5, { alpha: 0.7 });
        w3.fx.ring(e.x, 3, e.y, r * 0.6, 0xffd6de, 0.4, { delay: 0.1, alpha: 0.6 });
        break;
      }
      case 'giant': {
        sfx.giant(v, pan);
        if (!visible) break;
        // Удар в земята: прах в кръг, двоен пръстен, малко камъчета, тресене.
        w3.puffs.burst(e.x, 6, e.y, { count: 26, colors: [0xffffff, 0xf1f3f5, 0xe9e1d3], speed: [320, 560], size: [10, 18], life: [0.45, 0.8], up: 0.08, gravity: -30, drag: 4, jitter: 30 });
        w3.particles.burst(e.x, 10, e.y, { count: 14, colors: [0xc9a27a, 0xa17c5b, 0xffffff], speed: [200, 420], size: [3, 5.5], life: [0.4, 0.7], up: 0.7, gravity: 1200 });
        w3.fx.ring(e.x, 3, e.y, 260, 0xffd23f, 0.45);
        w3.fx.ring(e.x, 3, e.y, 170, 0xffffff, 0.4, { delay: 0.07 });
        w3.fx.flash(e.x, 20, e.y, 90, 0xffd23f, 0.22);
        w3.shake(mine ? 18 : 6);
        if (mine) w3.punchZoom(0.05);
        break;
      }
    }
  }

  private onWreck(e: Extract<GameEvent, { type: 'carWreck' }>): void {
    const { vol, pan } = this.spatial(e.x, e.y);
    sfx.explosion(e.playerId === this.host.humanId ? 1 : vol, pan);
    if (!this.host.visible(e.x, e.y)) return;
    const w3 = this.host.world3d;
    w3.particles.burst(e.x, 30, e.y, { count: 50, colors: [0xff922b, 0xffd23f, 0xff4d4d, 0x343a40], speed: [250, 700], size: [4, 9], life: [0.5, 1.1], up: 0.7 });
    w3.puffs.burst(e.x, 20, e.y, { count: 18, colors: [0x868e96, 0xadb5bd, 0x495057], speed: [60, 200], size: [14, 26], life: [0.7, 1.3], up: 0.7, gravity: -120, drag: 2 });
    w3.fx.ring(e.x, 3, e.y, 300, 0xffa94d, 0.5);
    w3.fx.flash(e.x, 40, e.y, 150, 0xff7b1c, 0.35);
    w3.shake(26);
    this.host.popIcon(e.x, e.y, 80, 'boom', 1.3);
    this.host.freeze(0.08);
  }
}
