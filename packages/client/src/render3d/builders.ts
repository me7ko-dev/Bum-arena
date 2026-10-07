/**
 * Сглобяване на 3D модели от прости форми (без външни файлове).
 *
 * Всеки модел се прави от няколко примитива (капсула, сфера, конус …), оцветени
 * с „vertex colors“ и слети в една геометрия → малко draw calls = бързо на телефон.
 * Мерни единици: единици на света (радиусът на човечето е 28).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { costumeFor, type Costume } from './costumes';

type Painter = (x: number, y: number, z: number) => number;

interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const tmpColor = new THREE.Color();

/** Оцветява геометрията (цвят или функция от локалните координати). */
function paint(geo: THREE.BufferGeometry, color: number | Painter): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = typeof color === 'number' ? color : color(pos.getX(i), pos.getY(i), pos.getZ(i));
    tmpColor.setHex(c, THREE.SRGBColorSpace);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Мести/върти/мащабира геометрията (прилага матрица върху върховете). */
function place(geo: THREE.BufferGeometry, p: Place): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'XYZ')),
    new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1),
  );
  geo.applyMatrix4(m);
  return geo;
}

/** Слива части в една геометрия (всички трябва да имат position/normal/uv/color). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Някои примитиви (RoundedBox) са без индекс – тогава всички стават без индекс.
  const mixed = parts.some((g) => !g.index);
  const list = mixed ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts;
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error('mergeGeometries failed');
  parts.forEach((g) => g.dispose());
  list.forEach((g) => g.dispose());
  return merged;
}

const sphere = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, len: number, cap = 6, radial = 14) => new THREE.CapsuleGeometry(r, len, cap, radial, 1);
const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const cylinder = (r1: number, r2: number, h: number, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);

// ───────────────────────── Размери на героя ─────────────────────────

/** Радиус на човечето в симулацията, за който е направен моделът. */
export const BASE_RADIUS = 28;
const BODY_R = 24;
const BODY_LEN = 21;
const BODY_BOTTOM = 13;
const BODY_TOP = BODY_BOTTOM + BODY_R * 2 + BODY_LEN; // 73
const LOWER_CAP_Y = BODY_BOTTOM + BODY_R; // 34
const UPPER_CAP_Y = LOWER_CAP_Y + BODY_LEN; // 49
/** Височина на главата (за етикета с името и короната). */
export const HEAD_TOP = BODY_TOP;
export const HIP_Y = 17;
export const SHOULDER_Y = 44;

/**
 * Детайлите на лицето/ушите са проектирани за по-ниско тяло (връх на 73, капачки на 34 и 49).
 * hy() пренася такава височина към сегашното тяло, invHy() – обратно (за шарките).
 */
function hy(y: number): number {
  if (y <= 34) return y + (LOWER_CAP_Y - 34);
  if (y >= 49) return y + (UPPER_CAP_Y - 49);
  return LOWER_CAP_Y + ((y - 34) * BODY_LEN) / 15;
}
function invHy(y: number): number {
  if (y <= LOWER_CAP_Y) return y - (LOWER_CAP_Y - 34);
  if (y >= UPPER_CAP_Y) return y - (UPPER_CAP_Y - 49);
  return 34 + ((y - LOWER_CAP_Y) * 15) / BODY_LEN;
}

/** Крушовидна форма: малко по-широко отдолу. */
function pearK(y: number): number {
  const t = THREE.MathUtils.clamp((y - BODY_BOTTOM) / (BODY_TOP - BODY_BOTTOM), 0, 1);
  return 1 + 0.1 * (1 - t) - 0.04 * t;
}

/** Радиус на тялото на височина y (капсула × крушовидност). */
function radiusAt(y: number): number {
  let r: number;
  if (y < LOWER_CAP_Y) r = Math.sqrt(Math.max(0, BODY_R ** 2 - (LOWER_CAP_Y - y) ** 2));
  else if (y > UPPER_CAP_Y) r = Math.sqrt(Math.max(0, BODY_R ** 2 - (y - UPPER_CAP_Y) ** 2));
  else r = BODY_R;
  return r * pearK(y);
}

