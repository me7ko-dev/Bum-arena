/**
 * Главното меню – HTML/CSS слой над Phaser платното (не е Phaser сцена).
 *
 * Играчът избира име, герой (скин) и суперсила и натиска „ИГРАЙ“.
 * Всяка промяна се записва веднага (saveSettings). Текстовете идват от t('menu.*')
 * и се прерисуват при смяна на езика.
 */
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './menu.css';
import { ABILITY_IDS, type AbilityId } from '@bum/shared';
import {
  loadSettings,
  saveSettings,
  SKINS,
  ABILITY_INFO,
  type PlayerSettings,
} from '../game/settings';
import { t, toggleLang, onLangChange } from '../i18n';
import { sfx } from '../audio/Sfx';
import { PLAYER_COLORS } from '../theme';

export interface MenuOptions {
  /** Вика се, когато играчът натисне „ИГРАЙ“ (или Enter). */
  onPlay(settings: PlayerSettings): void;
}

// ---------------------------------------------------------------------------
// Спрайтове от атласа като DOM елементи
// ---------------------------------------------------------------------------

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Atlas {
  frames: Record<string, Frame>;
  w: number;
  h: number;
}

const ASSETS = `${import.meta.env.BASE_URL}assets/`;
let atlasPromise: Promise<Atlas> | null = null;

/** Зарежда sprites.json веднъж (Vite не позволява import от public/). */
function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= fetch(`${ASSETS}sprites.json`)
    .then(
      (r) =>
        r.json() as Promise<{
          frames: Record<string, { frame: Frame }>;
          meta: { size: { w: number; h: number } };
        }>,
    )
    .then((d) => {
      const frames: Record<string, Frame> = {};
      for (const [name, f] of Object.entries(d.frames)) frames[name] = f.frame;
      return { frames, w: d.meta.size.w, h: d.meta.size.h };
    })
    .catch(() => ({ frames: {}, w: 1, h: 1 })); // без атлас менюто пак работи, просто без картинки
  return atlasPromise;
}

/** Слага кадър от атласа като фон на елемента (мащабиран до sizePx). */
function setSprite(el: HTMLElement, frame: string, sizePx: number): void {
  el.dataset.frame = frame;
  const thumb = skinThumbs?.get(frame);
  if (thumb) {
    el.style.backgroundImage = `url("${thumb}")`;
    el.style.backgroundSize = 'contain';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';
    return;
  }
  void loadAtlas().then((atlas) => {
    const f = atlas.frames[frame];
    if (!f || el.dataset.frame !== frame || skinThumbs?.has(frame)) return; // междувременно е сменен
    const k = sizePx / f.w;
    el.style.backgroundImage = `url("${ASSETS}sprites.webp")`;
    el.style.backgroundSize = `${atlas.w * k}px ${atlas.h * k}px`;
    el.style.backgroundPosition = `${-f.x * k}px ${-f.y * k}px`;
  });
}

/** 3D снимки на героите (скин → data URL). Ако ги няма – показва се емоджито. */
let skinThumbs: Map<string, string> | null = null;

/** Подава 3D снимките на героите (вика се от main.ts след зареждане). */
export function setSkinThumbnails(thumbs: Map<string, string>): void {
  if (thumbs.size === 0) return;
  skinThumbs = thumbs;
  document.querySelectorAll<HTMLElement>('.bm-sprite[data-frame^="skin_"]').forEach((el) => {
    setSprite(el, el.dataset.frame!, parseFloat(el.style.width));
  });
}

/** Квадратен елемент с кадър от атласа. */
export function spriteEl(frame: string, sizePx: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bm-sprite';
  el.style.width = `${sizePx}px`;
  el.style.height = `${sizePx}px`;
  setSprite(el, frame, sizePx);
  return el;
}

// ---------------------------------------------------------------------------
// Менюто
// ---------------------------------------------------------------------------

/** Цвят на кръгчето зад иконката на всяка суперсила. */
const ABILITY_COLORS: Record<AbilityId, string> = {
  dash: '#ff922b',
  magnet: '#ff5d73',
  giant: '#51cf66',
  freeze: '#66d9e8',
  shield: '#4dabf7',
};

/** Декоративни кадри, които плуват на фона: [кадър, x%, y%, размер, закъснение]. */
const FLOATERS: readonly [string, number, number, number, number][] = [
  ['coin', 6, 10, 46, 0],
  ['star', 88, 7, 40, 1.2],
  ['crown', 80, 46, 52, 2.4],
  ['coin', 12, 58, 34, 3.1],
  ['boom', 4, 86, 56, 0.6],
  ['party', 90, 84, 48, 1.8],
  ['trophy', 48, 94, 40, 2.9],
  ['star', 40, 3, 28, 4.2],
];

const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

const HERO_SKIN_PX = 88;
const SKIN_PX = 44;
const ABILITY_PX = 40;

let root: HTMLElement | null = null;
let opts: MenuOptions | null = null;
let settings: PlayerSettings = loadSettings();

