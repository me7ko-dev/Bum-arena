/**
 * 3D герой („бобче“): модел + анимации, направени изцяло с код.
 *
 * Йерархия:
 *   root (позиция, посока, мащаб при гигант)
 *    ├─ shadow / meRing / magnetRing (на земята)
 *    ├─ car (кабриолет, когато кара)
 *    └─ pivot (подскачане, накланяне, сплескване, премятане)
 *        ├─ body (тяло + уши + муцунка – една геометрия)
 *        ├─ eyes ×2, smile / openMouth
 *        ├─ arms ×2 (въртят се в раменете), legs ×2 (в ханша)
 *        └─ crown, stars, ice, bubble
 *
 * Всичко се смята от Player всеки кадър – няма „анимационни клипове“.
 */
import * as THREE from 'three';
import type { Balance, Player } from '@bum/shared';
import {
  BASE_RADIUS,
  CAR_SEAT_Y,
  HEAD_TOP,
  HIP_Y,
  SHOULDER_Y,
  WHEEL_POS,
  WHEEL_Y,
  buildCarBody,
  buildCrown,
  buildStar,
  characterGeometry,
  eyeLayout,
  mouthPlace,
  wheelGeometry,
} from './builders';

// ───────────── Общи (споделени) ресурси ─────────────

let shared: {
  eyeMat: THREE.Material;
  mouthMat: THREE.Material;
  crownGeo: THREE.BufferGeometry;
  crownMat: THREE.Material;
  starGeo: THREE.BufferGeometry;
  starMat: THREE.Material;
  iceGeo: THREE.BufferGeometry;
  iceMat: THREE.Material;
  bubbleGeo: THREE.BufferGeometry;
  bubbleMat: THREE.Material;
  shadowGeo: THREE.BufferGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  ringGeo: THREE.BufferGeometry;
  meRingMat: THREE.MeshBasicMaterial;
  magnetMat: THREE.MeshBasicMaterial;
  carMat: THREE.Material;
  wheelMat: THREE.Material;
  carBodies: Map<number, THREE.BufferGeometry>;
  outlineMat: THREE.MeshBasicMaterial;
} | null = null;

/** Контур „отзад“: същото тяло, изтласкано по нормалите и рисувано от вътрешната страна. */
function outlineMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x2a1650, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normal * 1.7;',
    );
  };
  return m;
}

/** Мека кръгла сянка (текстура с радиален градиент). */
function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(20,10,40,0.55)');
  grad.addColorStop(0.6, 'rgba(20,10,40,0.3)');
  grad.addColorStop(1, 'rgba(20,10,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sharedAssets() {
  if (shared) return shared;
  shared = {
    eyeMat: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 120, specular: 0x666666 }),
    mouthMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
    crownGeo: buildCrown(),
    crownMat: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0xffe8a3, emissive: 0x553300 }),
    starGeo: buildStar(),
    starMat: new THREE.MeshPhongMaterial({ vertexColors: true, emissive: 0x996600 }),
    iceGeo: new THREE.IcosahedronGeometry(56, 1),
    iceMat: new THREE.MeshPhongMaterial({
      color: 0x9fe8ff,
      shininess: 120,
      specular: 0xffffff,
      transparent: true,
      opacity: 0.55,
      flatShading: true,
      emissive: 0x1a5a99,
    }),
    bubbleGeo: new THREE.SphereGeometry(56, 28, 18),
    bubbleMat: new THREE.MeshPhongMaterial({
      color: 0x8fd8ff,
      shininess: 140,
      specular: 0xffffff,
      transparent: true,
      opacity: 0.3,
      emissive: 0x1d5f99,
      depthWrite: false,
    }),
    shadowGeo: new THREE.CircleGeometry(30, 24).rotateX(-Math.PI / 2),
    shadowMat: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    ringGeo: new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
    meRingMat: new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }),
    magnetMat: new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.5, depthWrite: false }),
    carMat: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x555555 }),
    wheelMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
    carBodies: new Map(),
    outlineMat: outlineMaterial(),
  };
  return shared;
}

/** Модел на кола (каросерия + 4 колела). Ползва се и за паркираните коли. */
export function makeCar(kind: number): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const sh = sharedAssets();
  let bodyGeo = sh.carBodies.get(kind);
  if (!bodyGeo) {
    bodyGeo = buildCarBody(kind);
    sh.carBodies.set(kind, bodyGeo);
  }
  const group = new THREE.Group();
  // Само каросерията хвърля сянка (колелата са под нея – излишни draw calls).
  group.add(caster(new THREE.Mesh(bodyGeo, sh.carMat)));
  const wheels = WHEEL_POS.map(([x, z]) => {
    const w = new THREE.Mesh(wheelGeometry(), sh.wheelMat);
    w.position.set(x, WHEEL_Y, z);
    group.add(w);
    return w;
  });
  return { group, wheels };
}

