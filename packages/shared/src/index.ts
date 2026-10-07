/**
 * @bum/shared – публичен вход на споделената логика.
 * Клиентът (а по-късно и сървърът) импортират само оттук.
 */
export const GAME_VERSION = '0.1.0';

export * from './config/balance';
export * from './input';
export * from './bots/BotBrain';
export * from './bots/names';
export * from './math/rng';
export * from './net/protocol';
export * from './math/vec';
export * from './sim/abilities';
export * from './sim/arena';
export * from './sim/cars';
export * from './sim/events';
export * from './sim/movement';
export * from './sim/round';
export * from './sim/shop';
export * from './sim/stats';
export * from './sim/types';
export * from './sim/world';
