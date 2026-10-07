import Phaser from 'phaser';
import { abilityCooldownTotal } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { AbilityButton } from '../ui/AbilityButton';
import type { GameScene } from './GameScene';

export interface HudData {
  game: GameScene;
}

/**
 * HUD – всичко, което е „върху екрана“ и не се мащабира с камерата:
 * бутон за суперсила, таймер, монети и т.н. Работи паралелно с GameScene.
 */
export class HudScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private abilityBtn!: AbilityButton;

  constructor() {
    super('Hud');
  }

  init(data: HudData): void {
    this.gameScene = data.game;
  }

  create(): void {
    const me = this.gameScene.match.human;
    this.abilityBtn = new AbilityButton(this, 46, me.ability, 'SPACE');
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  /** Подрежда елементите според размера на екрана. */
  private layout(): void {
    const { width, height } = this.scale;
    const pad = Math.max(24, Math.min(width, height) * 0.05);
    this.abilityBtn.container.setPosition(width - pad - 46, height - pad - 56);
  }

  override update(_time: number, deltaMs: number): void {
    const match = this.gameScene.match;
    const me = match.human;
    const dtSec = deltaMs / 1000;
    const becameReady = this.abilityBtn.update(
      me.abilityCooldown,
      abilityCooldownTotal(match.world.cfg, me),
      dtSec,
    );
    if (becameReady && me.alive) sfx.ready();
    this.abilityBtn.container.setVisible(me.alive);
  }
}