/** Препратки към елементите, които се обновяват. */
let heroSkin: HTMLElement;
let logo: HTMLElement;
let nameInput: HTMLInputElement;
let skinNameLabel: HTMLElement;
let soundBtn: HTMLButtonElement;
let langBtn: HTMLButtonElement;
let hint: HTMLElement;
const skinBtns = new Map<string, HTMLButtonElement>();
const abilityBtns = new Map<AbilityId, HTMLButtonElement>();

/** Дали устройството е с докосване (за подсказката за управление). */
const isTouch = (): boolean => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Елемент с текст от превода – обновява се сам при смяна на езика. */
function i18nEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  key: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = el(tag, cls, parent);
  e.dataset.i18n = key;
  return e;
}

const skinKey = (skin: string): string => `menu.skin.${skin.replace(/^skin_/, '')}`;

function build(): HTMLElement {
  const menu = el('div');
  menu.id = 'bum-menu';
  menu.className = 'bm-hidden';

  // Фон: бавно движещи се петна, точки и плуващи иконки.
  const bg = el('div', 'bm-bg', menu);
  el('div', 'bm-blob bm-blob-a', bg);
  el('div', 'bm-blob bm-blob-b', bg);
  el('div', 'bm-blob bm-blob-c', bg);
  el('div', 'bm-dots', bg);
  for (const [frame, x, y, size, delay] of FLOATERS) {
    const f = spriteEl(frame, size);
    f.classList.add('bm-floater');
    f.style.left = `${x}%`;
    f.style.top = `${y}%`;
    f.style.animationDelay = `${-delay}s`;
    bg.appendChild(f);
  }

  const scroll = el('div', 'bm-scroll', menu);
  const layout = el('div', 'bm-layout', scroll);
  const left = el('div', 'bm-col bm-col-left', layout);
  const right = el('div', 'bm-col bm-col-right', layout);

  // 1. Лого + избраният герой
  const hero = el('header', 'bm-hero', left);
  const heroWrap = el('div', 'bm-hero-skin', hero);
  heroSkin = spriteEl(settings.skin, HERO_SKIN_PX);
  heroWrap.appendChild(heroSkin);
  el('div', 'bm-hero-shadow', heroWrap);
  logo = el('h1', 'bm-logo', hero);
  i18nEl('p', 'bm-tagline', 'menu.tagline', hero);

  // 2. Име
  const nameCard = el('section', 'bm-card bm-name', left);
  const nameLabel = i18nEl('label', 'bm-label', 'menu.nameLabel', nameCard);
  nameLabel.htmlFor = 'bm-name-input';
  nameInput = el('input', 'bm-input', nameCard);
  nameInput.id = 'bm-name-input';
  nameInput.type = 'text';
  nameInput.maxLength = 14;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.enterKeyHint = 'go';
  nameInput.addEventListener('input', () => {
    settings.name = nameInput.value.slice(0, 14);
    saveSettings(settings);
  });

  // 3. Герои
  const skinCard = el('section', 'bm-card bm-skins', right);
  const skinHead = el('div', 'bm-card-head', skinCard);
  skinHead.appendChild(spriteEl('star', 24));
  i18nEl('h2', 'bm-label', 'menu.chooseSkin', skinHead);
  skinNameLabel = el('span', 'bm-chip', skinHead);
  const skinRow = el('div', 'bm-skin-row', skinCard);
  SKINS.forEach((skin, i) => {
    const b = el('button', 'bm-skin', skinRow);
    b.type = 'button';
    b.style.setProperty(
      '--c',
      `#${PLAYER_COLORS[i % PLAYER_COLORS.length]!.toString(16).padStart(6, '0')}`,
    );
    b.appendChild(spriteEl(skin, SKIN_PX));
    b.addEventListener('click', () => selectSkin(skin));
    skinBtns.set(skin, b);
  });

  // 4. Суперсили
  const abCard = el('section', 'bm-card bm-abilities', right);
  const abHead = el('div', 'bm-card-head', abCard);
  abHead.appendChild(spriteEl('bolt', 24));
  i18nEl('h2', 'bm-label', 'menu.chooseAbility', abHead);
  const abList = el('div', 'bm-ability-list', abCard);
  for (const id of ABILITY_IDS) {
    const info = ABILITY_INFO[id];
    const b = el('button', 'bm-ability', abList);
    b.type = 'button';
    b.style.setProperty('--c', ABILITY_COLORS[id]);
    const icon = el('div', 'bm-ability-icon', b);
    icon.appendChild(spriteEl(info.icon, ABILITY_PX));
    const txt = el('div', 'bm-ability-text', b);
    i18nEl('div', 'bm-ability-name', info.nameKey, txt);
    i18nEl('div', 'bm-ability-desc', info.descKey, txt);
    el('div', 'bm-check', b).textContent = '✓';
    b.addEventListener('click', () => selectAbility(id));
    abilityBtns.set(id, b);
  }

  // 5. Голям бутон „ИГРАЙ“ (на телефон стои залепен долу)
  const playWrap = el('div', 'bm-play-wrap', left);
  const play = el('button', 'bm-play', playWrap);
  play.type = 'button';
  i18nEl('span', 'bm-play-text', 'menu.play', play);
  play.addEventListener('click', doPlay);

  // 6. Долу: език, звук, подсказка за управлението
  const foot = el('footer', 'bm-foot', left);
  const btns = el('div', 'bm-foot-btns', foot);
  langBtn = el('button', 'bm-round bm-lang', btns);
  langBtn.type = 'button';
  langBtn.addEventListener('click', () => toggleLang());
  soundBtn = el('button', 'bm-round bm-sound', btns);
  soundBtn.type = 'button';
  soundBtn.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    updateSound();
    if (!sfx.muted) sfx.ready();
  });
  hint = el('p', 'bm-hint', foot);

  // Звукът се „отключва“ при първото щракване където и да е в менюто.
  menu.addEventListener('click', () => sfx.unlock(), true);
  window.addEventListener('keydown', onKey, true);
  onLangChange(renderTexts);
  return menu;
}

