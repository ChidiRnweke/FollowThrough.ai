# Stage 1: Build
FROM node:22-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build application
RUN pnpm build
RUN pnpm prune --prod

# Stage 2: Runtime
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy migrations and scripts (includes OTel instrumentation)
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

# Expose port (default for adapter-node is 3000)
EXPOSE 3000

# Start with OTel instrumentation loaded before the app
CMD ["node", "--import", "./scripts/otel-instrumentation.js", "build"]
