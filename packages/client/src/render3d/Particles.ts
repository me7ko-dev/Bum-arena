/**
 * Частици с една инстанция (InstancedMesh) = един draw call за стотици частици.
 * Ползват се за искри, прах, конфети, лед, експлозии.
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
}

const MAX = 600;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pool: P[] = [];
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Цвят за всяка инстанция.
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, o: BurstOptions): void {
    for (let i = 0; i < o.count && this.pool.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = o.up ?? 0.5;
      const elev = up * (0.3 + Math.random() * 0.7);
      const sp = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      const life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      this.pool.push({
        x,
        y,
        z,
        vx: Math.cos(a) * sp * (1 - elev),
        vy: sp * elev * 1.6,
        vz: Math.sin(a) * sp * (1 - elev),
        life,
        max: life,
        size: o.size[0] + Math.random() * (o.size[1] - o.size[0]),
        gravity: o.gravity ?? 900,
        drag: o.drag ?? 1.5,
        spin: (Math.random() - 0.5) * 12,
        color: new THREE.Color(o.colors[Math.floor(Math.random() * o.colors.length)]!),
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.pool[i] = this.pool[this.pool.length - 1]!;
        this.pool.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy = p.vy * d - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 2 && p.gravity > 0) {
        p.y = 2;
        p.vy *= -0.35;
      }
      const k = p.life / p.max;
      const s = p.size * (k < 0.3 ? k / 0.3 : 1);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.spin * k, p.spin * k * 0.7, 0);
      this.dummy.scale.setScalar(Math.max(0.001, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Разширяващи се пръстени по земята (ударни вълни). */
export class Shockwaves {
  private items: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; size: number }[] = [];
  private geo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);

  constructor(private scene: THREE.Scene) {}

  spawn(x: number, z: number, size: number, color = 0xffffff, dur = 0.35, y = 3): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    this.items.push({ mesh, mat, t: 0, dur, size });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) {
        this.scene.remove(it.mesh);
        it.mat.dispose();
        this.items.splice(i, 1);
        continue;
      }
      const e = 1 - (1 - k) ** 3;
      it.mesh.scale.setScalar(10 + it.size * e);
      it.mat.opacity = 0.9 * (1 - k);
    }
  }
}
