import type { Car, Player } from './types';
import type { World } from './world';

/** Брой видове коли (визуално – клиентът има толкова спрайта). */
export const CAR_KINDS = 5;

/**
 * Коли: появяват се на картата, влизаш като минеш през тях,
 * слизаш с бутона за суперсила. Колата има „живот“ и се разбива от удари.
 */
export class CarSystem {
  readonly cars: Car[] = [];
  private nextId = 1;
  private spawnTimer: number;

  constructor(private world: World) {
    this.spawnTimer = world.cfg.cars.firstSpawnAt;
  }

  /** Веднъж на тик по време на игра. */
  update(dt: number): void {
    const { cfg, arena } = this.world;
    const cc = cfg.cars;

    this.spawnTimer -= dt;
    const driven = this.world.players.filter((p) => p.alive && p.inCar).length;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = cc.spawnInterval;
      if (this.cars.length + driven < cc.maxOnMap) this.spawn();
    }

    // Паркирани коли извън арената (при свиване) изчезват.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i]!;
      if (Math.hypot(c.x - arena.x, c.y - arena.y) > arena.radius - cc.radius * 0.5) this.cars.splice(i, 1);
    }

    // Влизане: жив играч, без кола, докосва паркирана кола.
    for (const p of this.world.players) {
      if (!p.alive || p.inCar || p.carCooldown > 0 || p.frozen > 0) continue;
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i]!;
        const r = p.radius + cc.radius * 0.8;
        if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 > r * r) continue;
        this.cars.splice(i, 1);
        p.inCar = true;
        p.carHp = c.hp;
        p.carKind = c.kind;
        p.abilityTime = 0; // суперсилата спира
        p.x = c.x;
        p.y = c.y;
        this.world.events.push({ type: 'carEnter', playerId: p.id, x: p.x, y: p.y });
        break;
      }
    }
  }

  private spawn(): void {
    const { rng, arena, players, cfg } = this.world;
    // Опитваме няколко места – да не е върху играч.
    for (let attempt = 0; attempt < 10; attempt++) {
      const r = Math.sqrt(rng.next()) * arena.radius * 0.55;
      const a = rng.next() * Math.PI * 2;
      const x = arena.x + Math.cos(a) * r;
      const y = arena.y + Math.sin(a) * r;
      const free = players.every((p) => !p.alive || Math.hypot(p.x - x, p.y - y) > p.radius + cfg.cars.radius + 40);
      if (!free) continue;
      const car: Car = { id: this.nextId++, x, y, hp: cfg.cars.hp, kind: rng.int(0, CAR_KINDS - 1), dir: rng.chance(0.5) ? 1 : -1 };
      this.cars.push(car);
      this.world.events.push({ type: 'carSpawn', carId: car.id, x, y });
      return;
    }
  }

  /** Паркира кола на дадено място (при слизане). */
  park(x: number, y: number, hp: number, kind: number, dir: number): void {
    this.cars.push({ id: this.nextId++, x, y, hp, kind, dir });
  }
}

/** Слизане от колата: колата остава паркирана, човечето изскача встрани. */
export function exitCar(world: World, p: Player): void {
  if (!p.inCar) return;
  const cc = world.cfg.cars;
  p.inCar = false;
  p.carCooldown = cc.reenterDelay;
  world.carSystem.park(p.x, p.y, p.carHp, p.carKind, p.vx >= 0 ? 1 : -1);
  // Изскачаме перпендикулярно на движението, към центъра.
  const side = Math.atan2(world.arena.y - p.y, world.arena.x - p.x);
  const out = cc.radius + world.cfg.player.radius + 4;
  p.x += Math.cos(side) * out;
  p.y += Math.sin(side) * out;
  p.prevX = p.x;
  p.prevY = p.y;
  p.vx = Math.cos(side) * 200;
  p.vy = Math.sin(side) * 200;
  world.events.push({ type: 'carExit', playerId: p.id, x: p.x, y: p.y });
}

/** Щети по колата от удар със сила strength (0..1). Разбива я при 0. */
export function damageCar(world: World, p: Player, strength: number): void {
  if (!p.inCar) return;
  const cc = world.cfg.cars;
  p.carHp -= cc.damagePerHit * Math.max(0.25, strength);
  if (p.carHp > 0) return;

  // Разбиване: взрив, който отблъсква околните, шофьорът е замаян.
  p.inCar = false;
  p.carHp = 0;
  p.carCooldown = cc.reenterDelay;
  p.stun = Math.max(p.stun, cc.wreckStun);
  for (const o of world.players) {
    if (o === p || !o.alive || o.immune) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > cc.wreckRadius + o.radius) continue;
    const k = (cc.wreckForce * (1 - d / (cc.wreckRadius + o.radius) * 0.6)) / o.mass;
    o.vx += (dx / d) * k;
    o.vy += (dy / d) * k;
  }
  world.events.push({ type: 'carWreck', playerId: p.id, x: p.x, y: p.y });
}
