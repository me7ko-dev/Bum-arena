/**
 * Панелите в HUD-а: „Падна!“ (след като те избутат) и „Класиране“ (в края на рунда).
 * Само ги построяват – кога да се покажат решава HudScene.
 */
import type Phaser from 'phaser';
import { placeOf, standings, type Player, type World } from '@bum/shared';
import { ATLAS } from '../assets';
import { t } from '../i18n';
import { FONT_FAMILY } from '../theme';
import { Button } from './Button';
import { addFace } from './faces';
import { resultsLayout, type ResultsLayout } from './resultsLayout';

const INK = 0x2a1650;
/** Цветовете на медалите: злато, сребро (синкаво), бронз. */
const MEDALS = [0xffc928, 0x9fd3ff, 0xff9a62];

function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  color = '#ffffff',
  stroke = 5,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: '900',
    color,
    stroke: '#2a1650',
    strokeThickness: stroke,
  });
}

/** Свива текста, ако е по-широк от maxW. */
function fit(tx: Phaser.GameObjects.Text, maxW: number): Phaser.GameObjects.Text {
  if (tx.width > maxW) tx.setScale(maxW / tx.width);
  return tx;
}

/** Фон на карта: сянка, тъмно лилаво, златна рамка; по желание – по-светла „шапка“ отгоре. */
function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, headH = 0): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x + 5, y + 9, w, h, 26);
  g.fillStyle(INK, 0.95);
  g.fillRoundedRect(x, y, w, h, 26);
  if (headH > 0) {
    g.fillStyle(0x4a2a85, 1);
    g.fillRoundedRect(x, y, w, headH, { tl: 26, tr: 26, bl: 0, br: 0 });
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(x + 12, y + 6, w - 24, headH * 0.4, 14);
  }
  g.lineStyle(4, 0xffd23f, 1);
  g.strokeRoundedRect(x, y, w, h, 26);
  return g;
}

/** Кръгче с номер на мястото (злато/сребро/бронз за първите трима). */
function placeBadge(scene: Phaser.Scene, x: number, y: number, place: number, r = 14): Phaser.GameObjects.GameObject[] {
  const g = scene.add.graphics();
  const col = MEDALS[place - 1] ?? 0x6b5a8e;
  g.fillStyle(INK, 1);
  g.fillCircle(x, y + 2, r + 2);
  g.fillStyle(col, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.3);
  g.fillCircle(x - r * 0.3, y - r * 0.35, r * 0.35);
  const tx = text(scene, x, y, String(place), Math.round(r * 1.15), '#ffffff', 4).setOrigin(0.5);
  return [g, tx];
}

// ───────────── Класиране ─────────────

export interface ResultsPanelOptions {
  world: World;
  meId: number;
  online: boolean;
  width: number;
  height: number;
  onAgain(): void;
  onMenu(): void;
  onLang(): void;
}

export interface ResultsPanel {
  container: Phaser.GameObjects.Container;
  /** „Следващ рунд след N…“ (онлайн), иначе null. */
  nextRoundText: Phaser.GameObjects.Text | null;
  layout: ResultsLayout;
  /** Плъзга панела навътре (animate=false – веднага, напр. при смяна на размера). */
  enter(animate: boolean): void;
}

/**
 * Карта с класирането. На широк екран е отдясно, на изправен телефон – лист отдолу,
 * така че подиумът (3D) остава да се вижда в свободната част.
 */
