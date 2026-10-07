/**
 * @bum/shared – публичен вход на споделената логика.
 * Клиентът (а по-късно и сървърът) импортират само оттук.
 */
export const GAME_VERSION = '0.1.0';

export * from './config/balance';
export * from './input';
export * from './bots/names';
export * from './math/rng';
export * from './math/vec';
export * from './sim/events';
export * from './sim/types';
export * from './sim/world';
