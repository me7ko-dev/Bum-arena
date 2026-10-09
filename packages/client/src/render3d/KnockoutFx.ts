/**
 * Нокаут – най-големият момент в играта. Падащият герой оставя цветна следа,
 * а когато „цопне“ – голям плясък (частиците ги пуска Effects3D чрез onSplash).
 *
 * Водата е далеч долу (WATER_Y) и често не се вижда от камерата над арената
 * (скрита е зад платформата или е извън екрана). Затова плясъкът става в най-ниската
 * точка под падащия, която камерата вижда – например точно под ръба на арената.
 * Отдалеч това изглежда като плясък в далечното море.
 */
import * as THREE from 'three';
import type { Arena, World } from '@bum/shared';
import type { CharacterView } from './Character';
import type { Ribbon, Trails } from './Trails';
import { WATER_Y } from './Water';

/** Дебелина на рамката на платформата (виж Arena3D) и пропорции на скалата отдолу. */
const RIM = 36;
const ROCK_DEPTH = 0.75;
const ROCK_RADIUS = 0.92;
const SLABS = [0, -RIM] as const;

export interface SplashInfo {
  playerId: number;
  x: number;
  y: number;
  z: number;
  /** Вижда ли се от камерата (ако не – само скриваме героя). */
  visible: boolean;
  /** Мащаб според разстоянието до камерата (далеч = по-едро, за да се чете). */
  scale: number;
}

interface Faller {
  id: number;
  ribbon: Ribbon | null;
  /** Бил ли е на екрана по време на падането (иначе плясъкът е невидим). */
  wasSeen: boolean;
}

export class KnockoutFx {
  private fallers: Faller[] = [];
  private v = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  /** Вика се при плясък (Effects3D пуска частиците/надписа). */
  onSplash: ((s: SplashInfo) => void) | null = null;

  constructor(private trails: Trails) {}

  /** Важният падащ (човекът е участвал) – камерата леко гледа към него до плясъка. */
  private focusId = -1;
  readonly focusPos = new THREE.Vector3();

