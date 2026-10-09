/**
 * Прелитане на камерата при старта на рунда (по време на отброяването 3-2-1).
 *
 * Камерата започва високо и далеч, обикаля арената, „гмурва се“ ниско
 * и каца ТОЧНО в обичайната позиция зад играча в мига, в който отброяването
 * стигне 0 – така предаването към нормалната камера е без никакъв скок.
 * Всеки клавиш/докосване пропуска прелитането (бързо плавно връщане).
 * Онлайн в лобито камерата бавно обикаля отгоре, докато чакаме играчи.
 *
 * Включва се през World3D.cameraOverride (виж GameScene).
 */
import * as THREE from 'three';
import { sfx } from '../audio/Sfx';

/**
 * Наклонът и разстоянието на обичайната камера – трябва да съвпадат с World3D
 * (PITCH и distance в resize()), за да е кацането безшевно.
 */
const FOLLOW_PITCH = 0.8;
const followDistance = (aspect: number): number => (aspect < 1 ? 1150 : 860);
/** Обичайната камера гледа към тази височина над играча. */
const LOOK_HEIGHT = 30;

/** С колко радиана обикаля по време на прелитането. */
const SWEEP = Math.PI * 1.05;
/** Бавно обикаляне в лобито (рад/сек). */
const LOBBY_SPIN = 0.12;
/** Колко трае плавното връщане при пропускане (сек). */
const SKIP_BLEND = 0.45;

export interface IntroState {
  phase: 'countdown' | 'playing' | 'ended';
  /** Онлайн лоби / чакаме сървъра – светът стои. */
  waiting: boolean;
  /** Секунди от началото на отброяването (с интерполация между тиковете). */
  elapsed: number;
  /** Колко трае отброяването (сек). */
  total: number;
  /** Радиус на арената (за колко далеч да е началото). */
  arenaRadius: number;
}

const easeInOut = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeInOutSine = (k: number): number => -(Math.cos(Math.PI * k) - 1) / 2;
const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export class IntroCamera {
  /** Свършило е (или никога не е започвало – влязъл си по средата на рунда). */
  private done = false;
  private started = false;
  private p = 0;
  private elapsed = -1;
  private waiting = false;
  private arenaRadius = 1100;
  private lobbyAngle = 0;
  /** Колко още да обиколи (фиксира се при началото на отброяването). */
  private extra = SWEEP;

  // Плавно връщане към обичайната камера (при пропускане / неочакван край).
  private blendT = -1;
  private blendDur = SKIP_BLEND;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();

  // Временни обекти (без боклук всеки кадър).
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  /** Прелитането тече в момента (за подсказката „Докосни, за да пропуснеш“). */
  get active(): boolean {
    return !this.done && this.blendT < 0 && this.started && !this.waiting;
  }

  /** Вика се всеки кадър, преди рисуването. */
  update(dt: number, s: IntroState): void {
    if (this.done) return;
    this.arenaRadius = s.arenaRadius;
    this.waiting = s.waiting;
    if (!this.started) {
      // Сцената започва по средата на рунда → без прелитане.
      if (s.phase !== 'countdown') {
        this.done = true;
        return;
      }
      this.started = true;
    }
    if (this.blendT >= 0) {
      this.blendT += dt;
      return;
    }
    if (s.phase !== 'countdown') {
      // Отброяването свърши, а ние още не сме кацнали (напр. забавяне онлайн) – плавно довършваме.
      this.startBlend(0.3);
      return;
    }
    if (s.waiting) {
      this.lobbyAngle += dt * LOBBY_SPIN;
      this.elapsed = -1;
      this.p = 0;
      return;
    }
    if (this.elapsed < 0) {
      // Началото на отброяването: от текущия ъгъл в лобито, но не повече от ~1.5 обиколки.
      let extra = (SWEEP + this.lobbyAngle) % (Math.PI * 2);
      if (extra < Math.PI * 0.6) extra += Math.PI * 2;
      this.extra = extra;
      this.elapsed = s.elapsed;
      sfx.whoosh(Math.max(0.5, s.total - s.elapsed), 0.3);
    }
    // Собствен часовник, който плавно следва времето на симулацията (онлайн то идва на тласъци).
    this.elapsed += dt;
    const err = s.elapsed - this.elapsed;
    if (Math.abs(err) > 0.3) this.elapsed = s.elapsed;
    else this.elapsed += err * Math.min(1, dt * 6);
    this.p = clamp01(this.elapsed / Math.max(0.1, s.total));
  }

  /** Пропуска прелитането (всеки клавиш или докосване). */
  skip(): void {
    if (this.done || this.blendT >= 0 || !this.started) return;
    this.startBlend(SKIP_BLEND);
  }

  private startBlend(dur: number): void {
    this.blendT = 0;
    this.blendDur = dur;
    // fromPos/fromQuat се взимат от камерата в следващия apply().
    this.fromPos.set(NaN, 0, 0);
  }

  /** За World3D.cameraOverride: true = ние управляваме камерата този кадър. */
  apply(cam: THREE.PerspectiveCamera, _dt: number, target: THREE.Vector3): boolean {
    if (this.done || !this.started) return false;
    const d = followDistance(cam.aspect);

    if (this.blendT >= 0) {
      if (Number.isNaN(this.fromPos.x)) {
        this.fromPos.copy(cam.position);
        this.fromQuat.copy(cam.quaternion);
      }
      const k = clamp01(this.blendT / this.blendDur);
      if (k >= 1) {
        this.done = true;
        return false;
      }
      const e = 1 - Math.pow(1 - k, 3);
      this.pos.set(target.x, Math.sin(FOLLOW_PITCH) * d, target.z + Math.cos(FOLLOW_PITCH) * d);
      this.look.set(target.x, LOOK_HEIGHT, target.z);
      this.q.setFromRotationMatrix(this.m.lookAt(this.pos, this.look, this.up));
      cam.position.lerpVectors(this.fromPos, this.pos, e);
      cam.quaternion.slerpQuaternions(this.fromQuat, this.q, e);
      return true;
    }

    const p = this.p;
    if (!this.waiting && p >= 1) {
      // Кацнахме – оттук нататък е обичайната камера (позата е една и съща).
      this.done = true;
      return false;
    }
    // Около коя точка обикаля: центъра на арената → играча (във втората половина).
    const k = easeInOut(clamp01((p - 0.25) / 0.75));
    const bx = target.x * k;
    const bz = target.z * k;
    // Разстояние: далеч → обичайното.
    const far = this.arenaRadius * 2.4 + 700;
    const dist = lerp(far, d, easeInOut(p));
    // Височина (ъгъл): високо → ниско „гмурване“ → обичайния наклон.
    const elev = p < 0.62 ? lerp(1.1, 0.42, easeInOut(p / 0.62)) : lerp(0.42, FOLLOW_PITCH, easeInOut((p - 0.62) / 0.38));
    // Ъгъл около арената: завършва точно „на юг“ (+z), откъдето гледа обичайната камера.
    const spin = this.waiting ? SWEEP + this.lobbyAngle : this.extra * (1 - easeInOutSine(p));
    const az = Math.PI / 2 + spin;
    const ce = Math.cos(elev);
    cam.position.set(bx + dist * ce * Math.cos(az), dist * Math.sin(elev), bz + dist * ce * Math.sin(az));
    // Отначало гледа малко под центъра (вижда се цялата арена), накрая – като обичайната камера.
    cam.lookAt(bx, lerp(-120, LOOK_HEIGHT, easeInOut(p)), bz);
    return true;
  }
}
