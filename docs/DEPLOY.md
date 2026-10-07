# Пускане на играта в интернет

Играта е **една услуга**: игровият сървър (Node.js + Colyseus) сервира и самата игра (build-а на клиента),
и онлайн връзката (WebSocket) – на един и същи адрес. Не се настройват адреси и CORS.

`Dockerfile` прави всичко: build на клиента (Vite) → сървър с готовите файлове.

- Портът идва от `PORT` (хостингите го задават сами), иначе `2567`.
- `GET /health` → `ok` (health check).
- Стаите са в паметта на процеса → **една инстанция**.

## Render (най-лесно, има безплатен план)

1. Влез в https://render.com с GitHub акаунта си.
2. **New → Blueprint** → избери репото `Bum-arena` и клона с играта → **Apply**.
   Render чете `render.yaml` и сам прави всичко (Docker build, health check).
3. След ~5 мин играта е на `https://bum-arena.onrender.com` (или подобен адрес – вижда се в Render).
   Прати линка на приятели – „Играй с приятели“ дава линк директно към твоята стая.

Безплатният план „заспива“ след 15 мин без играчи – първото отваряне след това отнема ~1 мин.
За игра без чакане избери платения Starter план (~7 $/мес) в настройките на услугата.

## Fly.io (без заспиване, сървър в Букурещ)

```bash
fly auth login
fly launch --copy-config --no-deploy   # ползва fly.toml от репото (регион otp = Букурещ)
fly deploy
fly scale count 1                      # една машина – стаите са в паметта ѝ
```

Адрес: `https://bum-arena.fly.dev` (името може да е заето – fly launch ще предложи друго).

## Railway

**New Project → Deploy from GitHub repo** → Railway засича `Dockerfile` →
Settings → Networking → **Generate Domain**; Healthcheck Path: `/health`; Replicas: 1.

## Локално

```bash
npm run build && npm run start:server   # → http://localhost:2567 (играта + сървърът)
docker build -t bum-arena . && docker run --rm -p 2567:2567 bum-arena   # същото с Docker
```

## Отделен статичен хостинг (по желание)

Ако искаш клиентът да е другаде (Netlify, Vercel, GitHub Pages), задай адреса на сървъра при build:

```bash
VITE_SERVER_URL=wss://bum-arena.onrender.com npm run build   # → packages/client/dist
```
