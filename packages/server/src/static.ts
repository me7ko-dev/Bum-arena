/**
 * Сервиране на самата игра (build-а на клиента) от игровия сървър.
 * Така в production има ЕДНА услуга с един адрес: страницата и WebSocket-ът са на един и същи хост
 * и клиентът не се нуждае от настройка за адреса на сървъра.
 *
 * Папката: STATIC_DIR (env) или packages/client/dist. Ако я няма – нищо не се сервира (dev режим).
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEndpoint } from 'colyseus';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.md': 'text/markdown; charset=utf-8',
};

export function staticDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(process.env.STATIC_DIR ?? join(here, '..', '..', 'client', 'dist'));
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

/**
 * Маршрутите за играта: „/“ (иначе Colyseus отговаря с името си) и „/**“ –
 * файл от папката или index.html за непознат път.
 */
export function staticEndpoints(dir: string) {
  return {
    gameIndex: createEndpoint('/', { method: 'GET' }, () => serve(dir, '/')),
    gameFiles: createEndpoint('/**', { method: 'GET' }, (ctx) =>
      serve(dir, new URL(ctx.request?.url ?? '/', 'http://local').pathname),
    ),
  };
}

async function serve(dir: string, pathname: string): Promise<Response> {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  // Защита: път извън папката (../) не се допуска.
  const file = normalize(join(dir, rel));
  if (!file.startsWith(dir + sep) && file !== dir)
    return new Response('forbidden', { status: 403 });
  const target = (await isFile(file)) ? file : join(dir, 'index.html');
  const body = await readFile(target);
  // Файловете с хеш в името (assets/) могат да се кешират завинаги; index.html – никога.
  const cache = target.includes(`${sep}assets${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      // Изрична дължина – без нея адаптерът не затваря големите отговори (JS-ът е ~2 MB).
      'content-length': String(body.length),
      // Адаптерът на Colyseus не приключва отговора от рутера → keep-alive връзката „увисва“.
      // Затваряме я след всеки файл (браузърът отваря нова – файловете са малко и се кешират).
      connection: 'close',
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      'cache-control': cache,
    },
  });
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}
