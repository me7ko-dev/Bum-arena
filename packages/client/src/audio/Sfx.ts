/**
 * Звукови ефекти, синтезирани с Web Audio – без файлове.
 * Целта е бързо да чуем „усещането“. По-късно (етап 6) се заменят с истински CC0 звуци.
 *
 * Браузърите разрешават звук само след първо докосване/клавиш → unlock().
 */
import { FEEL } from '../config/feel';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
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
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Подготвя изход с дадена сила и позиция в стерео (-1..1). null ако звукът е изключен. */
  private out(volume: number, pan = 0): { ctx: AudioContext; node: AudioNode; t: number } | null {
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

  private tone(o: { ctx: AudioContext; node: AudioNode; t: number }, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
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

  private noise(o: { ctx: AudioContext; node: AudioNode; t: number }, freq: number, q: number, dur: number, vol: number, delay = 0): void {
    if (!this.noiseBuffer) return;
    const src = o.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = o.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = o.ctx.createGain();
    const t = o.t + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(o.node);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** „БУМ“ при удар. strength 0..1. */
  hit(strength: number, volume: number, pan: number): void {
    const o = this.out(volume * (0.35 + strength * 0.65), pan);
    if (!o) return;
    this.tone(o, 'sine', 160 + strength * 40, 45, 0.12 + strength * 0.15, 0.9);
    this.noise(o, 900 + strength * 1400, 1.2, 0.08 + strength * 0.1, 0.6);
    if (strength > 0.6) this.tone(o, 'square', 90, 40, 0.18, 0.25);
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

  /** Взета монета – „блинг“. pitch расте при бързо събиране (серия). */
  coin(volume: number, pan: number, pitch = 1): void {
    const o = this.out(volume * 0.3, pan);
    if (!o) return;
    this.tone(o, 'square', 988 * pitch, 988 * pitch, 0.05, 0.35);
    this.tone(o, 'square', 1319 * pitch, 1319 * pitch, 0.12, 0.35, 0.05);
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

  /** Отброяване: 3, 2, 1 – кратко „бийп“; 0 – „старт“. */
  countdown(n: number): void {
    const o = this.out(0.45);
    if (!o) return;
    if (n > 0) this.tone(o, 'square', 660, 660, 0.12, 0.3);
    else {
      this.tone(o, 'square', 990, 990, 0.08, 0.3);
      this.tone(o, 'square', 1320, 1320, 0.3, 0.3, 0.08);
    }
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

  /** Падане от ръба – спускащо се свирене. */
  fall(volume: number, pan: number): void {
    const o = this.out(volume * 0.5, pan);
    if (!o) return;
    this.tone(o, 'triangle', 820, 110, 0.7, 0.6);
  }

  /** Избутал си някого – кратка победна нотка. */
  knockout(): void {
    const o = this.out(0.5);
    if (!o) return;
    this.tone(o, 'square', 660, 660, 0.08, 0.25);
    this.tone(o, 'square', 990, 990, 0.14, 0.25, 0.08);
  }
}

/** Един общ инстанс за цялата игра (оцелява при рестарт на сцената). */
export const sfx = new Sfx();
