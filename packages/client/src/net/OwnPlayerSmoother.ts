/**
 * Собственото човече онлайн се рисува без закъснението за интерполация:
 * последната снимка + екстраполация по скоростта (виж NetGame).
 *
 * Когато пристигне нова снимка, екстраполираната точка леко „подскача“.
 * Вместо да скочим, пазим разликата (грешката) и я стопяваме плавно за ~tau секунди.
 * Голям скок (напр. нов рунд) – направо отиваме там.
 */
export class OwnPlayerSmoother {
  private x = 0;
  private y = 0;
  private errX = 0;
  private errY = 0;
  private has = false;

  constructor(
    private readonly tau = 0.08,
    private readonly snapDist = 150,
  ) {}

  /**
   * tx, ty – целта (последна снимка + екстраполация); newSnapshot – пристигнала ли е
   * нова снимка от миналия кадър. Връща позицията за рисуване.
   */
  update(tx: number, ty: number, dt: number, newSnapshot: boolean): { x: number; y: number } {
    if (!this.has) {
      this.has = true;
      this.errX = this.errY = 0;
    } else if (newSnapshot) {
      this.errX = this.x - tx;
      this.errY = this.y - ty;
      if (Math.hypot(this.errX, this.errY) > this.snapDist) this.errX = this.errY = 0;
    }
    const k = Math.exp(-Math.max(0, dt) / this.tau);
    this.errX *= k;
    this.errY *= k;
    this.x = tx + this.errX;
    this.y = ty + this.errY;
    return { x: this.x, y: this.y };
  }

  reset(): void {
    this.has = false;
  }
}