export function buildResultsPanel(scene: Phaser.Scene, o: ResultsPanelOptions): ResultsPanel {
  const layout = resultsLayout(o.width, o.height);
  const { w, h } = layout.panel;
  const sheet = layout.kind === 'sheet';
  const pad = 16;
  const world = o.world;
  const winner = world.getPlayer(world.round.winnerId);
  const iWon = winner?.id === o.meId;
  const headH = sheet ? 76 : 86;

  const items: Phaser.GameObjects.GameObject[] = [card(scene, 0, 0, w, h, headH)];

  // ── Шапка: купа + заглавие + причина ──
  const trophy = scene.add.image(pad + 30, headH / 2, ATLAS, 'trophy').setScale(sheet ? 0.42 : 0.48);
  items.push(trophy);
  const titleX = pad + 66;
  // Вдясно горе е бутонът за езика (52 px) – заглавието не бива да влиза под него.
  const titleMax = w - titleX - pad - 62;
  const title = fit(
    text(scene, titleX, headH / 2 - 11, iWon ? t('victory') : t('winnerIs', { name: winner?.name ?? '—' }), iWon ? 38 : 28, '#ffd23f', 6).setOrigin(0, 0.5),
    titleMax,
  );
  const reason = fit(
    text(scene, titleX, headH / 2 + 20, world.round.endReason === 'timeUp' ? t('reasonTimeUp') : t('reasonLastStanding'), 15, '#e5dbff', 4).setOrigin(0, 0.5),
    titleMax + 50,
  );
  items.push(title, reason);
  scene.tweens.add({ targets: trophy, angle: { from: -10, to: 10 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  const lang = new Button(scene, t('langToggle'), o.onLang, { width: 52, height: 36, fontSize: 16, color: 0x6b5a8e });
  lang.container.setPosition(w - pad - 26, 26);
  items.push(lang.container);

  // ── Редове ──
  const all = standings(world);
  const footerH = o.online ? 110 : 76;
  const rowH = sheet ? 34 : 38;
  const top = headH + 12;
  const maxRows = Math.max(3, Math.min(all.length, Math.floor((h - top - footerH) / rowH)));
  const rows = all.slice(0, maxRows).map((p, i) => ({ p, place: i + 1 }));
  const myPlace = all.findIndex((p) => p.id === o.meId) + 1;
  if (myPlace > maxRows) rows[rows.length - 1] = { p: all[myPlace - 1]!, place: myPlace };

  const rowConts: Phaser.GameObjects.Container[] = [];
  rows.forEach(({ p, place }, i) => {
    const y = top + i * rowH + rowH / 2;
    const isMe = p.id === o.meId;
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (isMe) {
      const hl = scene.add.graphics();
      hl.fillStyle(0xffd23f, 0.16);
      hl.fillRoundedRect(pad - 8, -rowH / 2 + 2, w - pad * 2 + 16, rowH - 4, (rowH - 4) / 2);
      hl.lineStyle(2, 0xffd23f, 0.7);
      hl.strokeRoundedRect(pad - 8, -rowH / 2 + 2, w - pad * 2 + 16, rowH - 4, (rowH - 4) / 2);
      parts.push(hl);
    }
    parts.push(...placeBadge(scene, pad + 14, 0, place, sheet ? 12 : 13));
    const face = addFace(scene, p.skin, rowH - 8);
    face.setPosition(pad + 46, 0);
    if (!p.alive && place > 1) face.setTint(0xd0c8e8);
    parts.push(face);
    const statsW = 118;
    const name = fit(text(scene, pad + 66, 0, p.name, sheet ? 17 : 19, isMe ? '#ffd23f' : '#ffffff', 4).setOrigin(0, 0.5), w - pad - 66 - statsW - pad);
    parts.push(name);
    parts.push(scene.add.image(w - pad - 104, 0, ATLAS, 'boom').setScale(0.19));
    parts.push(text(scene, w - pad - 90, 0, String(p.knockouts), 17, '#ffffff', 4).setOrigin(0, 0.5));
    parts.push(scene.add.image(w - pad - 46, 0, ATLAS, 'coin').setScale(0.19));
    parts.push(text(scene, w - pad - 32, 0, String(p.coins), 17, '#ffd23f', 4).setOrigin(0, 0.5));
    const rc = scene.add.container(0, y, parts);
    rowConts.push(rc);
    items.push(rc);
  });

  // ── Долу: бутони ──
  let nextRoundText: Phaser.GameObjects.Text | null = null;
  const btnY = h - 40;
  if (o.online) {
    nextRoundText = text(scene, w / 2, h - 88, '', 19, '#ffd23f', 5).setOrigin(0.5);
    const menu = new Button(scene, t('menu'), o.onMenu, { width: Math.min(180, w - 40), height: 52, fontSize: 24, color: 0x6b5a8e });
    menu.container.setPosition(w / 2, btnY);
    items.push(nextRoundText, menu.container);
  } else {
    const bw = Math.min(190, (w - pad * 3) / 2);
    const again = new Button(scene, t('again'), o.onAgain, { width: bw, height: 54, fontSize: 26 });
    const menu = new Button(scene, t('menu'), o.onMenu, { width: bw, height: 54, fontSize: 24, color: 0x6b5a8e });
    again.container.setPosition(w / 2 - bw / 2 - pad / 2, btnY);
    menu.container.setPosition(w / 2 + bw / 2 + pad / 2, btnY);
    items.push(again.container, menu.container);
    // „Пак!“ леко пулсира – подсказва какво да натиснеш.
    scene.tweens.add({ targets: again.container, scale: 1.05, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  const container = scene.add.container(layout.panel.x, layout.panel.y, items).setDepth(80);

  const enter = (animate: boolean): void => {
    if (!animate) return;
    const { x, y } = layout.panel;
    if (sheet) container.setPosition(x, o.height + 20);
    else container.setPosition(o.width + 20, y);
    scene.tweens.add({ targets: container, x, y, duration: 520, ease: 'Back.easeOut', easeParams: [0.9] });
    rowConts.forEach((rc, i) => {
      rc.setAlpha(0);
      rc.x = 40;
      scene.tweens.add({ targets: rc, alpha: 1, x: 0, delay: 260 + i * 70, duration: 300, ease: 'Back.easeOut' });
    });
  };
  return { container, nextRoundText, layout, enter };
}

// ───────────── „Падна!“ ─────────────

export interface EliminatedPanelOptions {
  world: World;
  me: Player;
  online: boolean;
  width: number;
  onAgain(): void;
  onMenu(): void;
  onSpectate(): void;
}

/** Панел след падане: кой те избута (с лицето му), кое място си, бутони. Центриран в (0, 0). */
export function buildEliminatedPanel(scene: Phaser.Scene, o: EliminatedPanelOptions): Phaser.GameObjects.Container {
  const { world, me } = o;
  const by = me.lastHitBy >= 0 ? world.getPlayer(me.lastHitBy) : undefined;
  const pushed = !!by && (me.eliminatedTick - me.lastHitTick) * world.dt <= world.cfg.hit.creditWindow;
  const w = Math.min(420, o.width - 28);
  const h = 296;
  const items: Phaser.GameObjects.GameObject[] = [card(scene, -w / 2, -h / 2, w, h)];

  // Панделка „ПАДНА!“ върху горния ръб.
  const rw = Math.min(w - 50, 260);
  const rib = scene.add.graphics();
  rib.fillStyle(0x000000, 0.3);
  rib.fillRoundedRect(-rw / 2 + 4, -h / 2 - 28 + 6, rw, 58, 20);
  rib.fillStyle(0xff5d73, 1);
  rib.fillRoundedRect(-rw / 2, -h / 2 - 28, rw, 58, 20);
  rib.fillStyle(0xffffff, 0.25);
  rib.fillRoundedRect(-rw / 2 + 10, -h / 2 - 24, rw - 20, 18, 9);
  rib.lineStyle(4, INK, 1);
  rib.strokeRoundedRect(-rw / 2, -h / 2 - 28, rw, 58, 20);
  const title = text(scene, 0, -h / 2 + 1, t('youFell'), 40, '#ffffff', 7).setOrigin(0.5);
  items.push(rib, title);
  scene.tweens.add({ targets: title, angle: { from: -4, to: 4 }, duration: 260, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });

  // Кой те избута.
  const rowY = -h / 2 + 92;
  if (pushed && by) {
    const face = addFace(scene, by.skin, 68);
    face.setPosition(-w / 2 + 62, rowY);
    items.push(face);
    items.push(scene.add.image(-w / 2 + 88, rowY + 24, ATLAS, 'boom').setScale(0.22));
    const lx = -w / 2 + 108;
    items.push(text(scene, lx, rowY - 15, t('hud.pushedByLabel'), 16, '#e5dbff', 4).setOrigin(0, 0.5));
    items.push(fit(text(scene, lx, rowY + 13, by.name, 28, '#ff8fa3', 6).setOrigin(0, 0.5), w / 2 - lx - 20));
    scene.tweens.add({ targets: face, scale: { from: face.scale * 1.4, to: face.scale }, duration: 420, ease: 'Back.easeOut' });
  } else {
    items.push(scene.add.image(-w / 2 + 62, rowY, ATLAS, 'skull').setScale(0.5));
    items.push(fit(text(scene, -w / 2 + 108, rowY, t('fellAlone'), 26, '#ffffff', 6).setOrigin(0, 0.5), w - 130));
  }

  // Място + статистика (три „чипа“).
  const chipY = rowY + 74;
  const place = placeOf(world, me.id);
  const chipW = (w - 48) / 3;
  const chips: [string, string | null, string][] = [
    [t('hud.place', { n: place }), null, t('hud.ofTotal', { total: world.players.length })],
    [String(me.knockouts), 'boom', t('hud.statKo')],
    [String(me.coins), 'coin', t('hud.statCoins')],
  ];
  chips.forEach(([value, icon, label], i) => {
    const cx = -w / 2 + 16 + chipW / 2 + i * (chipW + 8);
    const g = scene.add.graphics();
    g.fillStyle(i === 0 ? 0x5b2a86 : 0x3b2170, 1);
    g.fillRoundedRect(cx - chipW / 2, chipY - 30, chipW, 60, 16);
    if (i === 0) {
      g.lineStyle(2.5, 0xffd23f, 0.9);
      g.strokeRoundedRect(cx - chipW / 2, chipY - 30, chipW, 60, 16);
    }
    items.push(g);
    if (icon) {
      items.push(scene.add.image(cx - 18, chipY - 9, ATLAS, icon).setScale(0.2));
      items.push(text(scene, cx - 2, chipY - 9, value, 22, '#ffffff', 4).setOrigin(0, 0.5));
    } else {
      items.push(text(scene, cx, chipY - 9, value, 24, '#ffd23f', 5).setOrigin(0.5));
    }
    items.push(fit(text(scene, cx, chipY + 15, label, 13, '#e5dbff', 3).setOrigin(0.5), chipW - 10));
  });

  // Бутони. Онлайн рундът продължава без теб – вместо „Нова игра“ има „Меню“.
  const btnW = Math.min(180, (w - 50) / 2);
  const again = o.online
    ? new Button(scene, t('menu'), o.onMenu, { width: btnW, height: 56, color: 0x6b5a8e, fontSize: 23 })
    : new Button(scene, t('playAgain'), o.onAgain, { width: btnW, height: 56, fontSize: 23 });
  again.container.setPosition(-btnW / 2 - 10, h / 2 - 46);
  const watch = new Button(scene, t('spectate'), o.onSpectate, { width: btnW, height: 56, color: 0x4dabf7, fontSize: 23 });
  watch.container.setPosition(btnW / 2 + 10, h / 2 - 46);
  items.push(again.container, watch.container);

  return scene.add.container(0, 0, items).setDepth(80);
}
