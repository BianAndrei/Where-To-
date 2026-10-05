FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

FROM base AS web-build
RUN npm run build -w @whereto/web

FROM nginx:stable-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

FROM base AS api
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
WORKDIR /app/apps/api
ENV HOST=0.0.0.0 DATA_DIR=/app/.data
EXPOSE 3001
CMD ["node", "--import", "tsx", "src/server.ts"]