/** Точка върху повърхността на тялото: височина y, ъгъл θ от „напред“ (+z). */
function onSurface(y: number, theta: number, inset = 0): Place {
  const r = radiusAt(y) - inset;
  return { x: Math.sin(theta) * r, y, z: Math.cos(theta) * r, ry: theta };
}

// ───────────────────────── Тяло ─────────────────────────

function bodyPainter(c: Costume): Painter {
  const spots: [number, number, number, number][] = [
    [15, 56, -12, 10],
    [-17, 30, -9, 11],
    [2, 65, -17, 8],
    [20, 22, 10, 7],
    [-12, 60, -18, 7],
  ];
  return (x, yNow, z) => {
    const y = invHy(yNow);
    const front = z > 0;
    switch (c.pattern) {
      case 'belly':
        if (front && (x / 17) ** 2 + ((y - 29) / 18) ** 2 < 1) return c.accent;
        return c.body;
      case 'tuxedo':
        if (z > -3 && (x / 19) ** 2 + ((y - 36) / 27) ** 2 < 1) return c.accent;
        return c.body;
      case 'face':
        if (front && z > 9 && (x / 16) ** 2 + ((y - 44) / 13.5) ** 2 < 1) return c.accent;
        if (front && (x / 15) ** 2 + ((y - 24) / 12) ** 2 < 1) return c.accent;
        return c.body;
      case 'stripes': {
        const faceArea = front && z > 12 && Math.abs(x) < 15 && y > 30 && y < 60;
        const s = Math.sin(y * 0.42 + Math.abs(x) * 0.06);
        if (!faceArea && s > 0.62 && (z < 9 || y > 62)) return c.accent;
        if (front && (x / 15) ** 2 + ((y - 27) / 15) ** 2 < 1) return 0xfff4e6;
        return c.body;
      }
      case 'spots':
        for (const [sx, sy, sz, r] of spots) {
          if ((x - sx) ** 2 + (y - sy) ** 2 + (z - sz) ** 2 < r * r) return c.accent;
        }
        return c.body;
      default:
        return c.body;
    }
  };
}

