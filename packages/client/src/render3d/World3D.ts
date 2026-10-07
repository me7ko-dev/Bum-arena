/**
 * 3D сцената на играта (Three.js). Само рисува – чете World от симулацията.
 *
 * Координати: светът на играта е 2D (x, y). В 3D: x → x, y → z, а височината е Y.
 * Камерата е отгоре под ъгъл, без завъртане – „нагоре“ на екрана = -y в играта,
 * затова управлението (WASD/джойстик) съвпада 1:1 с 2D версията.
 */
import * as THREE from 'three';
import type { Car, Player, World } from '@bum/shared';
import { CharacterView, makeCar } from './Character';
import { Arena3D, buildLights, buildScenery, buildSky } from './Environment';
import { Particles, Shockwaves } from './Particles';

/** Колко монети най-много се рисуват наведнъж. */
const MAX_COINS = 400;
/** Наклон на камерата (радиани от хоризонта). */
const PITCH = 0.8;

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly particles: Particles;
  readonly puffs: Particles;
  readonly shockwaves: Shockwaves;
  private arena: Arena3D;
  private animateScenery: (dt: number) => void;
  private characters = new Map<number, CharacterView>();
  private parked = new Map<number, THREE.Group>();
  private coins: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private time = 0;

  // Камера
  private camTarget = new THREE.Vector3();
  private camReady = false;
  private shakeAmp = 0;
  private shakeTime = 0;
  private punch = 0;
  private distance = 1200;

  // Автоматично качество: ако кадрите са малко, намаляваме разделителната способност.
  private maxPixelRatio: number;
  private pixelRatio: number;
  private fpsTime = 0;
  private fpsFrames = 0;

  constructor(private container: HTMLElement) {
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.maxPixelRatio < 1.5, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Без tone mapping – цветовете остават наситени (като в анимационен филм).
    this.renderer.toneMapping = THREE.NoToneMapping;
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    container.prepend(canvas);

    this.camera = new THREE.PerspectiveCamera(38, 1, 20, 20000);

    buildSky(this.scene);
    buildLights(this.scene);
    this.animateScenery = buildScenery(this.scene);
    this.arena = new Arena3D(this.scene);

    this.coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(14, 14, 4.5, 22).rotateX(Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0xffc61a, shininess: 100, specular: 0xfff3bf, emissive: 0x5c3800 }),
      MAX_COINS,
    );
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.frustumCulled = false;
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
    this.shockwaves = new Shockwaves(this.scene);

    this.resize();
  }

  /** Нов рунд: изчиства героите и колите от предишния. */
  reset(): void {
    for (const c of this.characters.values()) c.dispose();
    this.characters.clear();
    for (const g of this.parked.values()) this.scene.remove(g);
    this.parked.clear();
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

  update(world: World, alpha: number, dt: number, focus: Player, meId: number): void {
    this.time += dt;
    const t = this.time;
    const cfg = world.cfg;
    const r = world.round;

    this.arena.update(world.arena, t, cfg.arena.shrinkWarning, r.phase === 'playing');
    this.animateScenery(dt);

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
      });
    }

    this.updateParked(world.cars, t);
    this.updateCoins(world, alpha, t);
    this.particles.update(dt);
    this.puffs.update(dt);
    this.shockwaves.update(dt);
    // Качеството се сменя ПРЕДИ рисуване: смяната на размера изчиства платното.
    this.adaptQuality(dt);
    this.updateCamera(focus, alpha, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** На всеки 1.5 сек: под 45 FPS → по-ниска резолюция; над 58 → малко по-висока. */
  private adaptQuality(dt: number): void {
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < 1.5) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    let pr = this.pixelRatio;
    if (fps < 45 && pr > 0.5) pr = Math.max(0.5, pr - 0.25);
    else if (fps > 58 && pr < this.maxPixelRatio) pr = Math.min(this.maxPixelRatio, pr + 0.125);
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
    const seen = new Set<number>();
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
      this.dummy.position.set(x, 22 + Math.sin(t * 3 + c.id) * 4, z);
      this.dummy.rotation.set(0, t * 3 + c.id, 0);
      this.dummy.scale.setScalar(big * (c.pickupDelay > 0 ? 0.8 : 1));
      this.dummy.updateMatrix();
      this.coins.setMatrixAt(i, this.dummy.matrix);
    }
    this.coins.count = i;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(focus: Player, alpha: number, dt: number): void {
    const fx = focus.prevX + (focus.x - focus.prevX) * alpha;
    const fz = focus.prevY + (focus.y - focus.prevY) * alpha;
    const target = new THREE.Vector3(fx, 0, fz);
    if (!this.camReady) {
      this.camTarget.copy(target);
      this.camReady = true;
    } else {
      this.camTarget.lerp(target, 1 - Math.exp(-dt * 7));
    }
    this.punch *= Math.exp(-dt * 10);
    const d = this.distance * (1 - this.punch);
    const cam = this.camera;
    cam.position.set(this.camTarget.x, Math.sin(PITCH) * d, this.camTarget.z + Math.cos(PITCH) * d);

    // Тресене: случайно отместване, което затихва.
    this.shakeTime += dt;
    this.shakeAmp *= Math.exp(-dt * 9);
    if (this.shakeAmp > 0.3) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmp * 2;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmp;
      cam.position.z += (Math.random() - 0.5) * this.shakeAmp * 2;
    }
    cam.lookAt(this.camTarget.x, 30, this.camTarget.z);
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
