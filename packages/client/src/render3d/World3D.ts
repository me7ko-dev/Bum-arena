/**
 * 3D сцената на играта (Three.js). Само рисува – чете World от симулацията.
 *
 * Координати: светът на играта е 2D (x, y). В 3D: x → x, y → z, а височината е Y.
 * Камерата е отгоре под ъгъл, без завъртане – „нагоре“ на екрана = -y в играта,
 * затова управлението (WASD/джойстик) съвпада 1:1 с 2D версията.
 *
 * Качество (tier):
 *  - 'high' – истински меки сенки (една карта 1024², следва камерата), винетка и
 *    по-наситени цветове (CSS върху 3D платното – без допълнителен WebGL проход);
 *  - 'low'  – кръгли сенки-петна, без винетка/филтър.
 * Започва 'high', ако устройството не е слабо и резолюцията е ≥ 1; пада на 'low'
 * (и остава така), ако кадрите не стигат. `?fx=low|high` в адреса го фиксира.
 */
import * as THREE from 'three';
import type { Car, Player, World } from '@bum/shared';
import { CharacterView, makeCar } from './Character';
import { Arena3D, SUN_DIR, buildLights, buildScenery, buildSky } from './Environment';
import { Fx3D } from './Fx';
import { KnockoutFx } from './KnockoutFx';
import { Particles } from './Particles';
import { Trails, type Ribbon } from './Trails';
import { Water } from './Water';

/** Колко монети най-много се рисуват наведнъж. */
const MAX_COINS = 400;
/** Наклон на камерата (радиани от хоризонта). */
const PITCH = 0.8;
/** Половин размер на картата за сенки (единици на света) и резолюцията ѝ. */
const SHADOW_HALF = 900;
const SHADOW_MAP = 1024;

export type QualityTier = 'high' | 'low';

