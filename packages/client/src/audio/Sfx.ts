/**
 * Звукови ефекти, синтезирани с Web Audio – без файлове.
 * Целта е бързо да чуем „усещането“. По-късно (етап 6) се заменят с истински CC0 звуци.
 *
 * Браузърите разрешават звук само след първо докосване/клавиш → unlock().
 * Музиката (Music.ts) ползва същия AudioContext и същото sfx.muted.
 */
import { FEEL } from '../config/feel';

/** Изход за един звук: къде да се свърже и от кой момент започва. */
interface Out {
  ctx: AudioContext;
  node: AudioNode;
  t: number;
}

/** Мажорна пентатоника (полутонове) – за изкачващите се монети. */
const PENTA = [0, 2, 4, 7, 9];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /** Кой иска да знае, когато звукът се „отключи“ (напр. музиката). */
  private unlockListeners: ((ctx: AudioContext) => void)[] = [];
  /** Кога (ctx.currentTime) за последно е пуснат звук при посочване – да не „тракат“ на рояк. */
  private lastHoverAt = 0;
  /** Един бутон за всичко: изключва и ефектите, и музиката (Music следи това поле). */
  muted = false;

  /** Вика се при първия вход от потребителя. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise();
      for (const fn of this.unlockListeners) fn(this.ctx);
      this.unlockListeners = [];
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Общият AudioContext (null, докато потребителят не е натиснал нещо). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Бял шум (0.5 сек) – музиката го ползва за барабаните. */
  get noise05(): AudioBuffer | null {
    return this.noiseBuffer;
  }

  /** fn се вика веднъж, щом звукът се отключи (или веднага, ако вече е). */
  onUnlock(fn: (ctx: AudioContext) => void): void {
    if (this.ctx) fn(this.ctx);
    else this.unlockListeners.push(fn);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Подготвя изход с дадена сила и позиция в стерео (-1..1). null ако звукът е изключен. */
  private out(volume: number, pan = 0): Out | null {
    if (!this.ctx || !this.master || this.muted || volume <= 0.001) return null;
    this.master.gain.value = FEEL.volume;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    const node: AudioNode = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      p.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    return { ctx: this.ctx, node, t: this.ctx.currentTime };
  }

  private tone(o: Out, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const osc = o.ctx.createOscillator();
    const g = o.ctx.createGain();
    const t = o.t + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(o.node);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Шум през филтър. type: bandpass (по подразбиране), lowpass (тътен, плясък), highpass (щракване). */
  private noise(
    o: Out,
    freq: number,
    q: number,
    dur: number,
    vol: number,
    delay = 0,
    type: BiquadFilterType = 'bandpass',
    attack = 0,
  ): void {
    if (!this.noiseBuffer) return;
    const src = o.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = dur + attack > 0.45;
    const filter = o.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = o.ctx.createGain();
    const t = o.t + delay;
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
    } else {
      g.gain.setValueAtTime(vol, t);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(filter).connect(g).connect(o.node);
    src.start(t);
    src.stop(t + attack + dur + 0.02);
  }

  /**
   * „БУМ“ при удар. strength 0..1.
   * Слабият удар е високо и кратко „пук“; силният – ниско „туп“ + сухо „крак“ отгоре
   * (два слоя) и по-дълга опашка. Лека случайна височина – да не звучи като картечница.
   */
  hit(strength: number, volume: number, pan: number): void {
    const s = Math.max(0, Math.min(1, strength));
    const o = this.out(volume * (0.3 + s * 0.7), pan);
    if (!o) return;
    const vary = 0.94 + Math.random() * 0.12;
    // По-силно → по-ниско тяло на удара.
    this.tone(o, 'sine', (210 - s * 110) * vary, 42, 0.1 + s * 0.2, 0.9);
    this.noise(o, (1300 - s * 500) * vary, 1.1, 0.06 + s * 0.08, 0.55);
    if (s > 0.55) {
      // Слой „туп“: дълбок бас, който се усеща.
      this.tone(o, 'sine', 95 * vary, 32, 0.32 + s * 0.15, 0.85);
      this.noise(o, 260, 0.7, 0.28, 0.6, 0, 'lowpass');
      // Слой „крак“: остро щракване + висок шум.
      this.noise(o, 3800, 0.7, 0.05, 0.75 * s, 0, 'highpass');
      this.tone(o, 'square', 1800 * vary, 600, 0.03, 0.18);
    }
    if (s > 0.85) this.tone(o, 'sawtooth', 70, 30, 0.35, 0.22, 0.02);
  }

  /** Дъш – „фшшт“. */
  dash(volume: number, pan: number): void {
    const o = this.out(volume * 0.55, pan);
    if (!o || !this.noiseBuffer) return;
    const src = o.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = o.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(500, o.t);
    filter.frequency.exponentialRampToValueAtTime(3200, o.t + 0.2);
    const g = o.ctx.createGain();
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.exponentialRampToValueAtTime(0.9, o.t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + 0.25);
    src.connect(filter).connect(g).connect(o.node);
    src.start(o.t);
    src.stop(o.t + 0.3);
  }

  /**
   * Взета монета – „блинг“. pitch расте при бързо събиране (серия: 1 + 0.06 на монета).
   * Серията се изкачва по пентатоника – всяка следваща монета е с една нота по-високо,
   * а от 4-тата нататък има и трета нотка отгоре (като в старите платформъри).
   */
  coin(volume: number, pan: number, pitch = 1): void {
    const o = this.out(volume * 0.3, pan);
    if (!o) return;
    const streak = Math.max(0, Math.round((pitch - 1) / 0.06));
    const semis = PENTA[streak % PENTA.length]! + 12 * Math.floor(streak / PENTA.length);
    const base = 988 * Math.pow(2, semis / 12);
    this.tone(o, 'square', base, base, 0.05, 0.32);
    this.tone(o, 'square', base * 1.335, base * 1.335, 0.1, 0.32, 0.045);
    if (streak >= 4) this.tone(o, 'triangle', base * 2, base * 2, 0.14, 0.3, 0.09);
  }

  /** Монетата долетя до брояча – тихо „цинк“ (step – коя поред, за мелодия). */
  coinLand(step: number): void {
    const o = this.out(0.1);
    if (!o) return;
    const f = 1760 * Math.pow(2, PENTA[step % PENTA.length]! / 12);
    this.tone(o, 'triangle', f, f, 0.06, 0.35);
  }

  /** Разпилени монети – няколко бързи звънчета. */
  coinScatter(volume: number, pan: number, count: number): void {
    const o = this.out(volume * 0.25, pan);
    if (!o) return;
    const n = Math.min(6, 2 + Math.floor(count / 3));
    for (let i = 0; i < n; i++) {
      const f = 1400 + Math.random() * 900;
      this.tone(o, 'triangle', f, f * 0.9, 0.08, 0.4, i * 0.035);
    }
  }

  /** Отброяване: 3, 2, 1 – „бийп“ все по-високо; 0 – „БУМ!“ (акорд + удар). */
  countdown(n: number): void {
    const o = this.out(0.45);
    if (!o) return;
    if (n > 0) {
      const f = [784, 659, 587, 523][Math.min(3, n)]!;
      this.tone(o, 'square', f, f, 0.14, 0.3);
      this.tone(o, 'triangle', f * 2, f * 2, 0.1, 0.12);
    } else {
      [523, 659, 784, 1047].forEach((f) => this.tone(o, 'square', f, f, 0.45, 0.13, 0.02));
      this.tone(o, 'sine', 150, 40, 0.4, 0.9);
      this.noise(o, 400, 0.7, 0.3, 0.5, 0, 'lowpass');
      this.noise(o, 5000, 0.7, 0.35, 0.22, 0.02, 'highpass');
    }
  }

  /** Последните секунди: „тик“ (urgent – по-висок и по-силен за последните 5). */
  tick(urgent: boolean): void {
    const o = this.out(urgent ? 0.4 : 0.25);
    if (!o) return;
    const f = urgent ? 1568 : 1175;
    this.tone(o, 'square', f, f, 0.05, 0.3);
    this.tone(o, 'sine', f / 2, f / 2, 0.12, 0.3, 0.005);
  }

  /** „Фшшууу“ – камерата прелита (за duration секунди). */
  whoosh(duration: number, volume = 0.35): void {
    const o = this.out(volume);
    if (!o || !this.noiseBuffer) return;
    const src = o.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = o.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, o.t);
    f.frequency.exponentialRampToValueAtTime(2400, o.t + duration * 0.6);
    f.frequency.exponentialRampToValueAtTime(500, o.t + duration);
    const g = o.ctx.createGain();
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.exponentialRampToValueAtTime(0.7, o.t + duration * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + duration);
    src.connect(f).connect(g).connect(o.node);
    src.start(o.t);
    src.stop(o.t + duration + 0.05);
  }

  /** Конфети – „пук!“ на парти свирка + шумолене. */
  confetti(volume = 0.5): void {
    const o = this.out(volume);
    if (!o) return;
    this.noise(o, 900, 0.7, 0.12, 0.8, 0, 'lowpass');
    this.tone(o, 'sine', 300, 1400, 0.12, 0.35);
    this.noise(o, 6000, 0.7, 0.6, 0.16, 0.05, 'highpass');
    for (let i = 0; i < 5; i++) {
      const f = 1800 + Math.random() * 1600;
      this.tone(o, 'triangle', f, f * 1.1, 0.05, 0.12, 0.08 + i * 0.05);
    }
  }

  /** Тупване при кацане (героите на подиума). */
  land(volume = 0.4): void {
    const o = this.out(volume);
    if (!o) return;
    this.tone(o, 'sine', 140, 50, 0.16, 0.8);
    this.noise(o, 500, 0.7, 0.1, 0.4, 0, 'lowpass');
  }

  /** Предупреждение, че арената ще се свие – „уи-у“. */
  warning(): void {
    const o = this.out(0.35);
    if (!o) return;
    this.tone(o, 'sawtooth', 440, 660, 0.25, 0.25);
    this.tone(o, 'sawtooth', 660, 440, 0.25, 0.25, 0.25);
  }

  /** Победа – кратка фанфара. */
  win(): void {
    const o = this.out(0.5);
    if (!o) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(o, 'square', f, f, 0.16, 0.3, i * 0.11));
    this.tone(o, 'triangle', 1047, 1047, 0.6, 0.3, 0.44);
  }

  /** Загуба – тъжно „уа-уа“. */
  lose(): void {
    const o = this.out(0.4);
    if (!o) return;
    this.tone(o, 'triangle', 392, 370, 0.3, 0.4);
    this.tone(o, 'triangle', 330, 262, 0.55, 0.4, 0.3);
  }

  /** Замразяване – кристален звън. */
  freeze(volume: number, pan: number): void {
    const o = this.out(volume * 0.45, pan);
    if (!o) return;
    [2093, 2637, 3136, 2349].forEach((f, i) => this.tone(o, 'sine', f, f * 0.98, 0.25, 0.35, i * 0.04));
    this.noise(o, 6000, 2, 0.3, 0.3);
  }

  /** Щит – „бум“ с ехо. */
  shield(volume: number, pan: number): void {
    const o = this.out(volume * 0.5, pan);
    if (!o) return;
    this.tone(o, 'sine', 300, 900, 0.18, 0.5);
    this.tone(o, 'triangle', 600, 1200, 0.25, 0.25, 0.05);
  }

  /** Магнит – вибриращо „ууум“. */
  magnet(volume: number, pan: number): void {
    const o = this.out(volume * 0.4, pan);
    if (!o) return;
    this.tone(o, 'sawtooth', 120, 240, 0.6, 0.3);
    this.tone(o, 'sine', 240, 480, 0.6, 0.3);
  }

  /** Гигант – растящ тон. */
  giant(volume: number, pan: number): void {
    const o = this.out(volume * 0.5, pan);
    if (!o) return;
    this.tone(o, 'square', 110, 55, 0.5, 0.3);
    [262, 330, 392, 523].forEach((f, i) => this.tone(o, 'triangle', f, f, 0.12, 0.3, i * 0.07));
  }

  /** Влизане в кола – мотор. */
  carEnter(volume: number, pan: number): void {
    const o = this.out(volume * 0.5, pan);
    if (!o) return;
    this.tone(o, 'sawtooth', 70, 160, 0.35, 0.4);
    this.tone(o, 'sawtooth', 160, 110, 0.3, 0.3, 0.35);
  }

  /** Разбита кола – експлозия. */
  explosion(volume: number, pan: number): void {
    const o = this.out(volume * 0.8, pan);
    if (!o) return;
    this.noise(o, 300, 0.7, 0.7, 1);
    this.tone(o, 'sine', 120, 30, 0.6, 0.9);
  }

  /** Покупка – „ка-чинг“. */
  buy(): void {
    const o = this.out(0.5);
    if (!o) return;
    this.noise(o, 3000, 3, 0.05, 0.4);
    this.tone(o, 'square', 1568, 1568, 0.08, 0.25, 0.05);
    this.tone(o, 'square', 2093, 2093, 0.2, 0.25, 0.12);
  }

  /** Нова корона. */
  crown(): void {
    const o = this.out(0.4);
    if (!o) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, 'triangle', f, f, 0.15, 0.3, i * 0.06));
  }

  /** Суперсилата е презаредена – тихо „дзън“. */
  ready(): void {
    const o = this.out(0.18);
    if (!o) return;
    this.tone(o, 'sine', 1320, 1320, 0.12, 0.5);
  }

  /**
   * Падане от ръба: анимационно „фиуууу“ (свирка надолу с вибрато),
   * а след миг – далечен плясък във водата отдолу.
   */
  fall(volume: number, pan: number): void {
    const o = this.out(volume * 0.5, pan);
    if (!o) return;
    const osc = o.ctx.createOscillator();
    const g = o.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, o.t);
    osc.frequency.exponentialRampToValueAtTime(260, o.t + 1.0);
    // Вибрато – „свирката“ трепти.
    const lfo = o.ctx.createOscillator();
    const lfoGain = o.ctx.createGain();
    lfo.frequency.value = 11;
    lfoGain.gain.value = 28;
    lfo.connect(lfoGain).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.exponentialRampToValueAtTime(0.42, o.t + 0.05);
    g.gain.setValueAtTime(0.42, o.t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + 1.05);
    osc.connect(g).connect(o.node);
    osc.start(o.t);
    lfo.start(o.t);
    osc.stop(o.t + 1.1);
    lfo.stop(o.t + 1.1);
    // Далечен плясък: приглушен шум с бавна атака + „блоп“.
    this.noise(o, 700, 0.7, 0.55, 0.3, 1.05, 'lowpass', 0.04);
    this.tone(o, 'sine', 420, 120, 0.18, 0.2, 1.05);
    this.noise(o, 2500, 0.7, 0.35, 0.05, 1.12, 'highpass');
  }

  /** Избутал си някого – кратка победна нотка. */
  knockout(): void {
    const o = this.out(0.5);
    if (!o) return;
    this.tone(o, 'square', 660, 660, 0.08, 0.25);
    this.tone(o, 'square', 990, 990, 0.14, 0.25, 0.08);
  }

  /** Бутон в менюто/HUD – меко „клик“. */
  uiClick(): void {
    const o = this.out(0.35);
    if (!o) return;
    this.tone(o, 'triangle', 880, 1320, 0.05, 0.4);
    this.tone(o, 'sine', 1760, 1760, 0.06, 0.18, 0.03);
    this.noise(o, 4000, 0.7, 0.02, 0.2, 0, 'highpass');
  }

  /** Мишката мина над бутон – съвсем тихо „тик“ (не по-често от веднъж на 60 ms). */
  uiHover(): void {
    if (!this.ctx || this.ctx.currentTime - this.lastHoverAt < 0.06) return;
    const o = this.out(0.1);
    if (!o) return;
    this.lastHoverAt = o.t;
    this.tone(o, 'sine', 1320, 1500, 0.04, 0.35);
  }
}

/** Един общ инстанс за цялата игра (оцелява при рестарт на сцената). */
export const sfx = new Sfx();

/** Звук за натиснат бутон (менюто и HUD бутоните го викат направо). */
export function uiClick(): void {
  sfx.unlock();
  sfx.uiClick();
}

/** Звук при посочване на бутон с мишката. */
export function uiHover(): void {
  sfx.uiHover();
}
