# Пускане на сървъра в интернет

Онлайн играта има две части:

| Част | Какво е | Къде се качва |
|------|---------|---------------|
| **Сървър** (`packages/server`) | Node.js + Colyseus, един процес, WebSocket | Fly.io / Render / Railway (контейнер от `Dockerfile`) |
| **Клиент** (`packages/client`) | статични файлове след `npm run build` | всеки статичен хостинг (Netlify, Vercel, Cloudflare Pages, GitHub Pages …) |

Клиентът трябва да знае адреса на сървъра – той се задава при **build** с `VITE_SERVER_URL`.

## Сървърът накратко

- Слуша на порта от променливата `PORT` (облачните хостинги я задават сами), иначе `2567`.
- `GET /health` → `ok` – за health check на хостинга.
- CORS е отворен (клиентът може да е на друг домейн).
- Всички стаи са в паметта на процеса → пускай **една инстанция** (без хоризонтално мащабиране;
  за повече сървъри трябва Redis presence – етап 3.1).
- Стартира TypeScript директно с `tsx` (няма отделна компилация).

Проба локално с Docker:

```bash
docker build -t bum-arena-server .
docker run --rm -p 2567:2567 bum-arena-server
curl http://localhost:2567/health   # → ok
```

Без Docker: `npm run start:server` (или `npm run dev:server` с презареждане при промяна).

## Fly.io

1. Инсталирай `flyctl` и влез: `fly auth login`.
2. В корена на репото: `fly launch --no-deploy` – засича `Dockerfile`. Избери име (напр. `bum-arena`)
   и регион близо до играчите (за България: `otp` Букурещ или `fra` Франкфурт).
3. В създадения `fly.toml` провери:

   ```toml
   [env]
     PORT = "2567"

   [http_service]
     internal_port = 2567
     force_https = true
     auto_stop_machines = "off"   # иначе празната машина „заспива“ и първото влизане е бавно
     min_machines_running = 1

   [[http_service.checks]]
     method = "GET"
     path = "/health"
     interval = "15s"
     timeout = "2s"
   ```

4. `fly deploy`, после `fly scale count 1` (само една машина – стаите са в паметта ѝ).
5. Адресът е `wss://<име>.fly.dev`.

## Render

1. **New → Web Service** → свържи GitHub репото.
2. Runtime: **Docker** (Render засича `Dockerfile` в корена).
3. Health Check Path: `/health`. Порт не се задава – Render подава `PORT` сам.
4. Instances: 1. (Безплатният план „заспива“ след 15 мин без трафик – първото влизане отнема ~30 сек.)
5. Адресът е `wss://<име>.onrender.com`.

## Railway

1. **New Project → Deploy from GitHub repo** → избери репото. Railway засича `Dockerfile`.
2. Settings → Networking → **Generate Domain** (Railway подава `PORT` сам).
3. Settings → Deploy → Healthcheck Path: `/health`; Replicas: 1.
4. Адресът е `wss://<име>.up.railway.app`.

## Насочване на клиента към сървъра

Адресът се „вгражда“ в клиента при build:

```bash
VITE_SERVER_URL=wss://bum-arena.fly.dev npm run build
# → packages/client/dist – качи тази папка на статичния хостинг
```

На Netlify / Vercel / Cloudflare Pages добави `VITE_SERVER_URL` като променлива на средата
в настройките на проекта (build command: `npm run build`, папка: `packages/client/dist`).

Без `VITE_SERVER_URL` клиентът търси сървъра на същия хост, порт 2567
(`ws://<хост>:2567`) – удобно за локална игра по Wi-Fi с `npm run dev`.

Важно:

- Страница по **https** може да се свързва само към **wss://** (не `ws://`). Всички хостинги
  по-горе дават https/wss автоматично.
- След промяна на протокола (`PROTOCOL_VERSION` в `packages/shared/src/net/protocol.ts`)
  качи **и сървъра, и клиента** – сървърът отказва клиенти с друга версия.

## Проверка след качване

```bash
curl https://<адрес-на-сървъра>/health   # → ok
```

После отвори клиента в два браузъра → „Играй онлайн“ – трябва да сте в една стая.
