/**
 * Кратки 3D ефекти („сочност“): пръстени, комикс-звезди при удар, куполи, балончета,
 * черти на скоростта, линии на магнита, проблясъци по монетите.
 *
 * Всеки вид е ЕДИН InstancedMesh (= един draw call), всички обекти са предварително
 * заделени (пул) и в горещия път няма нови обекти. Прозрачността е за всяка инстанция
 * (атрибут aAlpha), а цветът – instanceColor.
 *
 * Ред на кадъра (World3D): fx.begin(dt, camera) → (добавяне на „мигновени“ неща:
 * линии на магнита, проблясъци) → fx.end().
 */
import * as THREE from 'three';

// ───────────── Материал ─────────────

/** Инстанциран материал с прозрачност за всяка инстанция и мъгла. */
function fxMaterial(opts: {
  additive?: boolean;
  fresnel?: boolean;
  /** Дъгови преливания (мехур на щита). */
  iridescent?: boolean;
  /** Меки краища по дължината (uv.x) – за черти/лъчи. */
  beam?: boolean;
  depthTest?: boolean;
  side?: THREE.Side;
}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (opts.fresnel) defines.FRESNEL = '';
  if (opts.iridescent) defines.IRIDESCENT = '';
  if (opts.beam) defines.BEAM = '';
  return new THREE.ShaderMaterial({
    defines,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    transparent: true,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    side: opts.side ?? THREE.DoubleSide,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: true,
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;
      varying vec3 vColor;
      varying vec2 vUv;
      #ifdef FRESNEL
      varying vec3 vN;
      varying vec3 vV;
      #endif
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vAlpha = aAlpha;
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vColor = instanceColor;
        #endif
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        #ifdef FRESNEL
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = -mvPosition.xyz;
        #endif
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      varying vec2 vUv;
      #ifdef FRESNEL
      varying vec3 vN;
      varying vec3 vV;
      #endif
      #include <fog_pars_fragment>
      void main() {
        float a = vAlpha;
        vec3 col = vColor;
        #ifdef BEAM
        a *= smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
        #endif
        #ifdef FRESNEL
        // Ръбът свети, средата е почти прозрачна – „стъкло“ / „сапунен мехур“.
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(f, 2.5);
        a *= 0.07 + rim * 0.85;
        col = mix(col, vec3(1.0), rim * 0.45);
        #ifdef IRIDESCENT
        // Сапунен мехур: дъгови преливания по ръба.
        col += rim * 0.35 * vec3(sin(f * 14.0), sin(f * 14.0 + 2.1), sin(f * 14.0 + 4.2));
        #endif
        #endif
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ───────────── Слой (един InstancedMesh) ─────────────

class FxLayer {
  readonly mesh: THREE.InstancedMesh;
  private alpha: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private max: number,
    renderOrder = 6,
  ) {
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aAlpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
  }

  begin(): void {
    this.n = 0;
  }

  add(m: THREE.Matrix4, color: THREE.Color, alpha: number): void {
    if (this.n >= this.max || alpha <= 0.003) return;
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, color);
    this.alpha.array[this.n] = alpha;
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n === 0) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

// ───────────── Геометрии ─────────────

/** Комикс-звезда „БУМ“: назъбени лъчи с различна дължина (детерминирано). */
function burstStarGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const spikes = 11;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const outer = 0.78 + 0.22 * Math.abs(Math.sin(i * 2.17 + 0.6));
    const r = i % 2 === 0 ? outer : 0.42 + 0.06 * Math.sin(i * 1.3);
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** Четирилъчева звездичка (проблясък). */
function glintGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.16;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** Правоъгълник 1×1 с uv.x по дължината; центрован по X от 0 до 1 (за черти). */
function beamGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
}

// ───────────── Елементи (пулове) ─────────────

interface Ring {
  x: number;
  y: number;
  z: number;
  size: number;
  color: THREE.Color;
  t: number;
  dur: number;
  delay: number;
  billboard: boolean;
  alpha: number;
  thin: boolean;
}

interface Flash {
  x: number;
  y: number;
  z: number;
  size: number;
  color: THREE.Color;
  t: number;
  dur: number;
  roll: number;
}

interface Bubble {
  x: number;
  y: number;
  z: number;
  r0: number;
  r1: number;
  color: THREE.Color;
  t: number;
  dur: number;
  /** true = полусфера-купол на земята, false = сфера. */
  dome: boolean;
}

interface Streak {
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  vx: number;
  vz: number;
  len: number;
  width: number;
  color: THREE.Color;
  t: number;
  dur: number;
}

/** Масив с предварително заделени обекти: активните са [0, n). */
class Pool<T> {
  readonly items: T[] = [];
  n = 0;
  constructor(size: number, make: () => T) {
    for (let i = 0; i < size; i++) this.items.push(make());
  }
  take(): T | null {
    return this.n < this.items.length ? this.items[this.n++]! : null;
  }
  /** Маха елемент i (разменя с последния активен). */
  remove(i: number): void {
    const it = this.items[i]!;
    this.items[i] = this.items[this.n - 1]!;
    this.items[this.n - 1] = it;
    this.n--;
  }
}

const GROUND_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);
const OUTLINE = new THREE.Color(0x2a1650);

const easeOut3 = (k: number) => 1 - (1 - k) ** 3;
function easeOutBack(k: number): number {
  const c = 1.9;
  return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
}

export class Fx3D {
  private rings: FxLayer;
  private flashes: FxLayer;
  private domes: FxLayer;
  private bubbles: FxLayer;
  private beams: FxLayer;
  private glints: FxLayer;
  private all: FxLayer[];

  private ringPool = new Pool<Ring>(64, () => ({
    x: 0,
    y: 0,
    z: 0,
    size: 0,
    color: new THREE.Color(),
    t: 0,
    dur: 1,
    delay: 0,
    billboard: false,
    alpha: 1,
    thin: false,
  }));
  private flashPool = new Pool<Flash>(24, () => ({
    x: 0,
    y: 0,
    z: 0,
    size: 0,
    color: new THREE.Color(),
    t: 0,
    dur: 1,
    roll: 0,
  }));
  private bubblePool = new Pool<Bubble>(12, () => ({
    x: 0,
    y: 0,
    z: 0,
    r0: 0,
    r1: 0,
    color: new THREE.Color(),
    t: 0,
    dur: 1,
    dome: false,
  }));
  private streakPool = new Pool<Streak>(96, () => ({
    x: 0,
    y: 0,
    z: 0,
    dx: 0,
    dz: 0,
    vx: 0,
    vz: 0,
    len: 0,
    width: 0,
    color: new THREE.Color(),
    t: 0,
    dur: 1,
  }));

  // Временни обекти (без заделяне в горещия път).
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private col = new THREE.Color();
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.rings = new FxLayer(scene, new THREE.RingGeometry(0.82, 1, 48), fxMaterial({}), 64, 5);
    this.flashes = new FxLayer(
      scene,
      burstStarGeometry(),
      fxMaterial({ depthTest: false }),
      72,
      20,
    );
    // Леден купол: малко стени с плоски нормали → изглежда като кристал.
    const domeGeo = new THREE.SphereGeometry(
      1,
      14,
      5,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    ).toNonIndexed();
    domeGeo.computeVertexNormals();
    this.domes = new FxLayer(
      scene,
      domeGeo,
      fxMaterial({ fresnel: true, side: THREE.FrontSide }),
      12,
      7,
    );
    this.bubbles = new FxLayer(
      scene,
      new THREE.SphereGeometry(1, 28, 16),
      fxMaterial({ fresnel: true, iridescent: true, side: THREE.FrontSide }),
      12,
      7,
    );
    this.beams = new FxLayer(
      scene,
      beamGeometry(),
      fxMaterial({ beam: true, additive: false }),
      256,
      6,
    );
    this.glints = new FxLayer(scene, glintGeometry(), fxMaterial({ additive: true }), 128, 8);
    this.all = [this.rings, this.flashes, this.domes, this.bubbles, this.beams, this.glints];
  }

  // ───────────── API за събития ─────────────

  /**
   * Разширяващ се пръстен. billboard=true – обърнат към камерата (във въздуха),
   * иначе лежи на земята на височина y.
   */
  ring(
    x: number,
    y: number,
    z: number,
    size: number,
    color: number,
    dur = 0.35,
    opts: { billboard?: boolean; delay?: number; alpha?: number; thin?: boolean } = {},
  ): void {
    const r = this.ringPool.take();
    if (!r) return;
    r.x = x;
    r.y = y;
    r.z = z;
    r.size = size;
    r.color.setHex(color);
    r.t = 0;
    r.dur = dur;
    r.delay = opts.delay ?? 0;
    r.billboard = opts.billboard ?? false;
    r.alpha = opts.alpha ?? 0.9;
    r.thin = opts.thin ?? false;
  }

  /** Комикс-звезда при удар: изскача и избледнява (обърната към камерата). */
  flash(x: number, y: number, z: number, size: number, color: number, dur = 0.26): void {
    const f = this.flashPool.take();
    if (!f) return;
    f.x = x;
    f.y = y;
    f.z = z;
    f.size = size;
    f.color.setHex(color);
    f.t = 0;
    f.dur = dur;
    f.roll = Math.random() * Math.PI * 2;
  }

  /** Купол (полусфера) на земята, който се разширява – напр. лед при замразяване. */
  dome(x: number, z: number, radius: number, color: number, dur = 0.7): void {
    this.bubble(x, 0, z, radius * 0.25, radius, color, dur, true);
  }

  /** Сфера, която се разширява от r0 до r1 (вълна на щита). */
  bubble(
    x: number,
    y: number,
    z: number,
    r0: number,
    r1: number,
    color: number,
    dur = 0.5,
    dome = false,
  ): void {
    const b = this.bubblePool.take();
    if (!b) return;
    b.x = x;
    b.y = y;
    b.z = z;
    b.r0 = r0;
    b.r1 = r1;
    b.color.setHex(color);
    b.t = 0;
    b.dur = dur;
    b.dome = dome;
  }

  /**
   * Черта на скоростта: лежи по посоката (dx, dz), дълга len, и се плъзга с (vx, vz).
   */
  streak(
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    len: number,
    width: number,
    color: number,
    dur = 0.22,
    vx = 0,
    vz = 0,
  ): void {
    const s = this.streakPool.take();
    if (!s) return;
    s.x = x;
    s.y = y;
    s.z = z;
    s.dx = dx;
    s.dz = dz;
    s.vx = vx;
    s.vz = vz;
    s.len = len;
    s.width = width;
    s.color.setHex(color);
    s.t = 0;
    s.dur = dur;
  }

  /** Маха всичко (нов рунд). */
  clear(): void {
    this.ringPool.n = 0;
    this.flashPool.n = 0;
    this.bubblePool.n = 0;
    this.streakPool.n = 0;
    for (const l of this.layers()) {
      l.begin();
      l.end();
    }
  }

  // ───────────── Кадър ─────────────

  /** Начало на кадъра: смята пуловете и ги записва в слоевете. */
  begin(dt: number, camera: THREE.Camera): void {
    this.camera = camera;
    for (const l of this.layers()) l.begin();
    this.updateRings(dt, camera);
    this.updateFlashes(dt, camera);
    this.updateBubbles(dt);
    this.updateStreaks(dt);
  }

  /** Край на кадъра: качва данните в GPU. */
  end(): void {
    for (const l of this.layers()) l.end();
  }

  /** Лъч (черта) от A до B, обърнат към камерата – само за този кадър. */
  beam(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    width: number,
    color: THREE.Color,
    alpha: number,
  ): void {
    if (!this.camera) return;
    this.writeBeam(this.a.set(ax, ay, az), this.b.set(bx, by, bz), width);
    this.beams.add(this.m, color, alpha);
  }

  /** Проблясък (четирилъчева звездичка) – само за този кадър. */
  glint(
    x: number,
    y: number,
    z: number,
    size: number,
    color: THREE.Color,
    alpha: number,
    roll = 0,
  ): void {
    if (!this.camera) return;
    this.q2.setFromAxisAngle(Z_AXIS, roll);
    this.q.copy(this.camera.quaternion).multiply(this.q2);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.setScalar(size));
    this.glints.add(this.m, color, alpha);
  }

  private layers(): readonly FxLayer[] {
    return this.all;
  }

  private updateRings(dt: number, camera: THREE.Camera): void {
    const pool = this.ringPool;
    for (let i = pool.n - 1; i >= 0; i--) {
      const r = pool.items[i]!;
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        pool.remove(i);
        continue;
      }
      const e = easeOut3(k);
      const sc = 10 + r.size * e;
      // „Тънък“ пръстен: по-дебел в началото, изтънява (мащаб само по едната ос не става – ползваме алфа).
      const alpha = r.alpha * (1 - k) * (r.thin ? 1 - k * 0.5 : 1);
      this.m.compose(
        this.p.set(r.x, r.y, r.z),
        r.billboard ? camera.quaternion : GROUND_Q,
        this.s.setScalar(sc),
      );
      this.rings.add(this.m, r.color, alpha);
    }
  }

  private updateFlashes(dt: number, camera: THREE.Camera): void {
    const pool = this.flashPool;
    for (let i = pool.n - 1; i >= 0; i--) {
      const f = pool.items[i]!;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        pool.remove(i);
        continue;
      }
      // Изскача рязко (с „отскок“), държи се, после се свива и избледнява.
      const pop = k < 0.16 ? easeOutBack(k / 0.16) : k < 0.55 ? 1 : 1 - (k - 0.55) * 0.6;
      const alpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      const sc = f.size * pop;
      this.q2.setFromAxisAngle(Z_AXIS, f.roll + k * 0.4);
      this.q.copy(camera.quaternion).multiply(this.q2);
      // Тъмен комикс-контур отзад (като контура на героите), после цветната звезда.
      this.m.compose(this.p.set(f.x, f.y, f.z), this.q, this.s.setScalar(sc * 1.1));
      // Контурът изчезва по-бързо – иначе полупрозрачната звезда изглежда „мръсна“.
      this.flashes.add(this.m, OUTLINE, alpha * alpha * alpha * 0.9);
      this.m.compose(this.p, this.q, this.s.setScalar(sc));
      this.flashes.add(this.m, f.color, alpha);
      // Бяло ядро отгоре (по-малко, леко завъртяно).
      this.q2.setFromAxisAngle(Z_AXIS, f.roll + 0.35 - k * 0.6);
      this.q.copy(camera.quaternion).multiply(this.q2);
      this.m.compose(this.p, this.q, this.s.setScalar(sc * 0.58));
      this.flashes.add(this.m, WHITE, alpha);
    }
  }

  private updateBubbles(dt: number): void {
    const pool = this.bubblePool;
    for (let i = pool.n - 1; i >= 0; i--) {
      const b = pool.items[i]!;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) {
        pool.remove(i);
        continue;
      }
      const grow = easeOut3(Math.min(1, k / 0.45));
      const r = b.r0 + (b.r1 - b.r0) * grow;
      const alpha = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      // Куполът е малко сплескан (по-добре се вижда отгоре), балончето – леко „трепти“.
      const wob = b.dome ? 0.8 : 1 + Math.sin(b.t * 40) * 0.03 * (1 - k);
      this.q.identity();
      this.m.compose(this.p.set(b.x, b.y, b.z), this.q, this.s.set(r, r * wob, r));
      (b.dome ? this.domes : this.bubbles).add(this.m, b.color, alpha);
    }
  }

  private updateStreaks(dt: number): void {
    const pool = this.streakPool;
    for (let i = pool.n - 1; i >= 0; i--) {
      const s = pool.items[i]!;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) {
        pool.remove(i);
        continue;
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      const len = s.len * (1 - k * 0.5);
      this.writeBeam(
        this.a.set(s.x, s.y, s.z),
        this.b.set(s.x - s.dx * len, s.y, s.z - s.dz * len),
        s.width * (1 - k * 0.6),
      );
      this.beams.add(this.m, s.color, 1 - k * k);
    }
  }

  /** Матрица на правоъгълник от A до B с ширина w, обърнат към камерата (около оста AB). */
  private writeBeam(a: THREE.Vector3, b: THREE.Vector3, w: number): void {
    const cam = this.camera!;
    const axis = this.c.subVectors(b, a);
    const len = axis.length();
    if (len < 0.001) axis.set(0.001, 0, 0);
    // Посока към камерата → страничен вектор = ос × поглед.
    this.p.copy(cam.position).sub(a);
    this.s.crossVectors(axis, this.p).normalize().multiplyScalar(w);
    this.p.crossVectors(axis, this.s).normalize();
    const e = this.m.elements;
    e[0] = axis.x;
    e[1] = axis.y;
    e[2] = axis.z;
    e[3] = 0;
    e[4] = this.s.x;
    e[5] = this.s.y;
    e[6] = this.s.z;
    e[7] = 0;
    e[8] = this.p.x;
    e[9] = this.p.y;
    e[10] = this.p.z;
    e[11] = 0;
    e[12] = a.x;
    e[13] = a.y;
    e[14] = a.z;
    e[15] = 1;
  }

  /** Временен цвят (за викащия код, без заделяне). */
  tmpColor(hex: number): THREE.Color {
    return this.col.setHex(hex);
  }
}
