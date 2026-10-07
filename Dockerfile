# Игровият сървър на БУМ Арена (Colyseus) – един контейнер, порт от PORT.
# Build:  docker build -t bum-arena-server .
# Run:    docker run -p 2567:2567 bum-arena-server
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# 1) Само зависимостите на сървъра (и @bum/shared) – клиентът (Phaser, Three) не се инсталира.
#    package.json на всички пакети е нужен, за да съвпадне package-lock.json.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev --workspace @bum/server --ignore-scripts && npm cache clean --force

# 2) Кодът: споделената логика + сървърът (TypeScript се пуска директно с tsx).
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server

ENV PORT=2567
EXPOSE 2567
USER node

CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
