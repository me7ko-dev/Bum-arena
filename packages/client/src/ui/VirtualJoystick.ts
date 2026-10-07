import type Phaser from 'phaser';

/**
 * „Плаващ“ виртуален джойстик: появява се там, където докоснеш екрана,
 * и дава аналогова посока (-1..1). Удобен е на всякакъв размер телефон.
 */
export class VirtualJoystick {
  private base: Phaser.GameObjects.Graphics;
  private knob: Phaser.GameObjects.Graphics;
  private pointerId = -1;
  private originX = 0;
  private originY = 0;
  /** Текуща посока (дължина ≤ 1). */
  x = 0;
  y = 0;

  constructor(
    scene: Phaser.Scene,
    private radius = 70,
  ) {
    this.base = scene.add.graphics();
    this.base.fillStyle(0xffffff, 0.12);
    this.base.fillCircle(0, 0, radius);
    this.base.lineStyle(4, 0xffffff, 0.35);
    this.base.strokeCircle(0, 0, radius);
    this.knob = scene.add.graphics();
    this.knob.fillStyle(0xffffff, 0.55);
    this.knob.fillCircle(0, 0, radius * 0.45);
    this.knob.lineStyle(4, 0x2a1650, 0.5);
    this.knob.strokeCircle(0, 0, radius * 0.45);
    this.setVisible(false);
  }

  get active(): boolean {
    return this.pointerId >= 0;
  }

  /** Подсказка къде е джойстикът, докато не го пипаш (само на телефон). */
  showIdleHint(x: number, y: number): void {
    if (this.active) return;
    this.base.setPosition(x, y).setVisible(true).setAlpha(0.5);
    this.knob.setPosition(x, y).setVisible(true).setAlpha(0.5);
  }

  setVisible(v: boolean): void {
    this.base.setVisible(v);
    this.knob.setVisible(v);
  }

  start(p: Phaser.Input.Pointer): void {
    this.pointerId = p.id;
    this.originX = p.x;
    this.originY = p.y;
    this.base.setPosition(p.x, p.y).setVisible(true).setAlpha(1);
    this.knob.setPosition(p.x, p.y).setVisible(true).setAlpha(1);
    this.move(p);
  }

  move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    let dx = p.x - this.originX;
    let dy = p.y - this.originY;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      // Ако пръстът излезе извън кръга, джойстикът го „следва“ (не се налага да връщаш пръста).
      const excess = d - this.radius;
      this.originX += (dx / d) * excess;
      this.originY += (dy / d) * excess;
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
      this.base.setPosition(this.originX, this.originY);
    }
    this.knob.setPosition(this.originX + dx, this.originY + dy);
    const len = Math.min(1, d / this.radius);
    const deadZone = 0.12;
    if (len < deadZone) {
      this.x = 0;
      this.y = 0;
    } else {
      // Плавна крива след мъртвата зона.
      const k = (len - deadZone) / (1 - deadZone) / (Math.hypot(dx, dy) || 1);
      this.x = dx * k;
      this.y = dy * k;
    }
  }

  end(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = -1;
    this.x = 0;
    this.y = 0;
    this.setVisible(false);
  }

  /** За да остане над всичко в HUD. */
  setDepth(d: number): void {
    this.base.setDepth(d);
    this.knob.setDepth(d + 1);
  }
}
