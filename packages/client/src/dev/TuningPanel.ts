/**
 * Панел за настройка на баланса на живо (lil-gui).
 *
 * Отваря се с клавиша ` (над Tab) или с ?tune в адреса (удобно за телефон).
 * Промените важат веднага, защото светът чете BALANCE по референция.
 * Когато намериш добри стойности: „Копирай стойностите“ и ги постави в
 * packages/shared/src/config/balance.ts (панелът НЕ ги записва сам).
 */
import GUI from 'lil-gui';
import { BALANCE, cloneBalance } from '@bum/shared';
import { FEEL } from '../config/feel';

/** Заглавия на секциите. Имената на полетата са като в balance.ts, за да ги намираш лесно. */
const SECTION_TITLES: Record<string, string> = {
  sim: 'Симулация',
  player: 'Човече',
  hit: 'Удари',
  abilities: 'Суперсили',
  coins: 'Монети',
  bots: 'Ботове (от следващия рунд)',
  round: 'Рунд',
  arena: 'Арена',
};

type Obj = Record<string, unknown>;

export class TuningPanel {
  private gui: GUI;
  private readonly defaults = cloneBalance(BALANCE);
  private readonly feelDefaults = { ...FEEL };

  constructor(onRestart: () => void) {
    this.gui = new GUI({ title: 'Баланс (` за скриване)', width: 320 });
    this.gui.domElement.style.zIndex = '1000';

    this.gui.add({ restart: onRestart }, 'restart').name('▶ Нов рунд');
    this.gui.add({ copy: () => this.copy() }, 'copy').name('📋 Копирай стойностите');
    this.gui.add({ reset: () => this.reset() }, 'reset').name('↺ Нулирай');

    for (const [key, value] of Object.entries(BALANCE)) {
      const folder = this.gui.addFolder(SECTION_TITLES[key] ?? key);
      this.addObject(folder, value as Obj);
      folder.close();
    }
    const feel = this.gui.addFolder('Усещане (само визуално)');
    this.addObject(feel, FEEL as unknown as Obj);
    feel.close();

    this.setVisible(shouldStartVisible());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') this.setVisible(this.gui._hidden);
    });
  }

  /** Рекурсивно добавя полетата: числа → плъзгачи, true/false → отметка, обекти → подпапки. */
  private addObject(folder: GUI, obj: Obj): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        const isInt = Number.isInteger(value) && Math.abs(value) >= 10;
        const max = value === 0 ? 1 : Math.abs(value) * 3;
        const min = key === 'tickRate' || key === 'substeps' ? 1 : 0;
        folder.add(obj, key, min, max, isInt || key === 'tickRate' || key === 'substeps' ? 1 : 0.01);
      } else if (typeof value === 'boolean') {
        folder.add(obj, key);
      } else if (value && typeof value === 'object') {
        const sub = folder.addFolder(key);
        this.addObject(sub, value as Obj);
        sub.close();
      }
    }
  }

  private setVisible(v: boolean): void {
    if (v) this.gui.show();
    else this.gui.hide();
  }

  /** Копира текущите стойности като JSON – за поставяне в balance.ts. */
  private copy(): void {
    const text = JSON.stringify({ BALANCE, FEEL }, null, 2);
    const fallback = () => window.prompt('Копирай стойностите:', text);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  /** Връща стойностите от файла (както са били при зареждане на страницата). */
  private reset(): void {
    deepAssign(BALANCE as unknown as Obj, this.defaults as unknown as Obj);
    Object.assign(FEEL, this.feelDefaults);
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
}

function deepAssign(target: Obj, src: Obj): void {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object') deepAssign(target[k] as Obj, v as Obj);
    else target[k] = v;
  }
}

function shouldStartVisible(): boolean {
  return new URLSearchParams(location.search).has('tune');
}
