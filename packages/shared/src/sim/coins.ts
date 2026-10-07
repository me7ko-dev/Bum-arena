import type { Coin, Player } from './types';
import type { World } from './world';

/**
 * Монети: появяване, плъзгане, събиране и разпиляване.
 */
export class CoinSystem {
  readonly coins: Coin[] = [];
  private nextId = 1;
  private spawnTimer = 0;

  constructor(private world: World) {}

  /** Начални монети в рунда. */
  spawnInitial(): void {
    for (let i = 0; i < this.world.cfg.coins.startCount; i++) this.spawnRandom();
  }

  /** Нова монета на случайно място в арената. */
  spawnRandom(): void {
    const { rng, arena, cfg } = this.world;
    // sqrt → равномерно по площта на кръга, а не струпани в центъра
    const r = Math.sqrt(rng.next()) * arena.radius * cfg.coins.spawnRadiusFrac;
    const a = rng.next() * Math.PI * 2;
    this.spawnAt(arena.x + Math.cos(a) * r, arena.y + Math.sin(a) * r);
  }

  /** Монета на точно място (със скорост, стойност и забавяне за вземане по желание). */
  spawnAt(x: number, y: number, vx = 0, vy = 0, value = 1, delay = 0): Coin {
    const c: Coin = { id: this.nextId++, x, y, prevX: x, prevY: y, vx, vy, value, pickupDelay: delay };
    this.coins.push(c);
    return c;
  }

  /**
   * Играчът изпуска `count` монети, които се пръскат около точката (x, y).
   * biasX/biasY – по желание посока, накъдето да летят повече (напр. към центъра).
   */
  scatter(p: Player, count: number, x: number, y: number, biasX = 0, biasY = 0): void {
    count = Math.min(count, p.coins);
    if (count <= 0) return;
    const { rng, cfg } = this.world;
    const cc = cfg.coins;
    p.coins -= count;

    const pieces = Math.min(count, Math.max(1, Math.round(cc.maxScatterPieces)));
    const base = Math.floor(count / pieces);
    let extra = count - base * pieces;
    for (let i = 0; i < pieces; i++) {
      const value = base + (extra-- > 0 ? 1 : 0);
      const a = rng.next() * Math.PI * 2;
      const speed = rng.range(cc.scatterSpeedMin, cc.scatterSpeedMax);
      const vx = Math.cos(a) * speed + biasX * cc.scatterSpeedMax;
      const vy = Math.sin(a) * speed + biasY * cc.scatterSpeedMax;
      this.spawnAt(x, y, vx, vy, value, cc.pickupDelay);
    }
    this.world.events.push({ type: 'coinDrop', playerId: p.id, count, x, y });
  }

  /** Веднъж на тик: появяване, движение, събиране, изпадане извън арената. */
  update(dt: number, spawning: boolean): void {
    const { cfg, arena } = this.world;
    const cc = cfg.coins;

    if (spawning) {
      this.spawnTimer += dt;
      while (this.spawnTimer >= cc.spawnInterval) {
        this.spawnTimer -= cc.spawnInterval;
        if (this.coins.length < cc.maxOnMap) this.spawnRandom();
      }
    }

    const drag = Math.exp(-cc.friction * dt);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i]!;
      c.prevX = c.x;
      c.prevY = c.y;
      if (c.vx !== 0 || c.vy !== 0) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx *= drag;
        c.vy *= drag;
        if (Math.abs(c.vx) + Math.abs(c.vy) < 2) c.vx = c.vy = 0;
      }
      if (c.pickupDelay > 0) c.pickupDelay -= dt;

      // Извън арената → изпада (изгубена).
      const dx = c.x - arena.x;
      const dy = c.y - arena.y;
      if (dx * dx + dy * dy > arena.radius * arena.radius) {
        this.removeAt(i);
        continue;
      }

      if (c.pickupDelay <= 0 && this.tryPickup(c)) this.removeAt(i);
    }
  }

  private tryPickup(c: Coin): boolean {
    const cr = this.world.cfg.coins.radius;
    for (const p of this.world.players) {
      if (!p.alive) continue;
      const r = p.radius + cr;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (dx * dx + dy * dy > r * r) continue;
      p.coins += c.value;
      this.world.events.push({ type: 'coinPickup', playerId: p.id, value: c.value, x: c.x, y: c.y });
      return true;
    }
    return false;
  }

  private removeAt(i: number): void {
    // Бързо премахване: последният елемент на мястото на изтрития.
    const last = this.coins.pop()!;
    if (i < this.coins.length) this.coins[i] = last;
  }
}
