/**
 * Опашки-ленти (ribbon trail): следа зад героя при дъш и цветна следа при падане.
 *
 * Лентата е редица от точки (последните ~0.3 сек), винаги обърната към камерата,
 * изтънява и избледнява към края. Лентите се вземат от пул и се връщат в него –
 * геометриите се заделят веднъж.
 */
import * as THREE from 'three';

const MAX_POINTS = 28;
/** Минимално разстояние между точките на лентата. */
const MIN_STEP = 14;

export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  // Кръгов буфер с точките: x, y, z, време.
  private px = new Float32Array(MAX_POINTS);
  private py = new Float32Array(MAX_POINTS);
  private pz = new Float32Array(MAX_POINTS);
  private pt = new Float32Array(MAX_POINTS);
  private head = 0;
  private count = 0;
  private color = new THREE.Color();
  private width = 30;
  private life = 0.3;
  private minStep = MIN_STEP;
  /** Още се добавят точки (собственикът е жив). */
  emitting = false;
  /** Заета ли е (в пула). */
  active = false;

  constructor(material: THREE.Material) {
    this.pos = new Float32Array(MAX_POINTS * 2 * 3);
    this.col = new Float32Array(MAX_POINTS * 2 * 4);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    const idx: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
  }

  start(color: number, width: number, life: number, minStep = MIN_STEP): void {
    this.color.setHex(color);
    this.minStep = minStep;
    this.width = width;
    this.life = life;
    this.head = 0;
    this.count = 0;
    this.emitting = true;
    this.active = true;
  }

  /** Нова точка (ако е достатъчно далеч от последната). */
  push(x: number, y: number, z: number, time: number): void {
    if (!this.emitting) return;
    // Последната точка („главата“) следва героя; нова точка се добавя чак когато
    // главата се отдалечи достатъчно от предпоследната (иначе лентата е на „стъпала“).
    if (this.count >= 2) {
      const last = (this.head - 1 + MAX_POINTS) % MAX_POINTS;
      const prev = (this.head - 2 + MAX_POINTS) % MAX_POINTS;
      const dx = x - this.px[prev]!;
      const dy = y - this.py[prev]!;
      const dz = z - this.pz[prev]!;
      if (dx * dx + dy * dy + dz * dz < this.minStep * this.minStep) {
        this.px[last] = x;
        this.py[last] = y;
        this.pz[last] = z;
        this.pt[last] = time;
        return;
      }
    }
    this.px[this.head] = x;
    this.py[this.head] = y;
    this.pz[this.head] = z;
    this.pt[this.head] = time;
    this.head = (this.head + 1) % MAX_POINTS;
    this.count = Math.min(this.count + 1, MAX_POINTS);
  }

  /** Спира добавянето; лентата сама избледнява и се освобождава. */
  stop(): void {
    this.emitting = false;
  }

  /** Обновява върховете. Връща false, когато е напълно изчезнала. */
  update(time: number, camPos: THREE.Vector3): boolean {
    // Махаме старите точки от опашката.
    while (this.count > 0) {
      const tail = (this.head - this.count + MAX_POINTS) % MAX_POINTS;
      if (time - this.pt[tail]! <= this.life) break;
      this.count--;
    }
    if (this.count < 2) {
      this.mesh.visible = false;
      if (!this.emitting) this.active = false;
      return this.active;
    }
    const n = this.count;
    const c = this.color;
    for (let k = 0; k < n; k++) {
      // k = 0 – най-старата точка (опашката), n-1 – най-новата (главата).
      const i = (this.head - n + k + MAX_POINTS) % MAX_POINTS;
      const j = k < n - 1 ? (i + 1) % MAX_POINTS : i;
      const h = k > 0 ? (i - 1 + MAX_POINTS) % MAX_POINTS : i;
      // Посока на лентата в тази точка.
      const ax = this.px[j]! - this.px[h]!;
      const ay = this.py[j]! - this.py[h]!;
      const az = this.pz[j]! - this.pz[h]!;
      // Към камерата.
      const vx = camPos.x - this.px[i]!;
      const vy = camPos.y - this.py[i]!;
      const vz = camPos.z - this.pz[i]!;
      // Страничен вектор = посока × поглед.
      let sx = ay * vz - az * vy;
      let sy = az * vx - ax * vz;
      let sz = ax * vy - ay * vx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const age = Math.min(1, (time - this.pt[i]!) / this.life);
      const fade = 1 - age;
      const w = (this.width * 0.5 * (0.25 + 0.75 * fade)) / sl;
      sx *= w;
      sy *= w;
      sz *= w;
      const o = k * 6;
      this.pos[o] = this.px[i]! + sx;
      this.pos[o + 1] = this.py[i]! + sy;
      this.pos[o + 2] = this.pz[i]! + sz;
      this.pos[o + 3] = this.px[i]! - sx;
      this.pos[o + 4] = this.py[i]! - sy;
      this.pos[o + 5] = this.pz[i]! - sz;
      const a = fade * (0.35 + 0.6 * fade);
      const q = k * 8;
      this.col[q] = this.col[q + 4] = c.r;
      this.col[q + 1] = this.col[q + 5] = c.g;
      this.col[q + 2] = this.col[q + 6] = c.b;
      this.col[q + 3] = this.col[q + 7] = a;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.posAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(0, n * 6);
    this.colAttr.clearUpdateRanges();
    this.colAttr.addUpdateRange(0, n * 8);
    this.mesh.geometry.setDrawRange(0, (n - 1) * 6);
    this.mesh.visible = true;
    return true;
  }

  hide(): void {
    this.active = false;
    this.emitting = false;
    this.count = 0;
    this.mesh.visible = false;
  }
}

/** Пул от ленти (една обща материя, всяка лента = един draw call, само докато се вижда). */
export class Trails {
  private pool: Ribbon[] = [];
  private material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private time = 0;
  private camPos = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    size = 16,
  ) {
    for (let i = 0; i < size; i++) {
      const r = new Ribbon(this.material);
      this.pool.push(r);
      scene.add(r.mesh);
    }
  }

  get now(): number {
    return this.time;
  }

  /** Взима свободна лента (или null, ако всички са заети). */
  acquire(color: number, width: number, life: number, minStep?: number): Ribbon | null {
    for (const r of this.pool) {
      if (r.active) continue;
      r.start(color, width, life, minStep);
      return r;
    }
    return null;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.camPos.copy(camera.position);
    for (const r of this.pool) if (r.active) r.update(this.time, this.camPos);
  }

  clear(): void {
    for (const r of this.pool) r.hide();
  }

  dispose(): void {
    for (const r of this.pool) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
    }
    this.material.dispose();
  }
}