/** Тяло + уши + муцунка + екстри – една геометрия. */
function buildBody(c: Costume): THREE.BufferGeometry {
  const body = capsule(BODY_R, BODY_LEN, 12, 28);
  body.translate(0, BODY_BOTTOM + BODY_R + BODY_LEN / 2, 0);
  const pos = body.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const k = pearK(pos.getY(i));
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  body.computeVertexNormals();
  paint(body, bodyPainter(c));

  const parts: THREE.BufferGeometry[] = [body];
  const earColor = c.earColor ?? c.body;
  const inner = c.earInner ?? earColor;

  for (const s of [-1, 1]) {
    switch (c.ears) {
      case 'pointy':
        parts.push(place(paint(cone(8.5, 17), (_x, y) => (y > 3 ? inner : earColor)), { x: s * 12, y: hy(75), z: -1, rz: -s * 0.32, rx: -0.1 }));
        break;
      case 'small':
        parts.push(place(paint(cone(6.8, 11), (_x, _y, z) => (z > 1.5 ? inner : earColor)), { x: s * 11.5, y: hy(73), z: 0, rz: -s * 0.3 }));
        break;
      case 'round':
        parts.push(
          place(paint(sphere(8.5), (x, y, z) => (z > 2 && x * x + y * y < 30 ? inner : earColor)), { x: s * 15, y: hy(69), z: -2, rz: -s * 0.45, sz: 0.55 }),
        );
        break;
      case 'long':
        parts.push(place(paint(capsule(5.2, 20), (x, _y, z) => (z > 2.5 && Math.abs(x) < 3 ? inner : earColor)), { x: s * 7.5, y: hy(87), z: -3, rz: -s * 0.15, rx: -0.15 }));
        break;
      case 'floppy':
        parts.push(place(paint(capsule(6.5, 14), earColor), { x: s * 24, y: hy(58), z: -1, rz: s * 0.35, sz: 0.7 }));
        break;
      case 'mouse':
        parts.push(
          place(paint(sphere(13, 20, 14), (x, y, z) => (z > 4 && x * x + y * y < 64 ? inner : earColor)), { x: s * 17, y: hy(71), z: -3, rz: -s * 0.35, sz: 0.35 }),
        );
        break;
      case 'side':
        parts.push(
          place(paint(sphere(7.5), (x, y, z) => (z > 2 && x * x + y * y < 22 ? inner : earColor)), { x: s * 25, y: hy(50), z: -1, ry: s * 1.4, sy: 0.85, sz: 0.45 }),
        );
        break;
      default:
        break;
    }
  }

  const dark = 0x2b1d1a;
  for (const e of c.extras) {
    switch (e) {
      case 'snoutBear':
        parts.push(place(paint(sphere(9), c.accent), { ...onSurface(hy(39), 0, 4), sx: 1.1, sy: 0.8, sz: 0.6 }));
        parts.push(place(paint(sphere(3), dark), { ...onSurface(hy(43), 0, -2.5), sx: 1.3, sz: 0.8 }));
        break;
      case 'snoutPig':
        parts.push(place(paint(cylinder(7, 7, 5), 0xff8fb0), { ...onSurface(hy(41), 0, -1), rx: Math.PI / 2 }));
        for (const s of [-1, 1]) parts.push(place(paint(sphere(1.6), 0xc2255c), { x: s * 2.6, y: hy(41), z: radiusAt(hy(41)) + 3.6 }));
        break;
      case 'snoutCow':
        parts.push(place(paint(sphere(10), 0xffc2d4), { ...onSurface(hy(36), 0, 4), sx: 1.25, sy: 0.75, sz: 0.55 }));
        for (const s of [-1, 1]) parts.push(place(paint(sphere(1.8), 0xc2255c), { x: s * 3.6, y: hy(36), z: radiusAt(hy(36)) + 1.4 }));
        break;
      case 'beak':
        parts.push(place(paint(cone(5, 10, 10), 0xffa94d), { x: 0, y: hy(42), z: radiusAt(hy(42)) + 3.5, rx: Math.PI / 2 }));
        break;
      case 'comb':
        for (const [y, z, r] of [
          [76, 4, 5],
          [79.5, -2, 5.5],
          [76, -8, 4.5],
        ] as const)
          parts.push(place(paint(sphere(r), 0xff4d4d), { y: hy(y), z }));
        break;
      case 'unicornHorn':
        parts.push(place(paint(cone(4, 18, 10), (_x, y) => (Math.sin(y * 1.4) > 0 ? 0xffd43b : 0xfff3bf)), { y: hy(81), z: 8, rx: 0.35 }));
        break;
      case 'unicornMane':
        [
          [74, -7, 7, 0xff8fd0],
          [70, -14, 7, 0xb197fc],
          [63, -20, 6.5, 0x74c0fc],
          [55, -23, 6, 0x8ce99a],
          [46, -25, 5.5, 0xffd43b],
        ].forEach(([y, z, r, col]) => parts.push(place(paint(sphere(r!), col!), { y: hy(y!), z })));
        break;
      case 'dragonHorns':
        for (const s of [-1, 1]) parts.push(place(paint(cone(3.6, 13, 10), 0xffe066), { x: s * 9, y: hy(76), z: -4, rx: -0.6, rz: -s * 0.25 }));
        break;
      case 'dragonSpikes':
        for (const y of [66, 56, 46, 36].map(hy)) {
          const z = -radiusAt(y) - 1;
          parts.push(place(paint(cone(4, 10, 8), 0xffd43b), { y, z, rx: -Math.PI / 2 - 0.25 }));
        }
        break;
      case 'cowHorns':
        for (const s of [-1, 1]) parts.push(place(paint(cone(2.6, 9, 8), 0xfff3bf), { x: s * 13, y: hy(74), z: -1, rz: -s * 1.0 }));
        break;
      case 'lionMane':
        parts.push(place(paint(new THREE.TorusGeometry(24, 8, 10, 28), 0xd9822b), { y: hy(45), z: 5, sz: 0.7 }));
        break;
      case 'pandaPatches':
        for (const s of [-1, 1]) parts.push(place(paint(sphere(7.5), 0x22202a), { ...onSurface(hy(50), s * 0.4, 2.5), rz: s * 0.5, sx: 0.85, sy: 1.15, sz: 0.4 }));
        break;
      case 'koalaNose':
        parts.push(place(paint(sphere(5.5), 0x343a40), { ...onSurface(hy(43), 0, 1.5), sx: 0.95, sy: 0.85, sz: 0.65 }));
        break;
      case 'whiskers':
        for (const s of [-1, 1])
          for (const dy of [-2.5, 1.5]) {
            parts.push(place(paint(cylinder(0.55, 0.55, 12, 5), 0x3b2418), { x: s * 17, y: hy(40) + dy, z: 20.5, rz: Math.PI / 2 + s * dy * 0.06, ry: s * 0.5 }));
          }
        break;
      case 'cheeks':
        for (const s of [-1, 1]) parts.push(place(paint(sphere(4.2, 12, 8), 0xff8fab), { ...onSurface(hy(41.5), s * 0.62, 0.8), sz: 0.3 }));
        break;
      case 'tongue':
        parts.push(place(paint(sphere(3.4, 12, 8), 0xff6b8b), { ...onSurface(hy(35.5), 0, 0.5), sy: 0.65, sz: 0.5 }));
        break;
    }
  }
  return merge(parts);
}

