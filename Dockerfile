# БУМ Арена – ЕДИН контейнер: игровият сървър (Colyseus) сервира и самата игра.
# Build:  docker build -t bum-arena .
# Run:    docker run -p 2567:2567 bum-arena   → отвори http://localhost:2567

# ── Етап 1: build на клиента (Vite) ──
FROM node:22-alpine AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/client packages/client
RUN npm run build -w @bum/client

# ── Етап 2: сървърът (само неговите зависимости) + готовия клиент ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev --workspace @bum/server --ignore-scripts && npm cache clean --force
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY --from=client /app/packages/client/dist packages/client/dist

ENV PORT=2567
EXPOSE 2567
USER node
CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
