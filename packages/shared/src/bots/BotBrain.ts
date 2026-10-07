import type { Balance } from '../config/balance';
import type { PlayerInput } from '../input';
import { Rng } from '../math/rng';
import type { Player } from '../sim/types';
import type { World } from '../sim/world';

export type BotDifficulty = 'easy' | 'normal' | 'hard';
type BotProfile = Balance['bots']['easy'];

/** Текущата цел на бота (избира се при всяко „мислене“). */
type Goal =
  | { kind: 'coin'; id: number }
  | { kind: 'attack'; id: number }
  | { kind: 'wander'; x: number; y: number }
  | { kind: 'retreat' };

/**
 * Мозък на бот. Вижда света така, както би го видял играч, и връща същия
 * PlayerInput като клавиатурата – симулацията не прави разлика между бот и човек.
 *
 * Поведение (по приоритет):
 *  1. Рефлекси всеки тик: пази се от ръба; спасителен дъш, ако го изхвърлят;
 *     избягва засилил се към него противник.
 *  2. „Мислене“ на всеки `reaction` секунди: избира цел – да нападне някого
 *     (предпочита близки, замаяни и такива до ръба), да вземе монета или да се разходи.
 *  3. Нападение: заобикаля целта откъм центъра и я бута навън; дъшва, когато е подравнен.
 */
export class BotBrain {
  private rng: Rng;
  private goal: Goal = { kind: 'retreat' };
  private thinkTimer = 0;
  /** Грешка в прицела за текущото решение (радиани). */
  private aimOffset = 0;
  /** Ще дъшне ли при подходящ момент (решава се при мислене). */
  private dashArmed = false;
  /** Сегашна посока (плавно се завърта към желаната). */
  private dirX = 0;
  private dirY = 0;
  /** Личност: ± към агресията, за да не са еднакви. */
  private temper: number;
  private abilityLastTick = false;

  constructor(
    readonly playerId: number,
    readonly difficulty: BotDifficulty,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.temper = this.rng.range(0.8, 1.2);
    this.thinkTimer = this.rng.range(0, 0.3);
  }

  private profile(cfg: Balance): BotProfile {
    return cfg.bots[this.difficulty];
  }

  think(world: World): PlayerInput {
    const me = world.getPlayer(this.playerId);
    if (!me || !me.alive || world.round.phase !== 'playing') return this.output(0, 0, false);

    const prof = this.profile(world.cfg);
    this.thinkTimer -= world.dt;
    if (this.thinkTimer <= 0) {
      this.decide(world, me, prof);
      this.thinkTimer = prof.reaction * this.rng.range(0.7, 1.3);
    }

    let [mx, my, wantDash] = this.steer(world, me, prof);

    // ── Рефлекс 1: пази се от ръба ──
    const safeR = effectiveRadius(world);
    const dist = Math.hypot(me.x - world.arena.x, me.y - world.arena.y);
    const toEdge = safeR - dist;
    if (toEdge < prof.edgeMargin && dist > 1) {
      const inX = (world.arena.x - me.x) / dist;
      const inY = (world.arena.y - me.y) / dist;
      const w = Math.min(1, 1 - toEdge / prof.edgeMargin);
      mx = mx * (1 - w) + inX * w * 1.5;
      my = my * (1 - w) + inY * w * 1.5;

      // ── Рефлекс 2: спасителен дъш, ако лети навън ──
      const outSpeed = -(me.vx * inX + me.vy * inY);
      if (outSpeed > world.cfg.player.maxSpeed && toEdge < prof.edgeMargin * 0.8 && me.abilityCooldown <= 0) {
        if (this.rng.chance(prof.recoverDash * 0.5)) {
          mx = inX;
          my = inY;
          wantDash = true;
        }
      }
      // Не дъшвай към ръба при нападение.
      if (wantDash && mx * inX + my * inY < 0) wantDash = false;
    }

    // ── Рефлекс 3: избягване на засилил се противник ──
    const threat = this.findThreat(world, me);
    if (threat && this.rng.chance(prof.dodge * 0.15)) {
      // Встрани – в посоката, която е по-навътре.
      const tx = threat.vx;
      const ty = threat.vy;
      const l = Math.hypot(tx, ty) || 1;
      let px = -ty / l;
      let py = tx / l;
      if (px * (world.arena.x - me.x) + py * (world.arena.y - me.y) < 0) {
        px = -px;
        py = -py;
      }
      mx = px;
      my = py;
      if (this.difficulty === 'hard' && me.abilityCooldown <= 0 && this.rng.chance(0.5)) wantDash = true;
    }

    return this.output(mx, my, wantDash, world.dt);
  }