// ───────────── Изглед на героя ─────────────

export interface CharacterContext {
  dt: number;
  time: number;
  cfg: Balance;
  hasCrown: boolean;
  /** Победителят танцува в края на рунда. */
  celebrating: boolean;
  /** Отброяване – всички махат. */
  waiting: boolean;
  /** Кръгла „петна“-сянка (ниско качество); при високо има истински сенки. По подразбиране – да. */
  blobShadow?: boolean;
}

/** Падане от арената: малък подскок нагоре, после свободно падане. */
const FALL_UP = 430;
const FALL_G = 2600;
export function fallHeight(t: number): number {
  return FALL_UP * t - 0.5 * FALL_G * t * t;
}

/** Бяло-синкав „rim“ ръб при силен удар (Phong + малка добавка във фрагментния шейдър). */
function addRim(mat: THREE.MeshPhongMaterial, rim: { value: number }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.fragmentShader =
      'uniform float uRim;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
          float rimF = 1.0 - abs(dot(normal, normalize(vViewPosition)));
          outgoingLight += vec3(1.0, 0.97, 0.9) * uRim * (0.25 + 1.6 * pow(rimF, 1.5));
        }
        #include <opaque_fragment>`,
      );
  };
}

export class CharacterView {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private bodyMat: THREE.MeshPhongMaterial;
  private eyes: THREE.Mesh[] = [];
  private smile: THREE.Mesh;
  private openMouth: THREE.Mesh;
  private arms: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private shadow: THREE.Mesh;
  private meRing: THREE.Mesh | null = null;
  private magnetRing: THREE.Mesh;
  private crown: THREE.Mesh;
  private stars: THREE.Mesh[] = [];
  private ice: THREE.Mesh;
  private bubble: THREE.Mesh;
  private car: { group: THREE.Group; wheels: THREE.Mesh[]; kind: number } | null = null;

  // Състояние на анимацията.
  private yaw: number;
  private runPhase = Math.random() * 10;
  private blinkIn = 1 + Math.random() * 3;
  private blink = 0;
  private squash = 0;
  private flash = 0;
  private hurt = 0;
  private scale = 1;
  private fallSpin = new THREE.Vector2();
  private wheelSpin = 0;
  private rim = { value: 0 };
  private wasDashing = false;
  private lastHeading = 0;
  private lastSpeed = 0;
  private turnCooldown = 0;

  /** Основният цвят на тялото (за цветната следа при падане). */
  readonly bodyColor: number;
  /** Скрит, след като е „цопнал“ във водата (виж KnockoutFx). */
  splashed = false;
  /**
   * Прах от краката в този кадър: 0 – няма, 1 – стъпка, 2 – рязък завой / приземяване.
   * World3D го чете след update() и пуска частиците.
   */
  dust = 0;