// ───────────────────────── Очи, уста, крайници ─────────────────────────

export interface EyeLayout {
  x: number;
  y: number;
  z: number;
  ry: number;
  scale: number;
}

export function eyeLayout(c: Costume): EyeLayout[] {
  if (c.bigEyes) {
    return [-1, 1].map((s) => ({ x: s * 11, y: hy(69), z: 10, ry: s * 0.35, scale: 1.55 }));
  }
  return [-1, 1].map((s) => {
    const p = onSurface(hy(52), s * 0.38, 1.6);
    return { x: p.x!, y: p.y!, z: p.z!, ry: p.ry!, scale: 1.2 };
  });
}

/** Око: бяло + зеница + отблясък (една геометрия). */
function buildEye(): THREE.BufferGeometry {
  const white = place(paint(sphere(7.2, 18, 14), 0xffffff), { sy: 1.2, sz: 0.6 });
  const pupil = place(paint(sphere(4, 14, 10), 0x1b1426), { y: -0.6, z: 3.3, sz: 0.5 });
  const shine = place(paint(sphere(1.5, 8, 6), 0xffffff), { x: 1.4, y: 1.4, z: 5.1 });
  return merge([white, pupil, shine]);
}

/** Мястото на устата (по-ниско, ако има муцунка). */
export function mouthPlace(c: Costume): Place {
  const hasSnout = c.extras.some((e) => e === 'snoutBear' || e === 'snoutPig' || e === 'snoutCow' || e === 'koalaNose');
  const y = hy(hasSnout ? 34 : 39.5);
  return onSurface(y, 0, -0.3);
}

function buildSmile(): THREE.BufferGeometry {
  return place(paint(new THREE.TorusGeometry(4.2, 1.25, 8, 18, Math.PI), 0x3b1d2a), { rz: Math.PI, sz: 0.6 });
}

