/**
 * Частици с една инстанция (InstancedMesh) = един draw call за стотици частици.
 * Ползват се за искри, прах, конфети, лед, експлозии, пръски вода.
 *
 * Всичко е предварително заделено (пул) – в горещия път няма нови обекти.
 */
import * as THREE from 'three';

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  drag: number;
  spin: number;
  /** Под тази височина частицата отскача (или изчезва, ако kill). */
  floor: number;
  /** true = изчезва под floor (капки, които падат обратно във водата). */
  kill: boolean;
  /** Разтягане по скоростта (искри като черти). */
  stretch: number;
  color: THREE.Color;
}

export interface BurstOptions {
  count: number;
  colors: number[];
  speed: [number, number];
  size: [number, number];
  life: [number, number];
  /** Посока нагоре (0..1) – колко „фонтан“ е. */
  up?: number;
  gravity?: number;
  drag?: number;
  /** Насочен изблик: посока в равнината (x, z) и разсейване (радиани). */
  dirX?: number;
  dirZ?: number;
  spread?: number;
  /** Разпръскване на началната точка (радиус). */
  jitter?: number;
  /** Височина на „пода“ – под нея частицата отскача. По подразбиране 2 (подът на арената). */
  floor?: number;
  /** Изчезва при достигане на floor вместо да отскочи. */
  kill?: boolean;
  /** Разтягане по посоката на движение (0 = кръгли). */
  stretch?: number;
}

const MAX = 700;
const UP = new THREE.Vector3(0, 1, 0);

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  /** Активни частици: [0, n). След тях – свободни (готови обекти). */
  private pool: P[] = [];
  private n = 0;
  private dummy = new THREE.Object3D();
  private dir = new THREE.Vector3();

  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    // Цвят за всяка инстанция.
    this.mesh.setColorAt(0, new THREE.Color());
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        size: 1,
        gravity: 0,
        drag: 0,
        spin: 0,
        floor: 2,
        kill: false,
        stretch: 0,
        color: new THREE.Color(),
      });
    }
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, o: BurstOptions): void {
    const up = o.up ?? 0.5;
    const directed = o.dirX !== undefined && o.dirZ !== undefined;
    const baseA = directed ? Math.atan2(o.dirZ!, o.dirX!) : 0;
    const spread = o.spread ?? 0.6;
    const jitter = o.jitter ?? 0;
    for (let i = 0; i < o.count && this.n < MAX; i++) {
      const a = directed ? baseA + (Math.random() - 0.5) * 2 * spread : Math.random() * Math.PI * 2;
      const elev = up * (0.3 + Math.random() * 0.7);
      const sp = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      const life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      const p = this.pool[this.n++]!;
      const ja = Math.random() * Math.PI * 2;
      const jr = jitter * Math.sqrt(Math.random());
      p.x = x + Math.cos(ja) * jr;
      p.y = y;
      p.z = z + Math.sin(ja) * jr;
      p.vx = Math.cos(a) * sp * (1 - elev);
      p.vy = sp * elev * 1.6;
      p.vz = Math.sin(a) * sp * (1 - elev);
      p.life = life;
      p.max = life;
      p.size = o.size[0] + Math.random() * (o.size[1] - o.size[0]);
      p.gravity = o.gravity ?? 900;
      p.drag = o.drag ?? 1.5;
      p.spin = (Math.random() - 0.5) * 12;
      p.floor = o.floor ?? 2;
      p.kill = o.kill ?? false;
      p.stretch = o.stretch ?? 0;
      p.color.setHex(o.colors[Math.floor(Math.random() * o.colors.length)]!);
    }
  }

  /** Маха всички частици (нов рунд). */
  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    const pool = this.pool;
    let i = 0;
    while (i < this.n) {
      const p = pool[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        // Размяна с последния активен – без заделяне на памет.
        pool[i] = pool[this.n - 1]!;
        pool[this.n - 1] = p;
        this.n--;
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy = p.vy * d - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor && p.gravity > 0) {
        if (p.kill) {
          // Ще изчезне в следващия кадър; сега я рисуваме смалена до нула.
          p.life = 0;
          this.write(i++, p, 0.001);
          continue;
        }
        p.y = p.floor;
        p.vy *= -0.35;
      }
      const k = p.life / p.max;
      const s = p.size * (k < 0.3 ? k / 0.3 : 1);
      this.write(i, p, Math.max(0.001, s));
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private write(i: number, p: P, s: number): void {
    const dm = this.dummy;
    dm.position.set(p.x, p.y, p.z);
    if (p.stretch > 0) {
      // Искра-черта: удължена по посоката на движение.
      this.dir.set(p.vx, p.vy, p.vz);
      const sp = this.dir.length();
      if (sp > 1) dm.quaternion.setFromUnitVectors(UP, this.dir.multiplyScalar(1 / sp));
      dm.scale.set(s * 0.7, s * (1 + Math.min(sp * p.stretch, 6)), s * 0.7);
    } else {
      dm.rotation.set(p.spin * p.life, p.spin * p.life * 0.7, 0);
      dm.scale.setScalar(s);
    }
    dm.updateMatrix();
    this.mesh.setMatrixAt(i, dm.matrix);
    this.mesh.setColorAt(i, p.color);
  }
}