  /** Плавно завъртане към желаната посока + натискане на бутона само за един тик. */
  private output(mx: number, my: number, wantDash: boolean, dt = 0): PlayerInput {
    const l = Math.hypot(mx, my);
    if (l > 1e-3) {
      mx /= l;
      my /= l;
    }
    const k = dt > 0 ? Math.min(1, dt * 14) : 1;
    this.dirX += (mx - this.dirX) * k;
    this.dirY += (my - this.dirY) * k;
    // Бутонът трябва да се „пусне“ между две натискания.
    const ability = wantDash && !this.abilityLastTick;
    this.abilityLastTick = ability;
    const outL = Math.hypot(this.dirX, this.dirY);
    const scale = outL > 1 ? 1 / outL : 1;
    return { mx: this.dirX * scale, my: this.dirY * scale, ability };
  }

  /** Избор на цел. */
  private decide(world: World, me: Player, prof: BotProfile): void {
    const safeR = effectiveRadius(world);
    const ax = world.arena.x;
    const ay = world.arena.y;
    const myDist = Math.hypot(me.x - ax, me.y - ay);
    this.aimOffset = this.rng.range(-prof.aimError, prof.aimError);
    this.dashArmed = this.rng.chance(prof.dashChance);

    // Твърде близо до ръба → първо назад.
    if (safeR - myDist < prof.edgeMargin * 0.7) {
      this.goal = { kind: 'retreat' };
      return;
    }

    let best: Goal | null = null;
    let bestScore = 0.08;

    // Нападение
    const aggression = prof.aggression * this.temper;
    for (const t of world.players) {
      if (t.id === me.id || !t.alive) continue;
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d > prof.sight) continue;
      const tEdge = safeR - Math.hypot(t.x - ax, t.y - ay);
      const nearEdge = 1 - Math.min(1, Math.max(0, tEdge) / 400);
      let score = aggression * (1 - d / prof.sight) * (1 + 1.5 * nearEdge);
      if (t.stun > 0) score *= 1.4;
      score *= 1 + Math.min(t.coins, 30) * 0.02;
      if (myDist > safeR * 0.8) score *= 0.5; // самият аз съм близо до ръба
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'attack', id: t.id };
      }
    }

    // Монети
    for (const c of world.coins) {
      if (c.pickupDelay > 0.2) continue;
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      if (d > prof.sight) continue;
      const cEdge = safeR - Math.hypot(c.x - ax, c.y - ay);
      if (cEdge < prof.edgeMargin * 0.6) continue; // твърде рисковано
      const score = prof.coinGreed * (1 - d / prof.sight) * (0.8 + Math.min(c.value, 5) * 0.2);
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'coin', id: c.id };
      }
    }

    if (best) {
      this.goal = best;
    } else if (this.goal.kind !== 'wander' || this.rng.chance(0.3)) {
      const r = Math.sqrt(this.rng.next()) * safeR * 0.5;
      const a = this.rng.next() * Math.PI * 2;
      this.goal = { kind: 'wander', x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r };
    }
  }

  /** Посока към текущата цел. Връща [mx, my, искам дъш]. */
  private steer(world: World, me: Player, prof: BotProfile): [number, number, boolean] {
    const g = this.goal;
    const ax = world.arena.x;
    const ay = world.arena.y;

    if (g.kind === 'retreat') return [ax - me.x, ay - me.y, false];

    if (g.kind === 'wander') {
      const dx = g.x - me.x;
      const dy = g.y - me.y;
      if (dx * dx + dy * dy < 60 * 60) this.thinkTimer = 0;
      return [dx, dy, false];
    }

    if (g.kind === 'coin') {
      const c = world.coins.find((k) => k.id === g.id);
      if (!c) {
        this.thinkTimer = 0; // монетата я няма – мисли пак
        return [this.dirX, this.dirY, false];
      }
      return [c.x - me.x, c.y - me.y, false];
    }

    // Нападение
    const t = world.getPlayer(g.id);
    if (!t || !t.alive) {
      this.thinkTimer = 0;
      return [this.dirX, this.dirY, false];
    }
    // „Навън“ за целта = от центъра към нея.
    const td = Math.hypot(t.x - ax, t.y - ay) || 1;
    const outX = (t.x - ax) / td;
    const outY = (t.y - ay) / td;
    const toTx = t.x - me.x;
    const toTy = t.y - me.y;
    const d = Math.hypot(toTx, toTy) || 1;
    const align = (toTx / d) * outX + (toTy / d) * outY; // 1 = точно зад нея откъм центъра

    if (align > 0.55) {
      // Подравнен – атака право в целта (с лек прицел напред и грешка).
      const lead = 0.15;
      let dx = t.x + t.vx * lead - me.x;
      let dy = t.y + t.vy * lead - me.y;
      const ang = Math.atan2(dy, dx) + this.aimOffset;
      const l = Math.hypot(dx, dy);
      dx = Math.cos(ang) * l;
      dy = Math.sin(ang) * l;
      const wantDash =
        this.dashArmed && align > 0.75 && d < prof.dashRange && me.abilityCooldown <= 0 && t.stun <= 0.4;
      return [dx, dy, wantDash];
    }

    // Заобикаляне: точка зад целта откъм центъра.
    const behind = me.radius + t.radius + 50;
    const bx = t.x - outX * behind;
    const by = t.y - outY * behind;
    let dx = bx - me.x;
    let dy = by - me.y;
    // Ако целта е между нас и точката – минаваме встрани, за да не я бутнем навътре.
    if (d < behind * 1.6 && align < 0) {
      const side = toTx * outY - toTy * outX > 0 ? 1 : -1;
      dx += -outY * side * behind;
      dy += outX * side * behind;
    }
    return [dx, dy, false];
  }

  /** Противник, който лети бързо към нас отблизо. */
  private findThreat(world: World, me: Player): Player | null {
    for (const o of world.players) {
      if (o.id === me.id || !o.alive) continue;
      const dx = me.x - o.x;
      const dy = me.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d > 280 || d < 1) continue;
      const closing = (o.vx * dx + o.vy * dy) / d;
      if (closing > 500) return o;
    }
    return null;
  }
}

/** Безопасният радиус: ако арената скоро ще се свие – новият, по-малък радиус. */
function effectiveRadius(world: World): number {
  const a = world.arena;
  const soon = a.shrinking || (a.shrinkIn >= 0 && a.shrinkIn <= world.cfg.arena.shrinkWarning + 1);
  return soon ? Math.min(a.radius, a.nextRadius) : a.radius;
}

/** Избира трудност според съотношението в конфига. */
export function pickDifficulty(cfg: Balance, rng: Rng): BotDifficulty {
  const mix = cfg.bots.mix;
  const total = mix.easy + mix.normal + mix.hard;
  let r = rng.next() * total;
  if ((r -= mix.easy) < 0) return 'easy';
  if ((r -= mix.normal) < 0) return 'normal';
  return 'hard';
}