  constructor(
    readonly skin: string,
    isMe: boolean,
    facing: number,
  ) {
    const sh = sharedAssets();
    const geo = characterGeometry(skin);
    // Phong: евтин на телефон и дава „пластмасов“ отблясък като на играчка.
    this.bodyMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 45, specular: 0x3a3a3a, emissive: 0xffffff, emissiveIntensity: 0 });
    addRim(this.bodyMat, this.rim);
    this.bodyColor = geo.costume.body;

    this.shadow = new THREE.Mesh(sh.shadowGeo, sh.shadowMat);
    this.shadow.position.y = 0.6;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);

    if (isMe) {
      this.meRing = new THREE.Mesh(sh.ringGeo, sh.meRingMat);
      this.meRing.scale.setScalar(36);
      this.meRing.position.y = 0.8;
      this.root.add(this.meRing);
    }
    this.magnetRing = new THREE.Mesh(sh.ringGeo, sh.magnetMat);
    this.magnetRing.position.y = 1;
    this.magnetRing.visible = false;
    this.root.add(this.magnetRing);

    this.root.add(this.pivot);
    const body = new THREE.Mesh(geo.body, this.bodyMat);
    body.castShadow = true;
    const outline = new THREE.Mesh(geo.body, sh.outlineMat);
    this.pivot.add(outline, body);

    for (const e of eyeLayout(geo.costume)) {
      const eye = new THREE.Mesh(geo.eye, sh.eyeMat);
      eye.position.set(e.x, e.y, e.z);
      eye.rotation.y = e.ry;
      eye.scale.setScalar(e.scale);
      eye.userData.baseScale = e.scale;
      this.pivot.add(eye);
      this.eyes.push(eye);
    }
    const mp = mouthPlace(geo.costume);
    const hideMouth = geo.costume.extras.includes('beak');
    this.smile = new THREE.Mesh(geo.smile, sh.mouthMat);
    this.openMouth = new THREE.Mesh(geo.openMouth, sh.mouthMat);
    for (const m of [this.smile, this.openMouth]) {
      m.position.set(mp.x!, mp.y!, mp.z!);
      m.rotation.y = mp.ry!;
      m.visible = !hideMouth;
      this.pivot.add(m);
    }
    this.openMouth.visible = false;

    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 23.5, SHOULDER_Y, 0);
      arm.add(caster(new THREE.Mesh(geo.arm, this.bodyMat)));
      arm.userData.side = s;
      arm.rotation.z = s * 0.42; // ръцете леко встрани (поза в покой)
      this.pivot.add(arm);
      this.arms.push(arm);

      const leg = new THREE.Group();
      leg.position.set(s * 10, HIP_Y, 0);
      // Краката не хвърлят сянка: тя е под тялото (пестим draw calls в прохода за сенки).
      leg.add(new THREE.Mesh(geo.leg, this.bodyMat));
      this.pivot.add(leg);
      this.legs.push(leg);
    }

    this.crown = new THREE.Mesh(sh.crownGeo, sh.crownMat);
    this.crown.position.y = HEAD_TOP + 2;
    this.crown.visible = false;
    this.pivot.add(this.crown);

    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(sh.starGeo, sh.starMat);
      st.visible = false;
      this.pivot.add(st);
      this.stars.push(st);
    }
    this.ice = new THREE.Mesh(sh.iceGeo, sh.iceMat);
    this.ice.position.y = 48;
    this.ice.visible = false;
    this.ice.renderOrder = 3;
    this.pivot.add(this.ice);
    this.bubble = new THREE.Mesh(sh.bubbleGeo, sh.bubbleMat);
    this.bubble.position.y = 48;
    this.bubble.visible = false;
    this.bubble.renderOrder = 4;
    this.pivot.add(this.bubble);

    this.yaw = facingToYaw(facing);
    this.root.rotation.y = this.yaw;
  }

  /** Реакция при удар: сплескване, бяло премигване, „ох“ уста. */
  hit(strength: number): void {
    this.squash = Math.max(this.squash, 0.12 + strength * 0.3);
    this.flash = 0.08 + strength * 0.08;
    this.hurt = 0.35 + strength * 0.3;
    // Силен удар – ярък бял ръб около силуета.
    if (strength > 0.7) this.rim.value = 1.4;
  }

  /** Точката над главата (за името/короната), в координати на света. */
  headHeight(): number {
    const base = this.car ? CAR_SEAT_Y + HEAD_TOP * 0.82 : HEAD_TOP;
    return (base + 12) * this.scale + this.pivot.position.y + this.root.position.y;
  }

  update(p: Player, x: number, z: number, ctx: CharacterContext): void {
    const { dt, time, cfg } = ctx;
    const speed = Math.hypot(p.vx, p.vy);
    const run = Math.min(1, speed / cfg.player.maxSpeed);
    const frozen = p.frozen > 0;
    const stunned = p.stun > 0;
    const dashing = p.ability === 'dash' && p.abilityTime > 0 && !p.inCar;
    this.root.position.set(x, 0, z);

    // ── Мащаб (гигант / размер) ──
    const targetScale = p.inCar ? 1 : p.radius / BASE_RADIUS;
    this.scale += (targetScale - this.scale) * Math.min(1, dt * 8);

    // ── Кола ──
    this.updateCar(p, speed, dt);

    // ── Посока ──
    if (!frozen && p.alive) {
      if (speed > 25) this.yaw = lerpAngle(this.yaw, Math.atan2(p.vx, p.vy), Math.min(1, dt * (dashing ? 30 : 12)));
      else if (!ctx.celebrating) this.yaw = lerpAngle(this.yaw, facingToYaw(p.facing), Math.min(1, dt * 6));
    }
    if (ctx.celebrating) this.yaw += dt * 5;
    this.root.rotation.y = this.yaw;

    // ── Таймери ──
    this.dust = 0;
    const prevPhase = this.runPhase;
    if (!frozen) this.runPhase += dt * (5 + 12 * run);
    this.updateDust(p, speed, run, dashing, prevPhase, dt);
    this.squash *= Math.exp(-dt * 9);
    this.hurt = Math.max(0, this.hurt - dt);
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.12;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);

    // ── Тяло ──
    const pv = this.pivot;
    const seatY = this.car ? CAR_SEAT_Y - HIP_Y + 2 : 0;
    let bob = Math.abs(Math.sin(this.runPhase)) * 5 * run + Math.sin(time * 2.2 + this.runPhase) * 0.6;
    let lean = run * 0.22;
    let wobble = 0;
    if (dashing) lean = 0.55;
    if (stunned) wobble = Math.sin(time * 13) * 0.22;
    if (ctx.celebrating) bob = Math.abs(Math.sin(time * 7)) * 26;
    if (this.car) {
      bob = Math.sin(time * 20) * 0.5 * run;
      lean = 0;
    }
    pv.position.y = seatY + bob;
    const sq = this.squash * Math.cos(time * 30);
    const stretch = dashing ? 0.12 : 0;
    pv.scale.set(this.scale * (1 + sq - stretch * 0.5), this.scale * (1 - sq), this.scale * (1 + sq + stretch));

    if (!p.alive) {
      // Падане: премятане и свободно падане надолу.
      if (this.fallSpin.lengthSq() === 0) this.fallSpin.set(6 + Math.random() * 4, (Math.random() - 0.5) * 8);
      pv.rotation.x += this.fallSpin.x * dt;
      pv.rotation.z += this.fallSpin.y * dt;
      this.root.position.y = fallHeight(p.fallTime);
      this.shadow.visible = false;
      if (this.meRing) this.meRing.visible = false;
      this.root.visible = p.fallTime < 2.2 && !this.splashed;
    } else {
      this.fallSpin.set(0, 0);
      this.splashed = false;
      pv.rotation.set(lean, 0, wobble);
      this.shadow.visible = ctx.blobShadow ?? true;
      this.shadow.scale.setScalar(this.car ? 1.9 : this.scale * (1 - bob / 90));
      if (this.meRing) {
        this.meRing.visible = true;
        this.meRing.scale.setScalar((this.car ? 62 : 36 * this.scale) + Math.sin(time * 5) * 1.5);
      }
      this.root.visible = true;
    }

    // ── Крайници ──
    const swing = Math.sin(this.runPhase);
    for (const [i, leg] of this.legs.entries()) {
      const s = i === 0 ? 1 : -1;
      leg.visible = !this.car;
      leg.rotation.x = frozen ? leg.rotation.x : swing * s * 0.95 * run;
      if (!p.alive) leg.rotation.x = Math.sin(time * 25 + i) * 0.9;
    }
    for (const [i, arm] of this.arms.entries()) {
      const side = arm.userData.side as number;
      const s = i === 0 ? -1 : 1;
      if (frozen) continue;
      let rx = swing * s * 0.85 * run;
      let rz = side * (0.42 + run * 0.15);
      if (dashing) {
        rx = 1.3;
        rz = side * 0.35;
      } else if (this.car) {
        rx = -1.25;
        rz = side * 0.25;
      } else if (!p.alive || stunned) {
        rx = Math.sin(time * 22 + i * 2) * 0.6;
        rz = side * (2.2 + Math.sin(time * 18 + i) * 0.4);
      } else if (ctx.celebrating) {
        rz = side * (2.6 + Math.sin(time * 14 + i * Math.PI) * 0.35);
        rx = 0;
      } else if (ctx.waiting && i === 1) {
        rz = side * (2.5 + Math.sin(time * 9) * 0.35);
      }
      arm.rotation.x = rx;
      arm.rotation.z = rz;
    }

    // ── Лице ──
    const surprised = !p.alive || stunned || this.hurt > 0 || dashing || frozen;
    if (this.smile.visible || this.openMouth.visible) {
      this.smile.visible = !surprised;
      this.openMouth.visible = surprised;
    }
    for (const eye of this.eyes) {
      const base = eye.userData.baseScale as number;
      const wide = !p.alive ? 1.25 : 1;
      eye.scale.set(base * wide, base * wide * (this.blink > 0 && p.alive && !stunned ? 0.12 : 1), base * wide);
      eye.rotation.z = stunned ? time * 9 : 0;
    }

    // ── Бял ръб при силен удар ──
    if (this.rim.value > 0) this.rim.value = Math.max(0, this.rim.value - dt * 5);

    // ── Премигване при удар ──
    if (this.flash > 0) {
      this.flash -= dt;
      this.bodyMat.emissiveIntensity = Math.max(0, this.flash * 8);
    } else if (this.bodyMat.emissiveIntensity !== 0) {
      this.bodyMat.emissiveIntensity = 0;
    }

    // ── Ефекти ──
    this.ice.visible = frozen;
    if (frozen) this.ice.rotation.y = 0.3;
    this.bubble.visible = p.immune && p.alive;
    if (this.bubble.visible) this.bubble.scale.setScalar(1 + Math.sin(time * 8) * 0.04);

    this.crown.visible = ctx.hasCrown && p.alive;
    if (this.crown.visible) {
      this.crown.position.y = HEAD_TOP + 3 + Math.sin(time * 4) * 2;
      this.crown.rotation.y = time * 1.5;
    }
    for (const [i, st] of this.stars.entries()) {
      st.visible = stunned && p.alive;
      if (!st.visible) continue;
      const a = time * 6 + (i * Math.PI * 2) / 3;
      st.position.set(Math.cos(a) * 22, HEAD_TOP + 10 + Math.sin(a * 2) * 3, Math.sin(a) * 22);
      st.rotation.set(0.3, -a, 0);
    }

    const magnet = p.ability === 'magnet' && p.abilityTime > 0 && p.alive && !p.inCar;
    this.magnetRing.visible = magnet;
    if (magnet) {
      const ph = (time * 1.6) % 1;
      this.magnetRing.scale.setScalar(cfg.abilities.magnet.radius * (1 - ph) + 30);
      (this.magnetRing.material as THREE.MeshBasicMaterial).opacity = 0.6 * ph;
    }
  }

  /**
   * Прах от краката: при всяко стъпване на бягане (по-бързо → по-често),
   * при рязък завой и при „приземяване“ след дъш (+ сплескване).
   */
  private updateDust(p: Player, speed: number, run: number, dashing: boolean, prevPhase: number, dt: number): void {
    this.turnCooldown = Math.max(0, this.turnCooldown - dt);
    const grounded = p.alive && !this.car && p.frozen <= 0;
    if (this.wasDashing && !dashing && grounded) {
      this.squash = Math.max(this.squash, 0.22);
      this.dust = 2;
    }
    this.wasDashing = dashing;
    if (!grounded) return;
    // Стъпка: |sin(фаза)| минава през 0 на всеки π.
    if (run > 0.45 && Math.floor(this.runPhase / Math.PI) !== Math.floor(prevPhase / Math.PI)) this.dust = Math.max(this.dust, 1);
    // Рязък завой (посоката на скоростта се върти бързо при голяма скорост).
    const heading = Math.atan2(p.vx, p.vy);
    let d = heading - this.lastHeading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.lastHeading = heading;
    const fast = speed > 150 && this.lastSpeed > 150;
    this.lastSpeed = speed;
    if (fast) {
      if (Math.abs(d) / Math.max(dt, 1e-3) > 9 && this.turnCooldown <= 0 && !dashing) {
        this.squash = Math.max(this.squash, 0.14);
        this.dust = 2;
        this.turnCooldown = 0.3;
      }
    }
  }

  private updateCar(p: Player, speed: number, dt: number): void {
    const want = p.inCar && p.alive;
    if (want && (!this.car || this.car.kind !== p.carKind)) {
      if (this.car) this.root.remove(this.car.group);
      const c = makeCar(p.carKind);
      this.car = { ...c, kind: p.carKind };
      this.root.add(c.group);
    }
    if (!want && this.car) {
      this.root.remove(this.car.group);
      this.car = null;
    }
    if (this.car) {
      this.wheelSpin += (speed * dt) / 13;
      for (const w of this.car.wheels) w.rotation.x = this.wheelSpin;
    }
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.root.removeFromParent();
  }
}

/** Меш, който хвърля истинска сянка (при високо качество). */
function caster(m: THREE.Mesh): THREE.Mesh {
  m.castShadow = true;
  return m;
}

/** Посоката в симулацията (atan2(y, x)) → завъртане около Y в Three.js (напред е +z). */
function facingToYaw(facing: number): number {
  return Math.atan2(Math.cos(facing), Math.sin(facing));
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
