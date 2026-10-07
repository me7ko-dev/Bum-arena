import type { InputMessage } from '@bum/shared';
import type { InputSource } from '../game/Match';

export interface InputSenderOptions {
  /** Колко често проверяваме входа (сек) – веднъж на тик на сървъра. */
  interval?: number;
  /** Без промяна – „пулс“ на толкова секунди (сървърът знае, че сме тук). */
  heartbeat?: number;
  /**
   * Натиснат бутон за суперсила се праща като задържан поне толкова секунди.
   * Иначе кратко докосване (натискане и пускане между два тика на сървъра)
   * може да пристигне заедно с пускането и сървърът да не го види.
   */
  minHold?: number;
}

/** Закръгляне на посоката – по-малко съобщения от треперещ джойстик, по-малко байтове. */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Праща входа на човека към сървъра ('i'): до веднъж на тик, само при промяна
 * или като пулс. Натискане на суперсилата и покупка не се губят: четем входа
 * (с „запомненото“ натискане от HumanInput) и чак тогава викаме consumeAbility().
 */
export class InputSender {
  private readonly interval: number;
  private readonly heartbeat: number;
  private readonly minHold: number;
  private lastCheck = -Infinity;
  private lastSentAt = -Infinity;
  private last: InputMessage | null = null;
  /** Кога сме пратили натискането (a: 0 → 1). */
  private pressAt = -Infinity;

  constructor(
    private readonly send: (msg: InputMessage) => void,
    opts: InputSenderOptions = {},
  ) {
    this.interval = opts.interval ?? 1 / 30;
    this.heartbeat = opts.heartbeat ?? 0.2;
    this.minHold = opts.minHold ?? 0.1;
  }

  /** Вика се всеки кадър; now – местно време в секунди. */
  update(now: number, input: InputSource): void {
    // Малък толеранс: при 60 FPS проверката е точно на всеки втори кадър.
    if (now - this.lastCheck < this.interval - 0.002) return;
    this.lastCheck = now - this.lastCheck < this.interval * 2 ? this.lastCheck + this.interval : now;

    const raw = input.read();
    input.consumeAbility();
    const msg: InputMessage = { mx: round2(raw.mx), my: round2(raw.my), a: raw.ability ? 1 : 0 };

    const last = this.last;
    if (msg.a === 1) {
      if (last?.a !== 1) this.pressAt = now;
    } else if (last?.a === 1 && now - this.pressAt < this.minHold) {
      msg.a = 1; // задържаме натискането още малко
    }

    const changed = !last || msg.mx !== last.mx || msg.my !== last.my || msg.a !== last.a;
    if (!changed && !raw.buy && now - this.lastSentAt < this.heartbeat) return;

    this.last = { ...msg };
    if (raw.buy) msg.b = raw.buy;
    this.lastSentAt = now;
    this.send(msg);
  }

  /** Нов рунд: следващият вход се праща веднага. */
  reset(): void {
    this.lastCheck = -Infinity;
    this.lastSentAt = -Infinity;
    this.last = null;
    this.pressAt = -Infinity;
  }
}
