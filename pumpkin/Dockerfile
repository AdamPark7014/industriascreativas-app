# PUMPKIN Accesos: escáner (React) + API (Hono) en un solo contenedor, servido en /pumpkin/
FROM node:22-alpine AS ui
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /api
COPY api/package.json api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PUMPKIN_PUBLIC_DIR=/app/public
COPY --from=api /api/package.json ./
COPY --from=api /api/node_modules ./node_modules
COPY --from=api /api/dist ./dist
COPY --from=ui /ui/dist ./public
EXPOSE 3090
USER node
CMD ["node", "dist/index.js"]
