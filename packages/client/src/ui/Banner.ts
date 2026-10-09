import Phaser from 'phaser';
import { ATLAS } from '../assets';
import { FONT_FAMILY } from '../theme';

export interface BannerOptions {
  title: string;
  subtitle?: string;
  /** Кадър от атласа над лентата (напр. 'crown'). */
  icon?: string;
  /** Цвят на лентата. */
  color: number;
  /** Колко се задържа на екрана (ms). */
  hold?: number;
}

/**
 * Голяма лента-съобщение („ТИ СИ ВОДАЧ!“, „ПОСЛЕДНИТЕ 10 СЕКУНДИ!“):
 * панделка с подвити краища, иконка, която подскача отгоре, и блясък, който минава през нея.
 * Разпъва се с пружинка, стои малко и отлита нагоре.
 */
export function showBanner(scene: Phaser.Scene, x: number, y: number, maxW: number, o: BannerOptions): Phaser.GameObjects.Container {
  const narrow = maxW < 420;
  const title = scene.add
    .text(0, o.subtitle ? -8 : 0, o.title, {
      fontFamily: FONT_FAMILY,
      fontSize: narrow ? '26px' : '34px',
      fontStyle: '900',
      color: '#ffffff',
      stroke: '#2a1650',
      strokeThickness: 7,
    })
    .setOrigin(0.5);
  if (title.width > maxW - 70) title.setScale((maxW - 70) / title.width);
  const items: Phaser.GameObjects.GameObject[] = [];
  const w = Math.min(maxW, Math.max(title.displayWidth + 70, narrow ? 240 : 320));
  const h = o.subtitle ? (narrow ? 70 : 78) : narrow ? 54 : 60;

  const dark = Phaser.Display.Color.IntegerToColor(o.color).darken(28).color;
  const g = scene.add.graphics();
  // Подвитите краища на панделката (зад основната лента).
  const tail = 26;
  const drop = 10;
  for (const s of [-1, 1]) {
    const ix = s * (w / 2 - 14);
    const ex = s * (w / 2 + tail);
    const pts = [
      new Phaser.Math.Vector2(ix, -h / 2 + drop),
      new Phaser.Math.Vector2(ex, -h / 2 + drop),
      new Phaser.Math.Vector2(ex - s * 14, drop),
      new Phaser.Math.Vector2(ex, h / 2 + drop),
      new Phaser.Math.Vector2(ix, h / 2 + drop),
    ];
    g.fillStyle(dark, 1);
    g.fillPoints(pts, true);
    g.lineStyle(4, 0x2a1650, 1);
    g.strokePoints(pts, true);
  }
  g.fillStyle(0x2a1650, 0.35);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 7, w, h, 16);
  g.fillStyle(o.color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(-w / 2 + 10, -h / 2 + 5, w - 20, h * 0.36, 10);
  g.lineStyle(4, 0x2a1650, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
  items.push(g);

  // Блясък: светла ивица, която минава през лентата.
  const shine = scene.add.rectangle(-w / 2 - 40, 0, 26, h - 8, 0xffffff, 0.35).setAngle(18);
  const mask = scene.make.graphics({}, false);
  items.push(shine, title);

  if (o.subtitle) {
    const sub = scene.add
      .text(0, h / 2 - 17, o.subtitle, {
        fontFamily: FONT_FAMILY,
        fontSize: narrow ? '15px' : '17px',
        fontStyle: '800',
        color: '#fff7d6',
        stroke: '#2a1650',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    if (sub.width > w - 30) sub.setScale((w - 30) / sub.width);
    items.push(sub);
  }
  let icon: Phaser.GameObjects.Image | null = null;
  let star: Phaser.GameObjects.Image | null = null;
  if (o.icon) {
    star = scene.add.image(0, -h / 2 - 8, 'ring').setTint(0xfff3b0).setScale(0.75).setAlpha(0.8);
    icon = scene.add.image(0, -h / 2 - 10, ATLAS, o.icon).setScale(0.5);
    items.push(star, icon);
  }

  const c = scene.add.container(x, y, items).setDepth(60);
  // Маската за блясъка следва контейнера – правим я в световни координати.
  mask.fillStyle(0xffffff);
  mask.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  shine.setMask(mask.createGeometryMask());

  c.setScale(0.2, 0.2).setAlpha(0);
  scene.tweens.add({ targets: c, scaleX: 1, scaleY: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: shine, x: w / 2 + 40, delay: 380, duration: 650, ease: 'Sine.easeInOut' });
  if (icon) {
    icon.setScale(0.1);
    scene.tweens.add({ targets: icon, scale: 0.5, y: -h / 2 - 22, delay: 120, duration: 420, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: icon, angle: { from: -8, to: 8 }, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  if (star) scene.tweens.add({ targets: star, scale: 1.4, alpha: 0, duration: 900, repeat: -1, ease: 'Cubic.easeOut' });

  const hold = o.hold ?? 1700;
  scene.tweens.add({
    targets: c,
    y: y - 40,
    alpha: 0,
    scaleX: 0.85,
    scaleY: 0.85,
    delay: 420 + hold,
    duration: 380,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      scene.tweens.killTweensOf([icon, star].filter(Boolean) as Phaser.GameObjects.Image[]);
      c.destroy();
      mask.destroy();
    },
  });
  return c;
}