/** Обновява всички текстове според текущия език. */
function renderTexts(): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => {
    e.textContent = t(e.dataset.i18n!);
  });
  nameInput.placeholder = t('menu.namePlaceholder');
  langBtn.textContent = t('langToggle');
  langBtn.setAttribute('aria-label', t('menu.changeLang'));
  langBtn.title = t('menu.changeLang');
  hint.textContent = t(isTouch() ? 'menu.controlsHintTouch' : 'menu.controlsHint');
  for (const [skin, b] of skinBtns) {
    b.setAttribute('aria-label', t(skinKey(skin)));
    b.title = t(skinKey(skin));
  }
  renderLogo();
  updateSkin();
  updateSound();
}

/** Логото – всяка буква е отделна, за да подскача на вълна. */
function renderLogo(): void {
  logo.textContent = '';
  logo.setAttribute('aria-label', t('title'));
  let i = 0;
  t('title')
    .split(' ')
    .forEach((word, w) => {
      const span = el('span', `bm-word bm-word-${Math.min(w, 1)}`, logo);
      span.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const c = el('span', 'bm-ch', span);
        c.textContent = ch;
        c.style.setProperty('--i', String(i++));
      }
    });
}

function updateSkin(): void {
  for (const [skin, b] of skinBtns) {
    const on = skin === settings.skin;
    b.classList.toggle('bm-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  skinNameLabel.textContent = t(skinKey(settings.skin));
  setSprite(heroSkin, settings.skin, HERO_SKIN_PX);
  for (const [id, b] of abilityBtns) {
    const on = id === settings.ability;
    b.classList.toggle('bm-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function updateSound(): void {
  soundBtn.innerHTML = sfx.muted ? SPEAKER_OFF : SPEAKER_ON;
  soundBtn.classList.toggle('bm-muted', sfx.muted);
  const label = t(sfx.muted ? 'menu.soundOff' : 'menu.soundOn');
  soundBtn.setAttribute('aria-label', label);
  soundBtn.title = label;
}

/** Рестартира CSS анимация (за „подскок“ при избор). */
function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth; // принуждава браузъра да „забрави“ старата анимация
  e.classList.add(cls);
}

function selectSkin(skin: string): void {
  sfx.unlock();
  settings.skin = skin;
  saveSettings(settings);
  updateSkin();
  replay(heroSkin.parentElement!, 'bm-pop');
  sfx.coin(0.6, 0);
}

function selectAbility(id: AbilityId): void {
  sfx.unlock();
  settings.ability = id;
  saveSettings(settings);
  updateSkin();
  replay(abilityBtns.get(id)!, 'bm-pop');
  sfx.ready();
}

/** Ако няма име – весело случайно „Играч123“. */
function randomName(): string {
  return t('menu.randomName', { n: 100 + Math.floor(Math.random() * 900) });
}

function doPlay(): void {
  if (!root || root.classList.contains('bm-hidden') || !opts) return;
  sfx.unlock();
  const name = settings.name.trim() || randomName();
  // Затваряме клавиатурата на телефона.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  opts.onPlay({ ...settings, name });
}

/**
 * Клавиши, докато менюто е отворено. Слушаме във фазата на прихващане (capture),
 * за да не стигат до Phaser: Enter е „ИГРАЙ“, а буквите/интервалът при писане
 * на името не бива да движат героя (Phaser иначе блокира и интервала).
 */
function onKey(e: KeyboardEvent): void {
  if (!root || root.classList.contains('bm-hidden')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) doPlay();
  } else if (e.target instanceof Node && root.contains(e.target)) {
    e.stopPropagation();
  }
}

export function showMenu(options: MenuOptions): void {
  opts = options;
  settings = loadSettings();
  if (!root) {
    root = build();
    document.body.appendChild(root);
  }
  nameInput.value = settings.name;
  renderTexts();
  root.classList.remove('bm-hidden');
}

export function hideMenu(): void {
  root?.classList.add('bm-hidden');
}