const DUST_COLORS = [0xffffff, 0xf3eefc, 0xfaf3e6];

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly particles: Particles;
  readonly puffs: Particles;
  /** Пръстени, комикс-звезди, куполи, черти, лъчи (виж Fx.ts). */
  readonly fx: Fx3D;
  readonly trails: Trails;
  /** Съвместимост: стария API за ударни вълни по земята (вече са пръстени във Fx3D). */
  readonly shockwaves = {
    spawn: (x: number, z: number, size: number, color = 0xffffff, dur = 0.35, y = 3): void => this.fx.ring(x, y, z, size, color, dur),
  };
  readonly knockouts: KnockoutFx;
  private arena: Arena3D;
  private water: Water;
  private sun: THREE.DirectionalLight;
  private animateScenery: (dt: number) => void;
  private characters = new Map<number, CharacterView>();
  private parked = new Map<number, THREE.Group>();
  private seenCars = new Set<number>();
  private dashTrails = new Map<number, Ribbon>();
  private coins: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private time = 0;

  // Камера
  private camTarget = new THREE.Vector3();
  private focusTarget = new THREE.Vector3();
  private camReady = false;
  private shakeAmp = 0;
  private shakeTime = 0;
  private punch = 0;
  private distance = 1200;
  /** Кратко „дръпване“ на камерата към събитие (нокаут): цел, към която бързо отива и се връща. */
  private kickOffset = new THREE.Vector3();
  private kickTarget = new THREE.Vector3();

  // Автоматично качество: ако кадрите са малко, намаляваме разделителната способност.
  private maxPixelRatio: number;
  private pixelRatio: number;
  private fpsTime = 0;
  private fpsFrames = 0;
  private _tier: QualityTier;
  private forcedTier: QualityTier | null;
  private vignette: HTMLDivElement;

  // Временни обекти (без заделяне всеки кадър).
  private tmpColor = new THREE.Color();
  private glintColor = new THREE.Color(0xfff6c8);
  private magnetColor = new THREE.Color(0xff4d6d);
  private magnetLight = new THREE.Color(0xffd6de);
  private lightRight = new THREE.Vector3();
  private lightUp = new THREE.Vector3();
  private lightFwd = new THREE.Vector3();
  private shadowCenter = new THREE.Vector3();

  constructor(private container: HTMLElement) {
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.maxPixelRatio < 1.5, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Без tone mapping – цветовете остават наситени (като в анимационен филм).
    this.renderer.toneMapping = THREE.NoToneMapping;
    // Сенките са включени винаги; дали ги има решава sun.castShadow (според качеството).
    // PCF + shadow.radius = меки ръбове (PCFSoftShadowMap е премахнат в three r18x).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    container.prepend(canvas);

    // Винетка: евтин CSS градиент над 3D платното (под HUD-а).
    this.vignette = document.createElement('div');
    this.vignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:0;' +
      'background:radial-gradient(ellipse 75% 70% at 50% 46%, rgba(30,10,60,0) 58%, rgba(30,10,60,0.16) 80%, rgba(24,6,52,0.42) 100%);';
    canvas.after(this.vignette);

    this.camera = new THREE.PerspectiveCamera(38, 1, 20, 20000);

    buildSky(this.scene);
    this.sun = buildLights(this.scene);
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.lightFwd.copy(SUN_DIR).negate();
    this.lightRight.crossVectors(this.lightFwd, new THREE.Vector3(0, 1, 0)).normalize();
    this.lightUp.crossVectors(this.lightRight, this.lightFwd).normalize();
    this.water = new Water(this.scene);
    this.animateScenery = buildScenery(this.scene);
    this.arena = new Arena3D(this.scene);

    this.coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(14, 14, 4.5, 22).rotateX(Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0xffc61a, shininess: 100, specular: 0xfff3bf, emissive: 0x5c3800 }),
      MAX_COINS,
    );
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.frustumCulled = false;
    this.coins.castShadow = true;
    this.scene.add(this.coins);

    this.particles = new Particles(
      this.scene,
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
    );
    this.puffs = new Particles(
      this.scene,
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.fx = new Fx3D(this.scene);
    this.trails = new Trails(this.scene, 16);
    this.knockouts = new KnockoutFx(this.trails);

    // Качество.
    let forced: string | null = null;
    try {
      forced = new URLSearchParams(window.location.search).get('fx');
    } catch {
      forced = null;
    }
    this.forcedTier = forced === 'low' || forced === 'high' ? forced : null;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowEnd = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3;
    this._tier = this.forcedTier ?? (lowEnd || this.pixelRatio < 1 ? 'low' : 'high');
    this.applyTier();

    this.resize();
  }

  /** Текущото ниво на ефектите. */
  get tier(): QualityTier {
    return this._tier;
  }

  private setTier(t: QualityTier): void {
    if (t === this._tier) return;
    this._tier = t;
    this.applyTier();
  }

  private applyTier(): void {
    const high = this._tier === 'high';
    this.sun.castShadow = high;
    this.vignette.style.display = high ? 'block' : 'none';
    // Малко по-наситено и контрастно (цветова корекция) – само при високо качество.
    this.renderer.domElement.style.filter = high ? 'saturate(1.14) contrast(1.04)' : '';
  }

  /** Нов рунд: изчиства героите, колите и всички ефекти от предишния. */
  reset(): void {
    for (const c of this.characters.values()) c.dispose();
    this.characters.clear();
    for (const g of this.parked.values()) this.scene.remove(g);
    this.parked.clear();
    this.dashTrails.clear();
    this.knockouts.clear();
    this.trails.clear();
    this.fx.clear();
    this.particles.clear();
    this.puffs.clear();
    this.kickOffset.set(0, 0, 0);
    this.kickTarget.set(0, 0, 0);
    this.punch = 0;
    this.shakeAmp = 0;
    this.camReady = false;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Изправен телефон – по-далеч, за да се вижда достатъчно наляво/надясно.
    this.distance = w < h ? 1150 : 860;
    this.camera.updateProjectionMatrix();
  }

  /** Точката, която камерата гледа (на земята; y в играта = z тук). */
  get lookTarget(): THREE.Vector3 {
    return this.camTarget;
  }

  character(id: number): CharacterView | undefined {
    return this.characters.get(id);
  }

  /** Тресене на камерата (amp – в единици на света). */
  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  /** Кратко „приближаване“ при силен удар (0..0.1). */
  punchZoom(amount: number): void {
    this.punch = Math.max(this.punch, amount);
  }

  /**
   * Камерата рязко „поглежда“ към точка (x, y в играта) и се връща – за нокаут.
   * amount – дял от разстоянието до точката (0..1), punch – приближаване.
   */
  kickToward(x: number, y: number, amount = 0.35, punch = 0.08): void {
    this.aimKick(x, y, amount, 180);
    this.punchZoom(punch);
  }

  private aimKick(x: number, y: number, amount: number, max: number): void {
    const dx = x - this.camTarget.x;
    const dz = y - this.camTarget.z;
    const d = Math.hypot(dx, dz);
    const k = d > 0 ? Math.min(d * amount, max) / d : 0;
    this.kickTarget.set(dx * k, 0, dz * k);
  }

  update(world: World, alpha: number, dt: number, focus: Player, meId: number): void {
    this.time += dt;
    const t = this.time;
    const cfg = world.cfg;
    const r = world.round;
    const blob = this._tier === 'low';

    this.arena.update(world.arena, t, cfg.arena.shrinkWarning, r.phase === 'playing');
    this.animateScenery(dt);
    this.water.update(dt);

    // ── Герои ──
    for (const p of world.players) {
      let view = this.characters.get(p.id);
      if (!view) {
        view = new CharacterView(p.skin || 'skin_fox', p.id === meId, p.facing);
        this.characters.set(p.id, view);
        this.scene.add(view.root);
      }
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const z = p.prevY + (p.y - p.prevY) * alpha;
      view.update(p, x, z, {
        dt,
        time: t,
        cfg,
        hasCrown: world.crownId === p.id,
        celebrating: r.phase === 'ended' && r.winnerId === p.id,
        waiting: r.phase === 'countdown',
        blobShadow: blob,
      });
      if (view.dust) this.footDust(p, x, z, view.dust === 2);
    }

    this.updateParked(world.cars, t);
    // Качеството се сменя ПРЕДИ рисуване: смяната на размера изчиства платното.
    this.adaptQuality(dt);
    this.updateCamera(focus, alpha, dt);

    // Ефектите са след камерата: обърнатите към нея неща ползват новата ѝ посока.
    this.fx.begin(dt, this.camera);
    this.updateCoins(world, alpha, t);
    this.updateDash(world, alpha);
    this.updateMagnets(world, alpha, t);
    this.knockouts.update(world, this.characters, this.camera);
    this.trails.update(dt, this.camera);
    this.particles.update(dt);
    this.puffs.update(dt);
    this.fx.end();
    if (!blob) this.updateShadow();
    this.renderer.render(this.scene, this.camera);
  }

  /** Прах от краката: малко облаче при стъпка, по-голямо при завой/приземяване. */
  private footDust(p: Player, x: number, z: number, big: boolean): void {
    if (!this.nearView(x, z)) return;
    const s = p.radius / 28;
    this.puffs.burst(x - p.vx * 0.05, 4, z - p.vy * 0.05, {
      count: big ? 7 : 2,
      colors: DUST_COLORS,
      speed: big ? [80, 190] : [20, 60],
      size: big ? [8 * s, 14 * s] : [8 * s, 13 * s],
      life: big ? [0.35, 0.6] : [0.3, 0.5],
      up: big ? 0.2 : 0.4,
      gravity: -60,
      drag: 3.5,
      jitter: 9 * s,
    });
  }

  /** Близо ли е точката до това, което камерата гледа (за пестене на частици). */
  private nearView(x: number, z: number): boolean {
    const dx = x - this.camTarget.x;
    const dz = z - this.camTarget.z;
    return dx * dx + dz * dz < 1300 * 1300;
  }

  /** Дъш: лента-следа зад героя + черти на скоростта. */
  private updateDash(world: World, alpha: number): void {
    for (const p of world.players) {
      const dashing = p.alive && p.ability === 'dash' && p.abilityTime > 0 && !p.inCar;
      let rib = this.dashTrails.get(p.id);
      if (!dashing) {
        if (rib) {
          rib.stop();
          this.dashTrails.delete(p.id);
        }
        continue;
      }
      const view = this.characters.get(p.id);
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const z = p.prevY + (p.y - p.prevY) * alpha;
      if (!this.nearView(x, z)) continue;
      // Цветът на героя, изсветлен – чете се и на белия, и на цветния под.
      const tint = this.tmpColor.setHex(view?.bodyColor ?? 0xffffff).lerp(this.glintColor, 0.35).getHex();
      if (!rib) {
        rib = this.trails.acquire(tint, 58 * (p.radius / 28), 0.26) ?? undefined;
        if (rib) this.dashTrails.set(p.id, rib);
      }
      const s = p.radius / 28;
      rib?.push(x, 30 * s, z, this.trails.now);
      // Черти на скоростта – остават във въздуха зад героя.
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const dx = p.vx / sp;
      const dz = p.vy / sp;
      for (let i = 0; i < 2; i++) {
        const side = (Math.random() - 0.5) * 70 * s;
        this.fx.streak(
          x - dz * side - dx * 20,
          (12 + Math.random() * 50) * s,
          z + dx * side - dz * 20,
          dx,
          dz,
          70 + Math.random() * 70,
          3.2,
          i === 0 ? 0xffffff : tint,
          0.2,
        );
      }
    }
  }

  /** Магнит: линии, които „дърпат“ монетите (и противниците) към играча. */
  private updateMagnets(world: World, alpha: number, t: number): void {
    const mc = world.cfg.abilities.magnet;
    for (const p of world.players) {
      if (!(p.alive && p.ability === 'magnet' && p.abilityTime > 0 && !p.inCar)) continue;
      const px = p.prevX + (p.x - p.prevX) * alpha;
      const pz = p.prevY + (p.y - p.prevY) * alpha;
      if (!this.nearView(px, pz)) continue;
      const r2 = mc.radius * mc.radius;
      let lines = 0;
      for (const c of world.coins) {
        if (lines >= 40) break;
        const cx = c.prevX + (c.x - c.prevX) * alpha;
        const cz = c.prevY + (c.y - c.prevY) * alpha;
        const dx = px - cx;
        const dz = pz - cz;
        if (dx * dx + dz * dz > r2) continue;
        this.pullLine(cx, 22, cz, px, 34, pz, t + c.id * 0.37, 1);
        lines++;
      }
      for (const o of world.players) {
        if (o === p || !o.alive || o.immune) continue;
        const ox = o.prevX + (o.x - o.prevX) * alpha;
        const oz = o.prevY + (o.y - o.prevY) * alpha;
        const dx = px - ox;
        const dz = pz - oz;
        if (dx * dx + dz * dz > r2) continue;
        this.pullLine(ox, 34, oz, px, 34, pz, t + o.id * 0.21, 1.8);
      }
    }
  }

  /** Бледа линия + две черти, които текат от A към B. */
  private pullLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number, phase: number, w: number): void {
    this.fx.beam(ax, ay, az, bx, by, bz, 2.5 * w, this.magnetLight, 0.35);
    for (let k = 0; k < 2; k++) {
      const f = (phase * 1.8 + k * 0.5) % 1;
      const f2 = Math.min(1, f + 0.16);
      this.fx.beam(
        ax + (bx - ax) * f,
        ay + (by - ay) * f,
        az + (bz - az) * f,
        ax + (bx - ax) * f2,
        ay + (by - ay) * f2,
        az + (bz - az) * f2,
        6 * w,
        this.magnetColor,
        0.95 * Math.sin(f * Math.PI),
      );
    }
  }

  /**
   * Сянката следва камерата: малка карта само около видимото.
   * Центърът се „закотвя“ към тексела на картата – иначе сенките трептят при движение.
   */
  private updateShadow(): void {
    const c = this.shadowCenter.copy(this.camTarget);
    c.z -= 140; // повече място към далечния край (горе на екрана)
    const texel = (SHADOW_HALF * 2) / SHADOW_MAP;
    const a = Math.round(c.dot(this.lightRight) / texel) * texel;
    const b = Math.round(c.dot(this.lightUp) / texel) * texel;
    const f = c.dot(this.lightFwd);
    c.copy(this.lightRight).multiplyScalar(a).addScaledVector(this.lightUp, b).addScaledVector(this.lightFwd, f);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(SUN_DIR, 2000);
  }

  /** На всеки 1.5 сек: под 45 FPS → по-ниско качество; над 58 → малко по-висока резолюция. */
  private adaptQuality(dt: number): void {
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < 1.5) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    let pr = this.pixelRatio;
    if (fps < 45) {
      // Първо махаме скъпите ефекти (при резолюция 1), чак после ставаме „размазани“.
      if (this._tier === 'high' && !this.forcedTier && pr <= 1) this.setTier('low');
      else if (pr > 0.5) pr = Math.max(0.5, pr - 0.25);
    } else if (fps > 58 && pr < this.maxPixelRatio) pr = Math.min(this.maxPixelRatio, pr + 0.125);
    if (pr !== this.pixelRatio) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.resize();
    }
  }

  /** Текущата резолюция (за брояча на FPS / отстраняване на проблеми). */
  get quality(): number {
    return this.pixelRatio;
  }

  private updateParked(cars: readonly Car[], t: number): void {
    const seen = this.seenCars;
    seen.clear();
    for (const c of cars) {
      seen.add(c.id);
      let g = this.parked.get(c.id);
      if (!g) {
        g = makeCar(c.kind).group;
        g.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.userData.born = t;
        this.scene.add(g);
        this.parked.set(c.id, g);
      }
      // Появява се с „поп“ и леко подскача, за да се забелязва.
      const age = t - (g.userData.born as number);
      const pop = Math.min(1, age * 3);
      g.scale.setScalar(pop < 1 ? pop * (1.25 - 0.25 * pop) : 1);
      g.position.set(c.x, Math.abs(Math.sin(t * 3 + c.id)) * 6, c.y);
    }
    for (const [id, g] of this.parked) {
      if (seen.has(id)) continue;
      this.scene.remove(g);
      this.parked.delete(id);
    }
  }

  private updateCoins(world: World, alpha: number, t: number): void {
    const list = world.coins;
    let i = 0;
    for (; i < list.length && i < MAX_COINS; i++) {
      const c = list[i]!;
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevY + (c.y - c.prevY) * alpha;
      const big = c.value > 1 ? 1.35 : 1;
      const y = 22 + Math.sin(t * 3 + c.id) * 4;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, t * 3 + c.id, 0);
      this.dummy.scale.setScalar(big * (c.pickupDelay > 0 ? 0.8 : 1));
      this.dummy.updateMatrix();
      this.coins.setMatrixAt(i, this.dummy.matrix);
      // Проблясък: всяка монета от време на време „светва“ (различна фаза за всяка).
      const ph = (t * 0.75 + c.id * 0.618034) % 1;
      if (ph < 0.16) {
        const k = ph / 0.16;
        const a = Math.sin(k * Math.PI);
        this.fx.glint(x - 7 * big, y + 9 * big, z, 15 * big * (0.4 + 0.6 * a), this.glintColor, a, k * 0.9);
      }
    }
    this.coins.count = i;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  /**
   * Кинематографична камера (прелитане при старт, подиум, избутване …).
   * Ако е зададена и върне true, обичайната камера „отгоре“ не се прилага за този кадър.
   * defaultTarget – точката, която обичайната камера следи (за плавен преход).
   */
  cameraOverride: ((cam: THREE.PerspectiveCamera, dt: number, defaultTarget: THREE.Vector3) => boolean) | null = null;

  private updateCamera(focus: Player, alpha: number, dt: number): void {
    const fx = focus.prevX + (focus.x - focus.prevX) * alpha;
    const fz = focus.prevY + (focus.y - focus.prevY) * alpha;
    const target = this.focusTarget.set(fx, 0, fz);
    if (!this.camReady) {
      this.camTarget.copy(target);
      this.camReady = true;
    } else {
      this.camTarget.lerp(target, 1 - Math.exp(-dt * 7));
    }
    this.punch *= Math.exp(-dt * 10);
    // „Дръпване“ към нокаута: докато важният падащ лети, камерата леко гледа към него
    // (за да се види плясъкът); после целта затихва. Отместването я догонва бързо, но плавно.
    if (this.knockouts.hasFocus) {
      const f = this.knockouts.focusPos;
      this.aimKick(f.x, f.z, 0.4, 240);
    } else {
      this.kickTarget.multiplyScalar(Math.exp(-dt * 3));
    }
    this.kickOffset.lerp(this.kickTarget, 1 - Math.exp(-dt * 14));
    const d = this.distance * (1 - this.punch);
    const cam = this.camera;
    if (this.cameraOverride?.(cam, dt, this.camTarget)) return;
    const tx = this.camTarget.x + this.kickOffset.x;
    const tz = this.camTarget.z + this.kickOffset.z;
    cam.position.set(tx, Math.sin(PITCH) * d, tz + Math.cos(PITCH) * d);

    // Тресене: случайно отместване, което затихва.
    this.shakeTime += dt;
    this.shakeAmp *= Math.exp(-dt * 9);
    if (this.shakeAmp > 0.3) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmp * 2;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmp;
      cam.position.z += (Math.random() - 0.5) * this.shakeAmp * 2;
    }
    cam.lookAt(tx, 30, tz);
  }

  private v = new THREE.Vector3();

  /**
   * Проектира точка от света (x, височина, y) върху екрана (в CSS пиксели).
   * visible=false, ако е зад камерата или извън екрана.
   */
  project(x: number, height: number, y: number): { x: number; y: number; visible: boolean } {
    this.v.set(x, height, y).project(this.camera);
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const sx = (this.v.x * 0.5 + 0.5) * w;
    const sy = (-this.v.y * 0.5 + 0.5) * h;
    const visible = this.v.z < 1 && sx > -50 && sx < w + 50 && sy > -50 && sy < h + 50;
    return { x: sx, y: sy, visible };
  }
}
