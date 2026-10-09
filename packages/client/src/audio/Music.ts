/**
 * Фонова музика, синтезирана с Web Audio – без файлове.
 *
 * Как работи: „планировчик с поглед напред“ – на всеки ~40 ms проверяваме кои
 * шестнайсетини ще прозвучат през следващите ~0.2 сек и ги нареждаме точно
 * по часовника на AudioContext (а не по setTimeout – той „плава“).
 * Всяка нота е кратък осцилатор/шум, който сам се освобождава → малко CPU.
 *
 * Режими: 'menu' (по-мек цикъл), 'game' (бодър, ~124 BPM, няколко части),
 * 'off'. Плюс еднократни: riser (при отброяването) и джингъл (победа/край).
 * Звукът е общ с ефектите: sfx.muted изключва и музиката.
 */
import { sfx } from './Sfx';

// ───────────── Настройки на музиката ─────────────

export const MUSIC = {
  /** Обща сила на музиката (0..1) – под ефектите, за да не ги заглушава. */
  volume: 0.38,
  /** Темпо на играта (удара в минута). */
  gameBpm: 124,
  /** С колко се ускорява в напрегнатия край (последните 30 сек / свиване). */
  intenseBpmBoost: 6,
  /** Темпо на менюто. */
  menuBpm: 98,
  /** Филтър на целия микс: нормално и при напрежение (Hz) – „отваря се“ звукът. */
  filterNormal: 4200,
  filterIntense: 15000,
  /** Колко напред нареждаме ноти (сек) и колко често проверяваме (ms). */
  lookAhead: 0.2,
  tickMs: 40,
};

export type MusicMode = 'off' | 'menu' | 'game';

