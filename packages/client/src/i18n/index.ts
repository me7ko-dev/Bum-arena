/**
 * Минимална система за преводи.
 *
 * Всички текстове, които вижда играчът, са в src/locales/<език>.json.
 * В кода се ползва само t('ключ') или t('ключ', { n: 5 }) → „{n}“ се заменя.
 * За нов език: добави JSON файл и го регистрирай в LOCALES.
 */
import bg from '../locales/bg.json';
import en from '../locales/en.json';

export type Lang = 'bg' | 'en';
type Dict = Record<string, string>;

const LOCALES: Record<Lang, Dict> = { bg, en };
const STORAGE_KEY = 'bum.lang';

let current: Lang = detectLang();
const listeners = new Set<(lang: Lang) => void>();

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'bg' || saved === 'en') return saved;
  } catch {
    // localStorage може да липсва (частен режим) – не е проблем.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'bg';
  return nav.startsWith('bg') ? 'bg' : 'en';
}

/** Превежда ключ. Ако липсва превод – връща английския, а после самия ключ. */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = LOCALES[current][key] ?? LOCALES.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // няма значение
  }
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}

export function toggleLang(): void {
  setLang(current === 'bg' ? 'en' : 'bg');
}

/** Абонамент за смяна на езика (напр. за прерисуване на HUD). Връща функция за отписване. */
export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
