# ScalpAI v2 - API image (ADR-0036)
#
# Rules this file must keep obeying (WEAKNESSES C8/H16):
#  - `npm ci` against the committed lockfile, never `npm install`
#  - NO --ignore-scripts: sharp and @node-rs/argon2 are native and must build
#  - build through turbo (`npm exec -- turbo run build`), never `npm run build --filter`
FROM node:26-alpine AS builder
WORKDIR /app

# Toolchain for the native modules (sharp -> libvips, argon2 -> cc).
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev

# The whole workspace is copied because `npm ci` validates the lockfile against
# every workspace package.json. .dockerignore keeps the context small.
COPY . .

RUN npm ci --legacy-peer-deps
RUN npm exec -- turbo run build --filter=@scalpai/app-api...

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The one-shot migrate container runs `npm run db:migrate` as the unprivileged
# `node` user: give npm a writable HOME/cache so it never needs root.
ENV HOME=/home/node
ENV npm_config_cache=/tmp/.npm
ENV npm_config_update_notifier=false

# Runtime libvips for sharp.
RUN apk add --no-cache vips libc6-compat

# node_modules is copied whole (dev deps included) on purpose: the one-shot
# `migrate` service runs `npm run db:migrate` (tsx) from this same image.
COPY --from=builder /app/package.json /app/package-lock.json /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
# Exec form: node is PID 1 and receives SIGTERM directly (graceful shutdown).
CMD ["node", "dist/main.js"]
