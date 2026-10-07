import { describe, expect, it } from 'vitest';
import type { InputMessage, PlayerInput, ShopItemId } from '@bum/shared';
import type { InputSource } from '../game/Match';
import { InputSender } from './InputSender';

/** Като HumanInput: натискането и покупката се „запомнят“ до consumeAbility(). */
class FakeInput implements InputSource {
  mx = 0;
  my = 0;
  held = false;
  latch = false;
  buy: ShopItemId | null = null;
  read(): PlayerInput {
    return { mx: this.mx, my: this.my, ability: this.held || this.latch, buy: this.buy };
  }
  consumeAbility(): void {
    this.latch = false;
    this.buy = null;
  }
  tap(): void {
    this.latch = true;
  }
}

function run(sender: InputSender, input: FakeInput, from: number, to: number, fps: number, each?: (now: number) => void) {
  for (let now = from; now < to; now += 1 / fps) {
    each?.(now);
    sender.update(now, input);
  }
}

describe('InputSender', () => {
  it('без промяна праща само пулс на 200 ms', () => {
    const sent: InputMessage[] = [];
    const s = new InputSender((m) => sent.push(m));
    run(s, new FakeInput(), 0, 2, 60);
    // Първото + пулс на всеки 0.2 сек.
    expect(sent.length).toBeGreaterThanOrEqual(10);
    expect(sent.length).toBeLessThanOrEqual(11);
  });

  it('при постоянна промяна – не повече от ~30 съобщения в секунда (и при 144 FPS)', () => {
    const sent: InputMessage[] = [];
    const s = new InputSender((m) => sent.push(m));
    const input = new FakeInput();
    let k = 0;
    run(s, input, 0, 3, 144, () => {
      input.mx = Math.sin(k++ * 0.1);
    });
    expect(sent.length).toBeGreaterThan(80);
    expect(sent.length).toBeLessThanOrEqual(91);
  });

  it('кратко докосване на суперсилата не се губи и се държи поне minHold', () => {
    const sent: { at: number; m: InputMessage }[] = [];
    let clock = 0;
    const s = new InputSender((m) => sent.push({ at: clock, m }), { minHold: 0.1 });
    const input = new FakeInput();
    for (clock = 0; clock < 1; clock += 1 / 60) {
      // Докосване между два тика: натиснато и пуснато, преди да е прочетено.
      if (Math.abs(clock - 0.5) < 1e-6 || (clock > 0.5 && clock < 0.5 + 1 / 60)) input.tap();
      s.update(clock, input);
    }
    const presses = sent.filter((x) => x.m.a === 1);
    expect(presses.length).toBe(1);
    const release = sent.find((x) => x.at > presses[0]!.at && x.m.a === 0)!;
    expect(release.at - presses[0]!.at).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('покупката се праща точно веднъж, дори без друга промяна', () => {
    const sent: InputMessage[] = [];
    const s = new InputSender((m) => sent.push(m));
    const input = new FakeInput();
    run(s, input, 0, 1, 60, (now) => {
      if (Math.abs(now - 0.31) < 0.009) input.buy = 'speed';
    });
    expect(sent.filter((m) => m.b === 'speed').length).toBe(1);
    expect(sent.filter((m) => m.b !== undefined).length).toBe(1);
  });

  it('задържан бутон се праща като a:1, пускането като a:0', () => {
    const sent: InputMessage[] = [];
    const s = new InputSender((m) => sent.push(m));
    const input = new FakeInput();
    run(s, input, 0, 1, 60, (now) => {
      input.held = now > 0.2 && now < 0.6;
    });
    const as = sent.map((m) => m.a);
    // 0 … 1 … 0 – точно една смяна нагоре и една надолу.
    const ups = as.filter((a, i) => i > 0 && a === 1 && as[i - 1] === 0).length;
    const downs = as.filter((a, i) => i > 0 && a === 0 && as[i - 1] === 1).length;
    expect(ups).toBe(1);
    expect(downs).toBe(1);
  });
});
