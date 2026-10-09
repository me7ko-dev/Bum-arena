import type Phaser from 'phaser';
import { ATLAS } from '../assets';

/** Най-много летящи монети наведнъж (над това – направо в брояча). */
const MAX_FLYING = 14;

/**
 * Монети, които „летят“ от героя до брояча горе вляво.
 * Броячът показва (монети − летящи), така че числото скача точно когато монетата пристигне.
 */
export class CoinFly {
  /** Колко монети (стойност) са още във въздуха. */
  inFlight = 0;
  private flying = 0;
  private landed = 0;

  constructor(
    private scene: Phaser.Scene,
    /** Къде е иконката на брояча в момента. */
    private target: () => { x: number; y: number },
    /** Монетата пристигна (за „подскок“ на брояча и звук). */
    private onArrive: (step: number) => void,
  ) {}

  /** Монета (със стойност value) взета в точка (x, y) на екрана. */
  spawn(x: number, y: number, value: number): void {
    if (this.flying >= MAX_FLYING) return;
    const n = Math.min(3, value);
    const per = value / n;
    for (let i = 0; i < n; i++) this.one(x + (i - (n - 1) / 2) * 16, y, per, i * 70);
  }

  private one(x: number, y: number, value: number, delay: number): void {
    const s = this.scene;
    this.flying++;
    this.inFlight += value;
    const coin = s.add.image(x, y, ATLAS, 'coin').setScale(0.12).setDepth(70);
    // Контролна точка – монетата първо „подскача“ нагоре и встрани, после пикира към брояча.
    const side = Math.random() < 0.5 ? -1 : 1;
    const cx = x + side * (60 + Math.random() * 60);
    const cy = y - 90 - Math.random() * 60;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      coin.destroy();
      this.flying--;
      this.inFlight = Math.max(0, this.inFlight - value);
      this.onArrive(this.landed++);
    };
    s.tweens.add({ targets: coin, scale: 0.3, duration: 140, delay, ease: 'Back.easeOut' });
    s.tweens.addCounter({
      from: 0,
      to: 1,
      delay: delay + 90,
      duration: 520,
      ease: 'Cubic.easeIn',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        const t = this.target();
        const a = (1 - k) * (1 - k);
        const b = 2 * (1 - k) * k;
        const c = k * k;
        coin.setPosition(a * x + b * cx + c * t.x, a * y + b * cy + c * t.y);
        coin.setScale(0.3 - 0.1 * k);
        coin.setAngle(k * 360 * side);
      },
      onComplete: finish,
      onStop: finish,
    });
  }

  /** Сцената се затваря – нищо не остава „във въздуха“. */
  reset(): void {
    this.inFlight = 0;
    this.flying = 0;
  }
}