// ───────────── Ноти и шаблони ─────────────

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'E5' → MIDI номер (C4 = 60); '.' → null (пауза), '-' → -1 (задържане). */
function midi(tok: string): number | null {
  if (tok === '.') return null;
  if (tok === '-') return -1;
  const m = /^([A-G])(#?)(\d)$/.exec(tok);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]!]! + (m[2] ? 1 : 0);
}

/** Ред от 16 стъпки („E5 . G5 - …“) → масив. */
function bar(s: string): (number | null)[] {
  const out = s.trim().split(/\s+/).map(midi);
  while (out.length < 16) out.push(null);
  return out.slice(0, 16);
}

const freq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Акорди на играта: C – G – Am – F (весело, „поп“ последователност). */
const GAME_CHORDS = [
  { bass: 48, notes: [60, 64, 67] },
  { bass: 43, notes: [59, 62, 67] },
  { bass: 45, notes: [57, 60, 64] },
  { bass: 41, notes: [57, 60, 65] },
];

/** Мелодия A – запомнящата се „кукичка“. */
const MELODY_A = [
  bar('E5 . G5 . C6 - G5 . A5 G5 E5 . G5 - . .'),
  bar('D5 . G5 . B5 - G5 . D6 . B5 . G5 - . .'),
  bar('C5 . E5 . A5 - E5 . C6 B5 A5 . E5 - . .'),
  bar('F5 . A5 . C6 - A5 . G5 . E5 . D5 . C5 .'),
];
/** Мелодия B – „въпрос и отговор“, по-ритмична. */
const MELODY_B = [
  bar('G5 G5 . E5 . G5 . A5 - . G5 . E5 . C5 .'),
  bar('D5 D5 . B4 . D5 . G5 - . F5 . E5 . D5 .'),
  bar('E5 E5 . C5 . E5 . A5 - . G5 . E5 . C5 .'),
  bar('F5 . A5 . G5 . F5 . E5 . D5 . E5 - - .'),
];

/** Бас: R – основен тон, O – октава нагоре, F – квинта. */
const BASS_GAME = 'R . . R . . R . R . O R . . F .'.split(' ');

/** Части на песента (по 4 такта). Нормално: A B A C (C = „пауза преди дропа“). */
type Section = 'A' | 'B' | 'C';
const FORM_NORMAL: Section[] = ['A', 'B', 'A', 'C'];
const FORM_INTENSE: Section[] = ['A', 'B', 'B', 'A'];

/** Акорди на менюто: Am – F – C – G (по-мечтателно). */
const MENU_CHORDS = [
  { bass: 45, notes: [57, 60, 64] },
  { bass: 41, notes: [53, 57, 60] },
  { bass: 48, notes: [55, 60, 64] },
  { bass: 43, notes: [55, 59, 62] },
];
const MENU_MELODY = [
  bar('. . . . E5 - - . D5 . C5 . . . A4 .'),
  bar('C5 - - . . . . . . . A4 . C5 . F5 .'),
  bar('E5 - - . . . G5 . E5 . D5 . C5 . . .'),
  bar('D5 - - . . . . . B4 . G4 . B4 . D5 .'),
];

// ───────────── Музиката ─────────────

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private drums: GainNode | null = null;
  private synth: GainNode | null = null;
  private echo: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private mode: MusicMode = 'off';
  private step = 0;
  private nextTime = 0;
  /** Докато свири джингъл, цикълът мълчи (ctx време). */
  private pauseUntil = 0;
  private intensity = 0;
  /** Към каква сила върви изходът в момента (за да не трупаме автоматизации). */
  private gainTarget = -1;

  constructor() {
    sfx.onUnlock((ctx) => this.init(ctx));
  }

  /** Сменя цикъла. Започва от начало на такт (веднага). */
  play(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.ctx) this.nextTime = Math.max(this.ctx.currentTime + 0.05, this.pauseUntil);
    this.ensureTimer();
  }

  /** 0 = нормално, 1 = напрегнато (по-бързи чинели, по-отворен звук, малко по-бързо). */
  setIntensity(v: number): void {
    const k = Math.max(0, Math.min(1, v));
    if (k === this.intensity) return;
    this.intensity = k;
    if (this.ctx && this.filter) {
      const f = MUSIC.filterNormal + (MUSIC.filterIntense - MUSIC.filterNormal) * k;
      this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.6);
    }
  }

  /**
   * Нарастващо напрежение (шум, който се „изкачва“, + барабанна дроб) за seconds сек –
   * при отброяването 3-2-1. Спира точно на „БУМ!“.
   */
  riser(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || sfx.muted || seconds < 0.3) return;
    const t0 = ctx.currentTime + 0.02;
    const end = t0 + seconds;
    const noise = this.noiseSrc(t0, seconds);
    if (noise) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2.5;
      f.frequency.setValueAtTime(300, t0);
      f.frequency.exponentialRampToValueAtTime(5000, end);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, end - 0.02);
      g.gain.linearRampToValueAtTime(0, end);
      noise.connect(f).connect(g).connect(this.synth!);
    }
    // Барабанна дроб: все по-гъста и по-силна.
    let t = t0;
    while (t < end - 0.05) {
      const k = (t - t0) / seconds;
      this.snare(t, 0.05 + 0.25 * k);
      t += 0.25 - 0.18 * k;
    }
  }

  /** Кратък джингъл; после продължава с цикъла then (по подразбиране менюто). */
  jingle(kind: 'victory' | 'end', then: MusicMode = 'menu'): void {
    const ctx = this.ctx;
    this.mode = then;
    this.step = 0;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const beat = 60 / 150;
    let dur: number;
    if (!sfx.muted) {
      if (kind === 'victory') {
        // та-да-да-ДААА … та-да-ДАААААА!
        const run = [72, 76, 79];
        run.forEach((m, i) => this.lead(t0 + i * beat * 0.33, m, beat * 0.3, 0.12));
        this.lead(t0 + beat, 84, beat * 1.4, 0.13);
        this.chord(t0 + beat, [60, 64, 67], beat * 1.5, 0.05);
        this.kick(t0 + beat, 0.6);
        this.crash(t0 + beat, 0.25);
        [81, 83].forEach((m, i) => this.lead(t0 + beat * (2.5 + i * 0.5), m, beat * 0.4, 0.12));
        this.lead(t0 + beat * 3.5, 84, beat * 2.4, 0.14);
        this.lead(t0 + beat * 3.5, 88, beat * 2.4, 0.07);
        this.chord(t0 + beat * 3.5, [60, 64, 67, 72], beat * 2.6, 0.06);
        this.bass(t0 + beat * 3.5, 36, beat * 2.4, 0.16);
        this.kick(t0 + beat * 3.5, 0.7);
        this.crash(t0 + beat * 3.5, 0.3);
        for (let i = 0; i < 8; i++) this.snare(t0 + beat * (2.5 + i * 0.125), 0.08 + i * 0.03);
        dur = beat * 6.5;
      } else {
        // Кратко „край на рунда“ – весело, но по-скромно.
        [67, 72, 76, 79].forEach((m, i) => this.lead(t0 + i * beat * 0.25, m, beat * 0.22, 0.09));
        this.lead(t0 + beat, 84, beat * 1.4, 0.1);
        this.chord(t0 + beat, [60, 65, 69], beat * 0.6, 0.04);
        this.chord(t0 + beat * 1.5, [60, 64, 67], beat * 1.5, 0.05);
        this.kick(t0 + beat, 0.5);
        this.crash(t0 + beat * 1.5, 0.18);
        dur = beat * 3.5;
      }
    } else {
      dur = beat * 3;
    }
    this.pauseUntil = t0 + dur;
    this.nextTime = this.pauseUntil;
    this.ensureTimer();
  }

  // ───────────── Вътрешни ─────────────

  private init(ctx: AudioContext): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = MUSIC.filterNormal;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.out);
    this.drums = ctx.createGain();
    this.drums.connect(this.filter);
    this.synth = ctx.createGain();
    this.synth.connect(this.filter);
    // Ехо (дилей) за мелодията – „пространство“ без тежък reverb.
    this.echo = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / MUSIC.gameBpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.echo.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(this.filter);
    this.nextTime = ctx.currentTime + 0.1;
    this.ensureTimer();
  }

  private ensureTimer(): void {
    if (this.timer || !this.ctx) return;
    this.timer = setInterval(() => this.tick(), MUSIC.tickMs);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const now = ctx.currentTime;
    const target = sfx.muted ? 0 : MUSIC.volume;
    if (target !== this.gainTarget) {
      this.gainTarget = target;
      this.out.gain.setTargetAtTime(target, now, 0.15);
    }
    if (this.mode === 'off' && now > this.pauseUntil + 1) {
      // Нищо не свири – спираме проверките (CPU). play() ги пуска пак.
      clearInterval(this.timer!);
      this.timer = null;
      return;
    }
    if (now < this.pauseUntil - MUSIC.lookAhead) return;
    // Скрит таб / забавяне – не „наваксваме“ пропуснатото, продължаваме оттук.
    if (this.nextTime < now - 0.05) this.nextTime = now + 0.05;
    const silent = sfx.muted || (typeof document !== 'undefined' && document.hidden);
    while (this.nextTime < now + MUSIC.lookAhead) {
      if (!silent && this.mode !== 'off') this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur();
      this.step++;
    }
  }

  /** Продължителност на една шестнайсетина. */
  private stepDur(): number {
    const bpm = this.mode === 'menu' ? MUSIC.menuBpm : MUSIC.gameBpm + MUSIC.intenseBpmBoost * this.intensity;
    return 60 / bpm / 4;
  }

  private scheduleStep(step: number, t: number): void {
    if (this.mode === 'game') this.gameStep(step, t);
    else if (this.mode === 'menu') this.menuStep(step, t);
  }

  /** Една стъпка от песента на играта. */
  private gameStep(step: number, t: number): void {
    const s = step % 16;
    const barN = Math.floor(step / 16);
    const form = this.intensity > 0.5 ? FORM_INTENSE : FORM_NORMAL;
    const section = form[Math.floor(barN / 4) % form.length]!;
    const barInSection = barN % 4;
    const chord = GAME_CHORDS[barN % 4]!;
    const sd = this.stepDur();
    const hot = this.intensity > 0.5;

    // ── Барабани ──
    if (section === 'C') {
      // „Пауза преди дропа“: рядък барабан, а последният такт – дроб, която расте.
      if (s === 0 || (s === 8 && barInSection < 3)) this.kick(t, 0.45);
      if (barInSection === 3) {
        if (s >= 8 || s % 2 === 0) this.snare(t, 0.05 + 0.2 * (s / 16));
      } else if (s % 4 === 2) this.hat(t, 0.03, false);
    } else {
      if (s % 4 === 0) this.kick(t, 0.55);
      if (s === 4 || s === 12) this.clap(t, 0.2);
      if (hot) this.hat(t, s % 2 === 0 ? 0.035 : 0.06, s % 4 === 2);
      else if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.06 : 0.03, false);
      // Малък пасаж от барабани в края на всяка част.
      if (barInSection === 3 && s >= 13) this.tom(t, 0.18, 200 - (s - 13) * 30);
      if (barN % 16 === 0 && s === 0) this.crash(t, 0.14);
    }

    // ── Бас ──
    const b = BASS_GAME[s]!;
    if (b !== '.') {
      const m = b === 'O' ? chord.bass + 12 : b === 'F' ? chord.bass + 7 : chord.bass;
      const level = section === 'C' ? 0.07 : 0.12;
      if (section !== 'C' || s === 0) this.bass(t, m, section === 'C' ? sd * 14 : sd * 1.6, level);
    }

    // ── Мелодия / арпеджио ──
    if (section === 'A' || section === 'B') {
      const mel = (section === 'A' ? MELODY_A : MELODY_B)[barInSection]!;
      const m = mel[s];
      if (m !== null && m !== undefined && m >= 0) {
        let len = 1;
        while (s + len < 16 && mel[s + len] === -1) len++;
        this.lead(t, m, sd * len * 0.92, 0.075);
      }
      // Тихи акорди на 2 и 4 („ска“ удар) – пълнят звука.
      if (s === 4 || s === 12 || (hot && (s === 6 || s === 14))) this.chord(t, chord.notes, sd * 1.2, 0.022);
    } else {
      // Арпеджио в паузата.
      const n = chord.notes[s % 3]! + (s % 6 >= 3 ? 12 : 0);
      this.pluck(t, n, sd * 1.5, 0.05);
    }
    if (hot && s % 2 === 1) this.pluck(t, chord.notes[(s >> 1) % 3]! + 24, sd * 0.8, 0.018);
  }

  /** Една стъпка от цикъла на менюто (по-спокойно). */
  private menuStep(step: number, t: number): void {
    const s = step % 16;
    const barN = Math.floor(step / 16);
    const chord = MENU_CHORDS[barN % 4]!;
    const sd = this.stepDur();
    if (s === 0 || s === 10) this.kick(t, 0.3);
    if (s === 4 || s === 12) this.rim(t, 0.08);
    if (s % 2 === 1) this.hat(t, 0.018, false);
    if (s === 0) {
      this.pad(t, chord.notes, sd * 16, 0.028);
      this.bass(t, chord.bass, sd * 3, 0.08);
    }
    if (s === 6 || s === 8 || s === 14) this.bass(t, chord.bass + (s === 14 ? 7 : 0), sd * 1.5, 0.06);
    if (s % 2 === 0) this.pluck(t, chord.notes[(s / 2) % 3]! + 12, sd * 2, 0.025);
    // Мелодията влиза през 8 такта (4 с, 4 без) – да не омръзва.
    if (Math.floor(barN / 4) % 2 === 1) {
      const m = MENU_MELODY[barN % 4]![s];
      if (m !== null && m !== undefined && m >= 0) {
        let len = 1;
        while (s + len < 16 && MENU_MELODY[barN % 4]![s + len] === -1) len++;
        this.bell(t, m, sd * len + 0.3, 0.06);
      }
    }
  }

  // ───────────── Инструменти ─────────────

  private noiseSrc(t: number, dur: number): AudioBufferSourceNode | null {
    const buf = sfx.noise05;
    if (!this.ctx || !buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = dur > 0.45;
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
    return src;
  }

  private env(t: number, peak: number, attack: number, dur: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    g.connect(dest);
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private kick(t: number, vol: number): void {
    const g = this.env(t, vol, 0.003, 0.28, this.drums!);
    const o = this.osc('sine', 150, t, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  }

  private clap(t: number, vol: number): void {
    const src = this.noiseSrc(t, 0.16);
    if (!src) return;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 0.9;
    src.connect(f).connect(this.env(t, vol, 0.002, 0.14, this.drums!));
    this.osc('triangle', 220, t, 0.05, this.env(t, vol * 0.4, 0.002, 0.05, this.drums!));
  }

  private snare(t: number, vol: number): void {
    const src = this.noiseSrc(t, 0.12);
    if (!src) return;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1200;
    src.connect(f).connect(this.env(t, vol, 0.002, 0.1, this.drums!));
    this.osc('triangle', 190, t, 0.06, this.env(t, vol * 0.5, 0.002, 0.06, this.drums!));
  }

  private rim(t: number, vol: number): void {
    this.osc('square', 1700, t, 0.03, this.env(t, vol, 0.001, 0.03, this.drums!));
    this.osc('triangle', 420, t, 0.05, this.env(t, vol, 0.001, 0.05, this.drums!));
  }

  private hat(t: number, vol: number, open: boolean): void {
    const dur = open ? 0.16 : 0.035;
    const src = this.noiseSrc(t, dur);
    if (!src) return;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    src.connect(f).connect(this.env(t, vol, 0.001, dur, this.drums!));
  }

  private crash(t: number, vol: number): void {
    const src = this.noiseSrc(t, 1.2);
    if (!src) return;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5000;
    src.connect(f).connect(this.env(t, vol, 0.003, 1.1, this.drums!));
  }

  private tom(t: number, vol: number, f0: number): void {
    const o = this.osc('sine', f0, t, 0.2, this.env(t, vol, 0.002, 0.18, this.drums!));
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.18);
  }

  /** Бас: квадратна вълна през филтър, който се затваря – „дръпнат“ звук. */
  private bass(t: number, m: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.25, dur));
    f.connect(this.env(t, vol, 0.004, dur, this.synth!));
    this.osc('square', freq(m), t, dur, f);
  }

  /** Водещата мелодия: квадрат + тих триъгълник октава по-ниско, с ехо. */
  private lead(t: number, m: number, dur: number, vol: number): void {
    const g = this.env(t, vol, 0.008, dur, this.synth!);
    g.connect(this.echo!);
    const f = this.ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    f.connect(g);
    this.osc('square', freq(m), t, dur, f);
    this.osc('triangle', freq(m - 12), t, dur, this.env(t, vol * 0.8, 0.008, dur, this.synth!));
  }

  private pluck(t: number, m: number, dur: number, vol: number): void {
    const g = this.env(t, vol, 0.003, dur, this.synth!);
    g.connect(this.echo!);
    this.osc('triangle', freq(m), t, dur, g);
  }

  private bell(t: number, m: number, dur: number, vol: number): void {
    const g = this.env(t, vol, 0.004, dur, this.synth!);
    g.connect(this.echo!);
    this.osc('sine', freq(m), t, dur, g);
    this.osc('sine', freq(m + 12), t, dur * 0.5, this.env(t, vol * 0.3, 0.004, dur * 0.5, this.synth!));
  }

  private chord(t: number, notes: readonly number[], dur: number, vol: number): void {
    for (const m of notes) this.osc('triangle', freq(m), t, dur, this.env(t, vol, 0.006, dur, this.synth!));
  }

  private pad(t: number, notes: readonly number[], dur: number, vol: number): void {
    for (const m of notes) {
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      g.connect(this.synth!);
      this.osc('triangle', freq(m), t, dur, g);
      this.osc('sine', freq(m) * 1.004, t, dur, g); // лек „хорус“
    }
  }
}