function buildOpenMouth(): THREE.BufferGeometry {
  const hole = place(paint(sphere(4.6, 14, 10), 0x5c1a2b), { sy: 1.15, sz: 0.4 });
  const tongue = place(paint(sphere(2.6, 10, 8), 0xff6b8b), { y: -2.4, z: 0.9, sz: 0.4 });
  return merge([hole, tongue]);
}

/** Ръка (центърът на въртене е в рамото). */
function buildArm(c: Costume): THREE.BufferGeometry {
  const arm = place(paint(capsule(5, 8, 5, 12), c.body), { y: -6.5 });
  const hand = place(paint(sphere(6, 12, 10), c.body), { y: -14 });
  return merge([arm, hand]);
}

/** Крак с обувка (центърът на въртене е в ханша). */
function buildLeg(c: Costume): THREE.BufferGeometry {
  const leg = place(paint(capsule(6.2, 4, 5, 12), c.body), { y: -4.5 });
  const shoe = place(paint(sphere(7.5, 14, 10), (_x, y) => (y < -2.5 ? 0xffffff : c.shoes)), { y: -9.6, z: 2.6, sy: 0.62, sz: 1.35 });
  return merge([leg, shoe]);
}

export interface CharacterGeometry {
  costume: Costume;
  body: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  smile: THREE.BufferGeometry;
  openMouth: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
}

const charCache = new Map<string, CharacterGeometry>();

/** Геометрията на скина (кешира се – 12 еднакви героя ползват едни и същи данни). */
export function characterGeometry(skin: string): CharacterGeometry {
  let g = charCache.get(skin);
  if (!g) {
    const costume = costumeFor(skin);
    g = {
      costume,
      body: buildBody(costume),
      eye: sharedEye(),
      smile: sharedSmile(),
      openMouth: sharedOpenMouth(),
      arm: buildArm(costume),
      leg: buildLeg(costume),
    };
    charCache.set(skin, g);
  }
  return g;
}

let eyeGeo: THREE.BufferGeometry | null = null;
let smileGeo: THREE.BufferGeometry | null = null;
let openGeo: THREE.BufferGeometry | null = null;
const sharedEye = () => (eyeGeo ??= buildEye());
const sharedSmile = () => (smileGeo ??= buildSmile());
const sharedOpenMouth = () => (openGeo ??= buildOpenMouth());

// ───────────────────────── Аксесоари ─────────────────────────

/** Корона: пръстен със зъбци и камъчета. */
export function buildCrown(): THREE.BufferGeometry {
  const gold = 0xffc61a;
  const parts: THREE.BufferGeometry[] = [paint(cylinder(12, 11, 8, 20), gold)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(place(paint(cone(3.4, 9, 6), gold), { x: Math.sin(a) * 10.5, y: 8, z: Math.cos(a) * 10.5 }));
    parts.push(place(paint(sphere(1.8, 8, 6), i % 2 ? 0xff3b6b : 0x4dabf7), { x: Math.sin(a) * 11.6, y: 0, z: Math.cos(a) * 11.6 }));
  }
  return merge(parts);
}

/** Звездичка (за замайване). */
export function buildStar(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6 : 2.6;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1 });
  g.center();
  return paint(g, 0xffd43b);
}

// ───────────────────────── Коли ─────────────────────────

/** Цветове на колите по вид (Car.kind / Player.carKind). */
const CAR_STYLES = [
  { main: 0xff3b47, trim: 0xffffff }, // червена
  { main: 0xffd43b, trim: 0x22202a }, // такси
  { main: 0x3b82f6, trim: 0xffffff }, // джип
  { main: 0xf8f9fa, trim: 0x22202a }, // полиция
  { main: 0x22c55e, trim: 0xffffff }, // състезателна
] as const;

