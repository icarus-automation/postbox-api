# syntax=docker/dockerfile:1

FROM node:22-slim AS base
# Prisma's schema engine needs OpenSSL, which the slim image does not ship.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Keep the version in sync with "packageManager" in package.json.
RUN npm install -g pnpm@12.3.4
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
# prisma.config.ts reads DATABASE_URL even for generate. Nothing connects, so any URL works.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate
COPY src ./src
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8000
CMD ["node", "dist/main"]