/** Един общ инстанс (оцелява при смяна на сцените). */
export const music = new Music();

/** Какво трябва да знае музиката за рунда (виж RoundMusic). */
export interface RoundMusicState {
  phase: 'countdown' | 'playing' | 'ended';
  /** Онлайн лоби / чакаме сървъра. */
  waiting: boolean;
  /** Секунди до старта (по време на отброяването). */
  countdownLeft: number;
  /** Секунди до края на рунда. */
  timeLeft: number;
  /** Арената се свива в момента. */
  shrinking: boolean;
  /** Печелиш ли (в края). */
  iWon: boolean;
}

/**
 * Музиката следва рунда (по един за всяка GameScene):
 * лоби → менюто; отброяване → тишина + „riser“; игра → бодрият цикъл
 * (по-напрегнат в последните 30 сек и докато арената се свива); край → джингъл → менюто.
 */
export class RoundMusic {
  private last: string | null = null;

  update(s: RoundMusicState): void {
    const key = s.waiting ? 'waiting' : s.phase;
    const changed = key !== this.last;
    this.last = key;
    if (key === 'waiting') {
      music.play('menu');
    } else if (s.phase === 'countdown') {
      if (changed) {
        music.play('off');
        music.riser(s.countdownLeft);
      }
    } else if (s.phase === 'playing') {
      music.play('game');
      music.setIntensity(s.timeLeft <= 30 || s.shrinking ? 1 : 0);
    } else if (changed) {
      music.setIntensity(0);
      music.jingle(s.iWon ? 'victory' : 'end', 'menu');
    }
  }
}