  /** Играчът току-що падна от арената. important – с участие на човека. */
  start(id: number, color: number, important = false): void {
    if (important) this.focusId = id;
    if (this.fallers.some((f) => f.id === id)) return;
    // Цветна следа: цветът на героя, но по-наситен и светъл – да се чете на фона на морето.
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.s > 0.12) c.setHSL(hsl.h, Math.max(hsl.s, 0.75), Math.min(0.68, Math.max(hsl.l, 0.55)));
    else c.lerp(new THREE.Color(0xffffff), 0.5);
    // По-редки точки → дълга следа (падането е дълго).
    this.fallers.push({ id, ribbon: this.trails.acquire(c.getHex(), 44, 0.8, 34), wasSeen: false });
  }

  clear(): void {
    for (const f of this.fallers) f.ribbon?.hide();
    this.fallers.length = 0;
    this.focusId = -1;
  }

  /** Има ли важен падащ в момента (позицията му е в focusPos). */
  get hasFocus(): boolean {
    return this.focusId >= 0;
  }

  update(
    world: World,
    characters: Map<number, CharacterView>,
    camera: THREE.PerspectiveCamera,
  ): void {
    if (this.fallers.length === 0) return;
    this.camPos.copy(camera.position);
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i]!;
      const p = world.getPlayer(f.id);
      const view = characters.get(f.id);
      if (!p || !view || p.alive) {
        this.finish(i);
        continue;
      }
      const pos = view.root.position;
      const cy = pos.y + 30;
      if (f.id === this.focusId) this.focusPos.set(pos.x, 0, pos.z);
      if (!f.wasSeen && this.onScreen(pos.x, cy, pos.z, camera, -0.97)) f.wasSeen = true;
      f.ribbon?.push(pos.x, cy, pos.z, this.trails.now);
      // Най-ниската видима точка под героя (или водата, ако се вижда).
      const splashY = this.lowestVisibleY(pos.x, pos.z, world.arena, camera);
      if (p.fallTime < 0.12) continue;
      if (splashY !== null) {
        if (cy > splashY) continue;
        this.splash(f, view, pos.x, Math.min(cy, splashY), pos.z, true);
      } else {
        // Под героя нищо не се вижда (близкият ръб – пада „под“ камерата):
        // плясък там, където изчезва от погледа, малко преди долния край на екрана.
        const seen =
          cy < 0 &&
          this.onScreen(pos.x, cy, pos.z, camera, -0.62) &&
          !this.occluded(pos.x, cy, pos.z, world.arena);
        if (cy >= 0 || seen) continue;
        if (cy > WATER_Y && f.wasSeen) this.splash(f, view, pos.x, cy, pos.z, true);
        else if (cy <= WATER_Y) this.splash(f, view, pos.x, WATER_Y, pos.z, false);
        else continue;
      }
      this.finish(i);
    }
  }

  private splash(
    f: Faller,
    view: CharacterView,
    x: number,
    y: number,
    z: number,
    visible: boolean,
  ): void {
    const dist = this.camPos.distanceTo(this.v.set(x, y, z));
    this.onSplash?.({
      playerId: f.id,
      x,
      y,
      z,
      visible,
      scale: Math.min(3, Math.max(1.3, dist / 900)),
    });
    view.splashed = true;
  }

  private finish(i: number): void {
    const f = this.fallers[i]!;
    f.ribbon?.stop();
    if (f.id === this.focusId) this.focusId = -1;
    this.fallers.splice(i, 1);
  }

  /**
   * Търси отдолу нагоре (от водата до ръба) първата височина, на която точката (x, y, z)
   * е на екрана и не е скрита зад платформата. null = не се вижда никъде.
   */
  private lowestVisibleY(
    x: number,
    z: number,
    arena: Arena,
    camera: THREE.PerspectiveCamera,
  ): number | null {
    const steps = 18;
    const top = -40;
    for (let k = 0; k <= steps; k++) {
      const y = WATER_Y + ((top - WATER_Y) * k) / steps;
      if (this.onScreen(x, y, z, camera) && !this.occluded(x, y, z, arena)) return y;
    }
    return null;
  }

  /** На екрана ли е точката (с отстъп от краищата; bottom – долна граница в NDC). */
  private onScreen(
    x: number,
    y: number,
    z: number,
    camera: THREE.PerspectiveCamera,
    bottom = -0.86,
  ): boolean {
    this.v.set(x, y, z).project(camera);
    return this.v.z < 1 && Math.abs(this.v.x) < 0.9 && this.v.y < 0.86 && this.v.y > bottom;
  }

  /** Скрива ли платформата (горен диск + рамка + скалата-конус отдолу) точката от камерата. */
  private occluded(x: number, y: number, z: number, arena: Arena): boolean {
    const c = this.camPos;
    const R = arena.radius;
    const bottom = -RIM - R * ROCK_DEPTH;
    // Горният диск (y = 0) и долният ръб на рамката (y = -RIM) – точно пресичане.
    for (const py of SLABS) {
      if (y >= py) continue;
      const t = (c.y - py) / (c.y - y);
      const qx = c.x + (x - c.x) * t - arena.x;
      const qz = c.z + (z - c.z) * t - arena.y;
      if (qx * qx + qz * qz < R * R) return true;
    }
    // Скалата-конус – с проби по лъча.
    const n = 24;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const qy = c.y + (y - c.y) * t;
      if (qy > -RIM || qy < bottom) continue;
      const qx = c.x + (x - c.x) * t - arena.x;
      const qz = c.z + (z - c.z) * t - arena.y;
      const r = R * ROCK_RADIUS * (1 - (-RIM - qy) / (R * ROCK_DEPTH));
      if (qx * qx + qz * qz < r * r) return true;
    }
    return false;
  }
}
