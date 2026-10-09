/**
 * Подиум за победителите в края на рунда.
 *
 * Малко след края камерата прелита до летящ подиум над центъра на арената:
 * три цветни стъпала (1, 2, 3), лъчи от прожектори, слънце зад победителя и конфети.
 * Героите са ОТДЕЛНИ CharacterView (живият свят не се пипа): победителят скача
 * и танцува с короната, вторият ръкопляска, третият маха.
 *
 * Всичко създадено тук се освобождава в dispose() (вика се при рестарт на сцената).
 */
import * as THREE from 'three';
import type { Balance, Player, World } from '@bum/shared';
import { standings } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { resultsLayout } from '../ui/resultsLayout';
import { CharacterView } from './Character';
import type { World3D } from './World3D';

/** След колко секунди от края на рунда камерата тръгва към подиума. */
const START_DELAY = 1.0;
/** Колко трае прелитането на камерата (сек). */
const FLY_TIME = 1.7;
/** Височина на подиума над арената. */
const PODIUM_Y = 520;

/** Стъпалата: място → отместване по x, височина, цвят. */
const STEPS: Record<1 | 2 | 3, { x: number; h: number; color: number; top: number }> = {
  1: { x: 0, h: 118, color: 0xffc928, top: 0xffe58a },
  2: { x: -122, h: 84, color: 0x4dabf7, top: 0xa5d8ff },
  3: { x: 122, h: 58, color: 0xff8a5c, top: 0xffc2a8 },
};
const BLOCK_W = 112;
const DAIS_R = 236;

/** Кога (сек от началото на подиума) пада всеки герой – третият първи, победителят последен. */
const DROP_AT: Record<1 | 2 | 3, number> = { 3: 1.25, 2: 1.5, 1: 1.85 };
const DROP_FROM = 520;
const GRAVITY = 2600;

const CONFETTI_COLORS = [0xff5d73, 0xffd23f, 0x4dabf7, 0x8ce99a, 0xb197fc, 0xff922b, 0x66d9e8, 0xffffff];

interface Spot {
  place: 1 | 2 | 3;
  player: Player;
  view: CharacterView;
  arms: THREE.Object3D[];
  /** Фалшив играч за анимацията (жив, без суперсили, обърнат към камерата). */
  pose: Player;
  y: number;
  vy: number;
  landed: boolean;
  dropped: boolean;
}

/** Етикет над героя на подиума (HUD-ът го рисува). */
export interface PodiumLabel {
  place: 1 | 2 | 3;
  name: string;
  playerId: number;
  /** Точка над главата в координати на света. */
  x: number;
  y: number;
  z: number;
}

export class Podium {
  private group = new THREE.Group();
  private stage = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private spots: Spot[] = [];
  private beams: THREE.Group[] = [];
  private sun: THREE.Mesh | null = null;
  private confetti: Confetti;
  private started = false;
  private endedFor = 0;
  /** Секунди от началото на подиума. */
  private t = 0;
  private nextConfetti = 0;
  private cfg: Balance | null = null;

  // Камера
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private flyReady = false;
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private tmpCam = new THREE.PerspectiveCamera();

  constructor(
    private world3d: World3D,
    /** Размерът на екрана в CSS пиксели (за да остане подиумът извън панела). */
    private viewport: () => { width: number; height: number },
  ) {
    this.group.position.set(0, PODIUM_Y, 0);
    this.group.visible = false;
    this.group.add(this.stage);
    this.confetti = new Confetti(this.group);
    this.disposables.push(this.confetti);
    world3d.scene.add(this.group);
  }

  /** Подиумът е започнал (камерата е негова). */
  get active(): boolean {
    return this.started;
  }

  /** Камерата е стигнала и героите са кацнали – време за надписите. */
  get showLabels(): boolean {
    return this.started && this.t > DROP_AT[1] + 0.35;
  }

  /** Вика се всеки кадър преди рисуването. */
  update(dt: number, world: World): void {
    if (world.round.phase !== 'ended') return;
    this.cfg = world.cfg;
    if (!this.started) {
      this.endedFor += dt;
      if (this.endedFor < START_DELAY) return;
      this.start(world);
    }
    this.t += dt;
    this.animateStage(dt);
    this.animateSpots(dt);
    this.confetti.update(dt);
    if (this.t >= this.nextConfetti && this.t > DROP_AT[1] + 0.1) {
      const first = this.nextConfetti === 0;
      this.burstConfetti(first ? 1 : 0.45);
      if (first) sfx.confetti(0.55);
      this.nextConfetti = (first ? this.t : this.nextConfetti) + 2.4;
    }
  }

