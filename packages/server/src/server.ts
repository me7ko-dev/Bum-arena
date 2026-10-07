/**
 * Сглобяване на игровия сървър: Colyseus + WebSocket + стаята ArenaRoom + /health.
 * Отделено от index.ts, за да могат тестовете да пускат сървъра в същия процес.
 */
import { ROOM_NAME } from '@bum/shared';
import { Server, WebSocketTransport, createEndpoint, createRouter } from 'colyseus';
import { ArenaRoom, DEFAULT_TIMINGS, type RoomTimings } from './ArenaRoom';
import { staticDir, staticEndpoints } from './static';

export interface GameServerOptions {
  port: number;
  /** Промени по времената на стаята (тестовете ги съкращават). */
  timings?: Partial<RoomTimings>;
  /** Сървърът сам да спира при SIGINT/SIGTERM (истинският процес – да; тестовете – не). */
  handleSignals?: boolean;
}

export interface GameServer {
  server: Server;
  port: number;
  /** Спира сървъра: затваря стаите и порта. */
  stop(): Promise<void>;
}

/** GET /health → „ok“ (за Fly.io / Render / Railway health check). */
const health = createEndpoint('/health', { method: 'GET' }, async () => {
  return new Response('ok', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});

export async function startGameServer(opts: GameServerOptions): Promise<GameServer> {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    gracefullyShutdown: opts.handleSignals ?? true,
  });
  // CORS е отворен по подразбиране в Colyseus (Access-Control-Allow-Origin = Origin на заявката).
  // Ако има build на клиента – сървърът сервира и самата игра (един адрес за всичко).
  const dir = staticDir();
  server.router = dir ? createRouter({ health, ...staticEndpoints(dir) }) : createRouter({ health });
  // Времената идват от сървъра и презаписват всичко, пратено от клиента.
  server.define(ROOM_NAME, ArenaRoom, { timings: { ...DEFAULT_TIMINGS, ...opts.timings } });
  await server.listen(opts.port);
  return {
    server,
    port: opts.port,
    stop: () => server.gracefullyShutdown(false),
  };
}
