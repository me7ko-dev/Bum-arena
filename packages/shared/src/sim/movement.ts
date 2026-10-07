import type { PlayerInput } from '../input';
import type { Balance } from '../config/balance';
import type { Player } from './types';

/**
 * Движение на един играч за една подстъпка dt.
 *
 * Идеята за „тежест“:
 *  - под максималната скорост управлението е бързо и точно (ускорение/спиране);
 *  - над нея (след удар или дъш) играчът „лети“ и скоростта затихва плавно,
 *    а управлението е само частично (airControl). Така ударите се усещат.
 */
export function applyMovement(
  p: Player,
  input: PlayerInput,
  canControl: boolean,
  cfg: Balance,
  dt: number,
): void {
  const pc = cfg.player;
  const maxSpeed = pc.maxSpeed;
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

  const mx = canControl ? input.mx : 0;
  const my = canControl ? input.my : 0;
  const inputLen = Math.sqrt(mx * mx + my * my);

  if (inputLen > 0.1) p.facing = Math.atan2(my, mx);

  if (speed > maxSpeed * 1.02 || !canControl) {
    // „Летене“: експоненциално затихване + малко управление.
    const drag = Math.exp(-pc.knockbackDrag * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.vx += mx * pc.accel * pc.airControl * dt;
    p.vy += my * pc.accel * pc.airControl * dt;
  } else {
    // Нормално ходене: приближаваме скоростта към желаната.
    const tx = mx * maxSpeed;
    const ty = my * maxSpeed;
    let dvx = tx - p.vx;
    let dvy = ty - p.vy;
    const dvLen = Math.sqrt(dvx * dvx + dvy * dvy);
    const maxDv = (inputLen > 0.1 ? pc.accel : pc.stopDecel) * dt;
    if (dvLen > maxDv) {
      dvx = (dvx / dvLen) * maxDv;
      dvy = (dvy / dvLen) * maxDv;
    }
    p.vx += dvx;
    p.vy += dvy;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
}
