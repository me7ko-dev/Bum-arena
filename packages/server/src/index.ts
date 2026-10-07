/**
 * Вход на игровия сървър: `npm run dev -w @bum/server` (tsx watch) или `npm run start:server`.
 * Портът е от PORT (облачните хостинги го задават сами), иначе DEFAULT_PORT (2567).
 */
import { DEFAULT_PORT } from '@bum/shared';
import { startGameServer } from './server';

const port = Number(process.env.PORT) || DEFAULT_PORT;

await startGameServer({ port });
console.log(
  `БУМ Арена сървър: ws://localhost:${port}  (проверка: http://localhost:${port}/health)`,
);
