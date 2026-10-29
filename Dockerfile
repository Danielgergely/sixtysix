# One container = app build + arena server (single process; rooms live in memory,
# so run exactly ONE instance). Serves the SPA and socket.io on $PORT.
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /repo
# Accounts live in SQLite under DATA_DIR: mount a persistent volume there.
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
# Coolify's health check runs curl (or wget) inside the container; slim images have neither.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY shared ./shared
COPY server ./server
# bank.json + verses.json are read by the server at runtime
COPY app/src/questions ./app/src/questions
COPY --from=build /repo/app/dist ./app/dist
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://localhost:8080/healthz || exit 1
CMD ["npm", "start", "--workspace", "server"]
