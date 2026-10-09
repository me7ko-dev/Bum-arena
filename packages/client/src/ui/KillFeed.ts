import type Phaser from 'phaser';
import type { Player } from '@bum/shared';
import { ATLAS } from '../assets';
import { FONT_FAMILY } from '../theme';
import { addFace } from './faces';

/** Колко реда се виждат наведнъж и колко живее един ред (сек). */
const MAX_ROWS = 4;
const LIFE = 5;
const ROW_H = 38;
const FACE = 28;

interface Row {
  c: Phaser.GameObjects.Container;
  age: number;
  y: number;
}

/**
 * Лента с избутванията (горе вдясно): [лице] Боби 💥 [лице] Мими.
 * Новите редове се плъзгат отдясно, старите слизат надолу и избледняват.
 * Подравнена е отдясно: позицията на контейнера е десният ѝ ръб.
 */
export class KillFeed {
  readonly container: Phaser.GameObjects.Container;
  private rows: Row[] = [];
  /** Най-много знаци в име (на тесен екран – по-малко). */
  maxName = 12;
  /** Колко реда най-много (на тесен екран – по-малко). */
  maxRows = MAX_ROWS;

  constructor(private scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
  }

  add(by: Player | undefined, victim: Player, meId: number): void {
    const s = this.scene;
    const mine = victim.id === meId || by?.id === meId;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const style = (id: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      fontStyle: '900',
      color: id === meId ? '#ffd23f' : '#ffffff',
      stroke: '#2a1650',
      strokeThickness: 4,
    });
    const short = (n: string) => (n.length > this.maxName ? `${n.slice(0, this.maxName - 1)}…` : n);

    // Подреждаме отляво надясно, после изместваме така, че десният ръб да е на 0.
    let x = 10;
    const place = (o: Phaser.GameObjects.Image | Phaser.GameObjects.Text, w: number, gap = 6) => {
      o.setPosition(x + w / 2, 0);
      parts.push(o);
      x += w + gap;
    };
    if (by) {
      place(addFace(s, by.skin, FACE), FACE, 5);
      const t = s.add.text(0, 0, short(by.name), style(by.id)).setOrigin(0.5);
      place(t, t.width, 6);
    }
    const icon = s.add.image(0, 0, ATLAS, by ? 'boom' : 'skull').setScale(by ? 0.22 : 0.19);
    place(icon, 26, 6);
    const vf = addFace(s, victim.skin, FACE).setTint(0xc8bfe0);
    place(vf, FACE, 5);
    const vt = s.add.text(0, 0, short(victim.name), style(victim.id)).setOrigin(0.5);
    place(vt, vt.width, 0);
    const w = x + 10;

    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.22);
    bg.fillRoundedRect(-w + 2, -ROW_H / 2 + 4, w, ROW_H - 4, (ROW_H - 4) / 2);
    bg.fillStyle(mine ? 0x5b2a86 : 0x2a1650, mine ? 0.85 : 0.62);
    bg.fillRoundedRect(-w, -ROW_H / 2 + 2, w, ROW_H - 4, (ROW_H - 4) / 2);
    if (mine) {
      bg.lineStyle(2.5, 0xffd23f, 1);
      bg.strokeRoundedRect(-w, -ROW_H / 2 + 2, w, ROW_H - 4, (ROW_H - 4) / 2);
    }
    for (const p of parts) (p as Phaser.GameObjects.Image).x -= w;

    const c = s.add.container(70, 0, [bg, ...parts]).setAlpha(0);
    this.container.add(c);
    s.tweens.add({ targets: c, x: 0, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    // Лицето на падналия „подскача“.
    vf.setScale(vf.scaleX * 1.5);
    s.tweens.add({ targets: vf, scaleX: vf.scaleX / 1.5, scaleY: vf.scaleY / 1.5, duration: 380, ease: 'Back.easeOut' });

    this.rows.unshift({ c, age: 0, y: -ROW_H });
    while (this.rows.length > this.maxRows) this.rows.pop()!.c.destroy();
  }

  update(dt: number): void {
    this.rows.forEach((r, i) => {
      r.age += dt;
      // Плавно слизане към мястото си.
      r.y += (i * (ROW_H + 2) - r.y) * Math.min(1, dt * 14);
      r.c.y = r.y;
      if (r.age > LIFE - 1) r.c.setAlpha(Math.max(0, LIFE - r.age));
    });
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i]!.age > LIFE) this.rows.splice(i, 1)[0]!.c.destroy();
    }
  }

  setVisible(v: boolean): void {
    this.container.setVisible(v);
  }
}
