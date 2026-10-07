import Phaser from 'phaser';
import { abilityCooldownTotal } from '@bum/shared';
import { sfx } from '../audio/Sfx';
import { AbilityButton } from '../ui/AbilityButton';
import { StatCounter } from '../ui/StatCounter';
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
  private coinCounter!: StatCounter;
  private koCounter!: StatCounter;

  constructor() {
    super('Hud');
  }

  init(data: HudData): void {
    this.gameScene = data.game;
  }

  create(): void {
    const me = this.gameScene.match.human;
    this.abilityBtn = new AbilityButton(this, 46, me.ability, 'SPACE');
    this.coinCounter = new StatCounter(this, 'coin', 0.9, '#ffd23f');
    this.koCounter = new StatCounter(this, 'star', 1.1);
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
    this.coinCounter.container.setPosition(pad + 10, pad + 10);
    this.koCounter.container.setPosition(pad + 10, pad + 62);
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

    this.coinCounter.set(me.coins);
    this.coinCounter.update(dtSec);
    this.koCounter.set(me.knockouts);
    this.koCounter.update(dtSec);
  }
}