/** Каросерия на играчка-кабриолет (без колелата). Гледа към +z. */
export function buildCarBody(kind: number): THREE.BufferGeometry {
  const st = CAR_STYLES[kind % CAR_STYLES.length]!;
  const isPolice = kind % 5 === 3;
  const isTaxi = kind % 5 === 1;
  const isRace = kind % 5 === 4;
  const isSuv = kind % 5 === 2;
  const h = isSuv ? 1.15 : isRace ? 0.85 : 1;

  const body = new RoundedBoxGeometry(70, 24 * h, 100, 3, 9);
  // Полицията: черни врати; таксито: черно-бели квадратчета по средата.
  paint(body, (x, y, z) => {
    if (isPolice && Math.abs(z) < 26 && y < 6) return 0x22202a;
    if (isTaxi && Math.abs(y) < 3 && Math.abs(x) > 33 && Math.floor(z / 6) % 2 === 0) return 0x22202a;
    if (isRace && Math.abs(x) < 7) return 0xffffff;
    return st.main;
  });
  body.translate(0, 22 * h, 0);
  const parts: THREE.BufferGeometry[] = [body];
  // Седалка/вътрешност (кабриолет – героят се вижда отгоре).
  parts.push(place(paint(new RoundedBoxGeometry(54, 6, 44, 2, 3), 0x3d3552), { y: 34 * h, z: -8 }));
  // Предно стъкло.
  parts.push(place(paint(new RoundedBoxGeometry(60, 16, 3, 2, 1.4), 0xb8f0ff), { y: 42 * h, z: 18, rx: -0.4 }));
  // Броните.
  for (const s of [-1, 1]) parts.push(place(paint(new RoundedBoxGeometry(74, 8, 7, 2, 3), 0xd0d4dc), { y: 13, z: s * 50 }));
  // Фарове и стопове.
  for (const s of [-1, 1]) {
    parts.push(place(paint(sphere(5, 10, 8), 0xfff9db), { x: s * 22, y: 26 * h, z: 49, sz: 0.5 }));
    parts.push(place(paint(sphere(4.2, 10, 8), 0xff4d4d), { x: s * 24, y: 26 * h, z: -49.5, sz: 0.5 }));
  }
  if (isPolice) {
    parts.push(place(paint(new RoundedBoxGeometry(12, 6, 8, 2, 2), 0xff2d55), { x: -8, y: 53, z: 18 }));
    parts.push(place(paint(new RoundedBoxGeometry(12, 6, 8, 2, 2), 0x2d7dff), { x: 8, y: 53, z: 18 }));
  }
  if (isTaxi) parts.push(place(paint(new RoundedBoxGeometry(22, 8, 8, 2, 2), 0xffe066), { y: 54, z: 18 }));
  if (isRace) {
    parts.push(place(paint(new RoundedBoxGeometry(76, 3, 14, 1, 1.4), st.main), { y: 48, z: -44 }));
    for (const s of [-1, 1]) parts.push(place(paint(new RoundedBoxGeometry(4, 14, 4, 1, 1), 0x22202a), { x: s * 22, y: 40, z: -44 }));
  }
  return merge(parts);
}

let wheelGeo: THREE.BufferGeometry | null = null;
/** Колело (гума + джанта), оста е по X. */
export function wheelGeometry(): THREE.BufferGeometry {
  if (!wheelGeo) {
    const tire = place(paint(cylinder(13, 13, 10, 18), 0x26232f), { rz: Math.PI / 2 });
    const hub = place(paint(cylinder(6.5, 6.5, 11, 12), 0xdee2e6), { rz: Math.PI / 2 });
    wheelGeo = merge([tire, hub]);
  }
  return wheelGeo;
}

/** Позиции на колелата на колата. */
export const WHEEL_POS: readonly [number, number][] = [
  [-36, 34],
  [36, 34],
  [-36, -32],
  [36, -32],
];
export const WHEEL_Y = 13;
/** Височина на седалката (героят сяда тук). */
export const CAR_SEAT_Y = 26;
