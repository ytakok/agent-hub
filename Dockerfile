# API container (NestJS) for Google Cloud Run.
# Build context = repo root (npm workspaces). Built remotely by `gcloud run deploy --source .` — no local Docker needed.
# Secrets are NOT baked in: the service-account key arrives at runtime via Secret Manager (FIREBASE_SERVICE_ACCOUNT_JSON).

FROM node:24-slim AS build
WORKDIR /app
# Workspace manifests first for layer caching. web/package.json is required because it is listed in the root workspaces.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace api --ignore-scripts --no-audit --no-fund
COPY shared/ shared/
COPY api/ api/
RUN npm run build --workspace api

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace api --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/api/dist api/dist
# Mock CRM data (DATA_MODE=mock); resolved relative to dist/, so it must sit at api/mock-data.
COPY api/mock-data api/mock-data
USER node
WORKDIR /app/api
# Cloud Run sets PORT (default 8080); the app reads it via its validated config.
EXPOSE 8080
CMD ["node", "dist/main.js"]
