FROM node:22-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./


RUN corepack prepare --activate

FROM base AS prod-deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS builder

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
# The worker sidecar runs from this same image with a different command.
COPY --from=builder /app/build-worker ./build-worker
COPY --from=builder /app/package.json ./package.json

COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
# Embedded fonts for PDF export (resolved from the working directory).
COPY --from=builder /app/assets ./assets

EXPOSE 3000

CMD ["node", "--import", "./scripts/otel-instrumentation.js", "build"]