  /** Надписите над героите (в координати на света). */
  labels(): PodiumLabel[] {
    return this.spots.map((s) => ({
      place: s.place,
      name: s.player.name,
      playerId: s.player.id,
      x: this.group.position.x + STEPS[s.place].x,
      y: this.group.position.y + this.stage.position.y + s.view.headHeight() + 14,
      z: this.group.position.z,
    }));
  }

  // ───────────── Построяване ─────────────

  private start(world: World): void {
    this.started = true;
    this.group.visible = true;
    this.buildStage();
    const top = standings(world).slice(0, 3);
    top.forEach((p, i) => this.addSpot(p, (i + 1) as 1 | 2 | 3));
    this.stage.scale.setScalar(0.001);
    sfx.whoosh(FLY_TIME, 0.25);
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private buildStage(): void {
    const s = this.stage;
    // Кръгъл подиум („остров“) – кремав диск с цветна ивица и конус отдолу.
    const daisMat = this.track(new THREE.MeshPhongMaterial({ color: 0xfff6e0, shininess: 40 }));
    const dais = new THREE.Mesh(this.track(new THREE.CylinderGeometry(DAIS_R, DAIS_R - 6, 26, 48)), daisMat);
    dais.position.y = -13;
    s.add(dais);
    const stripeMat = this.track(new THREE.MeshPhongMaterial({ color: 0xff5d73, shininess: 60 }));
    const stripe = new THREE.Mesh(this.track(new THREE.TorusGeometry(DAIS_R - 2, 7, 10, 64).rotateX(Math.PI / 2)), stripeMat);
    stripe.position.y = -14;
    s.add(stripe);
    const rockMat = this.track(new THREE.MeshLambertMaterial({ color: 0x8a6ccf, flatShading: true }));
    const rock = new THREE.Mesh(this.track(new THREE.ConeGeometry(DAIS_R - 10, 260, 9).rotateX(Math.PI)), rockMat);
    rock.position.y = -26 - 130;
    s.add(rock);
    // Светеща „аура“ под острова.
    const glowMat = this.track(
      new THREE.MeshBasicMaterial({ map: this.track(radialTexture('rgba(255,230,140,1)')), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const glow = new THREE.Mesh(this.track(new THREE.PlaneGeometry(DAIS_R * 3.4, DAIS_R * 3.4).rotateX(-Math.PI / 2)), glowMat);
    glow.position.y = -40;
    s.add(glow);

    // Стъпалата с цифрите.
    const boxGeo = this.track(new THREE.BoxGeometry(BLOCK_W, 1, BLOCK_W).translate(0, 0.5, 0));
    const capGeo = this.track(new THREE.BoxGeometry(BLOCK_W + 8, 9, BLOCK_W + 8).translate(0, 4.5, 0));
    const plateGeo = this.track(new THREE.PlaneGeometry(74, 74));
    for (const place of [1, 2, 3] as const) {
      const st = STEPS[place];
      const blockMat = this.track(new THREE.MeshPhongMaterial({ color: st.color, shininess: 70, specular: 0x444444 }));
      const block = new THREE.Mesh(boxGeo, blockMat);
      block.scale.y = st.h - 9;
      block.position.x = st.x;
      s.add(block);
      const cap = new THREE.Mesh(capGeo, this.track(new THREE.MeshPhongMaterial({ color: st.top, shininess: 90 })));
      cap.position.set(st.x, st.h - 9, 0);
      s.add(cap);
      const plateMat = this.track(
        new THREE.MeshBasicMaterial({ map: this.track(numberTexture(place)), transparent: true, depthWrite: false }),
      );
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(st.x, Math.max(30, (st.h - 9) * 0.5), BLOCK_W / 2 + 0.8);
      s.add(plate);
    }

    // Слънце с лъчи зад победителя.
    const sunMat = this.track(
      new THREE.MeshBasicMaterial({ map: this.track(sunburstTexture()), transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    this.sun = new THREE.Mesh(this.track(new THREE.PlaneGeometry(900, 900)), sunMat);
    this.sun.position.set(0, 190, -170);
    this.sun.renderOrder = -1;
    s.add(this.sun);

    // Прожектори: прозрачни конуси от небето към стъпалата (без истински светлини – евтино).
    const beamTex = this.track(beamTexture());
    const beamGeo = this.track(new THREE.CylinderGeometry(6, 95, 1100, 24, 1, true).translate(0, -550, 0));
    const beamColors = [0xfff1b8, 0xffb3d1, 0xb8e4ff, 0xfff1b8];
    const beamX = [-380, -150, 150, 380];
    beamX.forEach((x, i) => {
      const mat = this.track(
        new THREE.MeshBasicMaterial({
          color: beamColors[i]!,
          map: beamTex,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      const g = new THREE.Group();
      g.position.set(x, 1000, -120);
      const cone = new THREE.Mesh(beamGeo, mat);
      g.add(cone);
      g.userData.base = Math.atan2(-x * 0.9, 1000);
      g.userData.phase = i * 1.7;
      s.add(g);
      this.beams.push(g);
    });
  }

  private addSpot(player: Player, place: 1 | 2 | 3): void {
    const view = new CharacterView(player.skin || 'skin_fox', false, Math.PI / 2);
    const arms: THREE.Object3D[] = [];
    // Ръцете са групи с userData.side (виж Character.ts) – за ръкопляскане.
    view.root.traverse((o) => {
      if (typeof o.userData.side === 'number') arms.push(o);
    });
    const cfg = this.cfg!;
    const pose: Player = {
      ...player,
      alive: true,
      fallTime: 0,
      vx: 0,
      vy: 0,
      stun: 0,
      frozen: 0,
      immune: false,
      inCar: false,
      abilityTime: 0,
      radius: cfg.player.radius * (place === 1 ? 1.18 : 1),
      facing: Math.PI / 2,
    };
    view.root.visible = false;
    this.stage.add(view.root);
    this.disposables.push(view);
    this.spots.push({ place, player, view, arms, pose, y: DROP_FROM, vy: 0, landed: false, dropped: false });
  }

  // ───────────── Анимация ─────────────

  private animateStage(dt: number): void {
    // Подиумът изскача с „пружинка“ и се издига отдолу, докато камерата лети към него.
    const k = Math.max(0, Math.min(1, (this.t - 0.45) / 0.6));
    const e = k === 0 ? 0.001 : backOut(k);
    this.stage.scale.setScalar(Math.max(0.001, e));
    this.stage.position.y = (1 - k) * -160 + Math.sin(this.t * 1.3) * 5;
    if (this.sun) {
      this.sun.rotation.z -= dt * 0.25;
      this.sun.scale.setScalar(1 + Math.sin(this.t * 2.2) * 0.04);
    }
    for (const b of this.beams) {
      const ph = b.userData.phase as number;
      b.rotation.z = (b.userData.base as number) + Math.sin(this.t * 0.9 + ph) * 0.22;
      b.rotation.x = Math.sin(this.t * 0.7 + ph) * 0.12;
    }
  }

  private animateSpots(dt: number): void {
    const cfg = this.cfg!;
    for (const s of this.spots) {
      const st = STEPS[s.place];
      const top = st.h;
      if (!s.dropped) {
        if (this.t < DROP_AT[s.place]) continue;
        s.dropped = true;
        s.view.root.visible = true;
      }
      if (!s.landed) {
        s.vy -= GRAVITY * dt;
        s.y += s.vy * dt;
        if (s.y <= 0) {
          s.y = 0;
          s.landed = true;
          s.view.hit(0.35);
          this.onLand(st.x, top, s.place);
        }
      }
      const time = this.t;
      s.view.update(s.pose, st.x, 0, {
        dt,
        time,
        cfg,
        hasCrown: s.place === 1,
        celebrating: s.place === 1 && s.landed,
        waiting: s.place === 3,
      });
      // Позиция и поза след update (update нулира височината и посоката).
      let hop = 0;
      let yaw = s.place === 2 ? 0.28 : s.place === 3 ? -0.28 : 0;
      if (s.landed && s.place === 1) {
        // Победителят: голям скок с пирует на всеки ~1.2 сек.
        const cyc = (time * 0.85) % 1;
        if (cyc < 0.45) {
          const k = cyc / 0.45;
          hop = Math.sin(k * Math.PI) * 70;
          yaw += k * Math.PI * 2;
        }
      } else if (s.landed && s.place === 2) {
        hop = Math.max(0, Math.sin(time * 5.5)) * 10;
        this.clap(s.arms, time);
      } else if (s.landed) {
        yaw += Math.sin(time * 2.4) * 0.18;
      }
      s.view.root.position.set(st.x, top + s.y + hop, 0);
      s.view.root.rotation.y = yaw;
    }
  }

  /** Ръкопляскане: ръцете напред, длан в длан. */
  private clap(arms: THREE.Object3D[], time: number): void {
    const k = 0.5 + 0.5 * Math.sin(time * 17);
    for (const a of arms) {
      const side = a.userData.side as number;
      a.rotation.x = -1.25;
      a.rotation.z = side * (-0.42 + 0.55 * k);
    }
  }

  private onLand(x: number, top: number, place: 1 | 2 | 3): void {
    const w = this.group.position;
    const y = w.y + this.stage.position.y + top;
    this.world3d.puffs.burst(w.x + x, y + 4, w.z, {
      count: place === 1 ? 16 : 10,
      colors: [0xffffff, 0xfff3bf],
      speed: [80, 220],
      size: [6, 12],
      life: [0.35, 0.7],
      up: 0.3,
      gravity: -60,
      drag: 3,
    });
    this.world3d.shockwaves.spawn(w.x + x, w.z, place === 1 ? 180 : 120, 0xffffff, 0.4, y + 2);
    sfx.land(place === 1 ? 0.5 : 0.35);
  }

  private burstConfetti(power: number): void {
    // Две „оръдия“ отстрани на подиума + дъжд отгоре.
    for (const side of [-1, 1]) {
      this.confetti.burst(new THREE.Vector3(side * (DAIS_R - 20), 20, 40), new THREE.Vector3(-side * 0.35, 1, 0.15), Math.round(70 * power), 620);
    }
    this.confetti.rain(Math.round(60 * power), 520, DAIS_R * 1.6);
  }

  // ───────────── Камера ─────────────

  /** За World3D.cameraOverride: прелитане до подиума и бавно люлеене около него. */
  applyCamera(cam: THREE.PerspectiveCamera): boolean {
    if (!this.started) return false;
    if (!this.flyReady) {
      this.fromPos.copy(cam.position);
      this.fromQuat.copy(cam.quaternion);
      this.flyReady = true;
    }
    this.shot(cam.aspect, cam.fov);
    const k = Math.min(1, this.t / FLY_TIME);
    if (k >= 1) {
      cam.position.copy(this.camPos);
      cam.quaternion.copy(this.camQuat);
      return true;
    }
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    cam.position.lerpVectors(this.fromPos, this.camPos, e);
    // Дъга нагоре – камерата „излита“ от арената към подиума.
    cam.position.y += Math.sin(Math.PI * e) * 260;
    cam.quaternion.slerpQuaternions(this.fromQuat, this.camQuat, e);
    return true;
  }

  /**
   * Крайната поза на камерата: подиумът се вписва в свободната част на екрана
   * (извън панела с класирането), с леко люлеене наляво-надясно.
   */
  private shot(aspect: number, fov: number): void {
    const { width, height } = this.viewport();
    const { stage } = resultsLayout(width, height);
    const tanY = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const tanX = tanY * aspect;
    const fx = Math.max(0.2, stage.w / width);
    const fy = Math.max(0.2, stage.h / height);
    // Половин ширина/височина на това, което трябва да се вижда (подиум + скачащ победител).
    // На изправен телефон – по-близо (краищата на диска може да излязат извън кадъра).
    const hw = aspect < 1 ? STEPS[3].x + BLOCK_W / 2 + 40 : DAIS_R + 50;
    const hh = 215;
    const dist = Math.max(hw / (tanX * fx * 0.9), hh / (tanY * fy * 0.9));
    const focus = new THREE.Vector3(0, PODIUM_Y + 125, 0);
    const az = Math.PI / 2 + Math.sin(this.t * 0.35) * 0.2;
    const elev = 0.2 + Math.sin(this.t * 0.27) * 0.03;
    this.camPos.set(
      focus.x + Math.cos(az) * Math.cos(elev) * dist,
      focus.y + Math.sin(elev) * dist,
      focus.z + Math.sin(az) * Math.cos(elev) * dist,
    );
    const c = this.tmpCam;
    c.position.copy(this.camPos);
    c.lookAt(focus);
    // Завъртаме леко камерата, така че подиумът да е в центъра на свободната част.
    const nx = ((stage.x + stage.w / 2) / width) * 2 - 1;
    const ny = -(((stage.y + stage.h / 2) / height) * 2 - 1);
    c.rotateY(Math.atan(nx * tanX));
    c.rotateX(-Math.atan(ny * tanY));
    this.camQuat.copy(c.quaternion);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.spots = [];
    this.beams = [];
    this.group.removeFromParent();
  }
}

// ───────────── Конфети ─────────────

interface Piece {
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  phase: number;
  life: number;
  color: THREE.Color;
}

const MAX_CONFETTI = 420;

/** Истински конфети: плоски правоъгълничета, които се въртят и пърхат, докато падат. */
class Confetti {
  private mesh: THREE.InstancedMesh;
  private geo = new THREE.PlaneGeometry(7, 11);
  private mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private pool: Piece[] = [];
  private dummy = new THREE.Object3D();
  private time = 0;

  constructor(parent: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX_CONFETTI);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    parent.add(this.mesh);
  }

  /** Изстрел от точка в посока dir. */
  burst(at: THREE.Vector3, dir: THREE.Vector3, count: number, speed: number): void {
    const d = dir.clone().normalize();
    for (let i = 0; i < count && this.pool.length < MAX_CONFETTI; i++) {
      const v = d
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7))
        .normalize()
        .multiplyScalar(speed * (0.5 + Math.random() * 0.6));
      this.add(at.clone(), v);
    }
  }

  /** Дъжд от конфети отгоре върху кръг с радиус r. */
  rain(count: number, height: number, r: number): void {
    for (let i = 0; i < count && this.pool.length < MAX_CONFETTI; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      this.add(new THREE.Vector3(Math.cos(a) * d, height + Math.random() * 200, Math.sin(a) * d * 0.6), new THREE.Vector3(0, -40, 0));
    }
  }

  private add(p: THREE.Vector3, v: THREE.Vector3): void {
    this.pool.push({
      p,
      v,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14),
      phase: Math.random() * 10,
      life: 4 + Math.random() * 2,
      color: new THREE.Color(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!),
    });
  }

  update(dt: number): void {
    this.time += dt;
    let n = 0;
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const c = this.pool[i]!;
      c.life -= dt;
      if (c.life <= 0 || c.p.y < -700) {
        this.pool[i] = this.pool[this.pool.length - 1]!;
        this.pool.pop();
        continue;
      }
      // Въздушно съпротивление: бързо губят скорост и падат бавно, пърхайки.
      const drag = Math.exp(-dt * 2.6);
      c.v.x *= drag;
      c.v.z *= drag;
      c.v.y = Math.max(-110, c.v.y * drag - 520 * dt);
      c.p.x += (c.v.x + Math.sin(this.time * 3 + c.phase) * 30) * dt;
      c.p.y += c.v.y * dt;
      c.p.z += (c.v.z + Math.cos(this.time * 2.3 + c.phase) * 18) * dt;
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
      const s = c.life < 0.5 ? c.life / 0.5 : 1;
      this.dummy.position.copy(c.p);
      this.dummy.rotation.copy(c.rot);
      this.dummy.scale.setScalar(Math.max(0.001, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, c.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ───────────── Текстури (рисувани с canvas) ─────────────

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Голяма цифра 1/2/3 с дебел тъмен контур (табелка на стъпалото). */
function numberTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.font = '900 112px Nunito, "Trebuchet MS", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 18;
    g.strokeStyle = '#2a1650';
    g.strokeText(String(n), 64, 70);
    g.fillStyle = '#ffffff';
    g.fillText(String(n), 64, 70);
  });
}

/** Слънце с лъчи (прозрачно към краищата). */
function sunburstTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    const c = 256;
    const rays = 18;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / rays / 2;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, 256, a0, a1);
      g.closePath();
      g.fillStyle = 'rgba(255, 244, 190, 0.75)';
      g.fill();
    }
    // Мек център и избледняване навън.
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(c, c, 20, c, c, 256);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.55, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'source-over';
    const glow = g.createRadialGradient(c, c, 0, c, c, 130);
    glow.addColorStop(0, 'rgba(255, 250, 220, 0.6)');
    glow.addColorStop(1, 'rgba(255, 236, 160, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 512, 512);
  });
}

/** Лъч на прожектор: най-ярък при източника (горе), избледнява надолу. */
function beamTexture(): THREE.CanvasTexture {
  return canvasTexture(4, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(0.08, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
  });
}

/** Кръгло меко петно (сияние). */
function radialTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

function backOut(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}
