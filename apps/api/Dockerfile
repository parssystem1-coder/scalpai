# ScalpAI v2 - API image (ADR-0036)
#
# Rules this file must keep obeying (WEAKNESSES C8/H16):
#  - `npm ci` against the committed lockfile, never `npm install`
#  - NO --ignore-scripts: sharp and @node-rs/argon2 are native and must build
#  - build through turbo (`npm exec -- turbo run build`), never `npm run build --filter`
#
# M17: the image that RUNS the API must not carry the tree that BUILT it. The
# compiler, the test runners, the browser driver and the bundlers were the bulk
# of what image-scan.sh reported as fixable CRITICALs here, and not one of them
# is reachable from `node dist/main.js`. `npm run audit:ci` could not see them
# either - it runs with --omit=dev, so it never described this image. The runtime
# tree is therefore resolved from the SAME lockfile with --omit=dev, in its own
# stage, and the builder's node_modules is copied nowhere.
FROM node:22-alpine AS builder
WORKDIR /app

# Toolchain for the native modules (sharp -> libvips, argon2 -> cc).
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev

# The whole workspace is copied because `npm ci` validates the lockfile against
# every workspace package.json. .dockerignore keeps the context small.
COPY . .

RUN npm ci --legacy-peer-deps
RUN npm exec -- turbo run build --filter=@scalpai/app-api...

# The production dependency tree: same lockfile, same flags, minus every
# devDependency. It is resolved in a stage of its own rather than pruned out of
# the builder, so what the runtime receives is defined by the lockfile and not by
# whatever the build happened to leave behind. Native modules still compile here,
# which is why the toolchain is installed again.
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev
COPY . .
RUN npm ci --omit=dev --legacy-peer-deps

# npm bundles its own tar copy outside the project dependency graph. Install the
# patched project tar in the production tree so image scanning sees the exact
# patched package; package-lock.json remains the source-of-truth for npm ci.
# Do not hide failures: a failed patch must fail the image build.
RUN npm install --no-save --package-lock=false --legacy-peer-deps tar@7.5.22

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The one-shot migrate container runs `npm run db:migrate:prod` as the
# unprivileged `node` user: give npm a writable HOME/cache so it never needs root.
ENV HOME=/home/node
ENV npm_config_cache=/tmp/.npm
ENV npm_config_update_notifier=false

# M17: tools/ci/image-scan.sh blocks the build on any FIXABLE CRITICAL, so the
# base package set is patched at build time. The node tag stays pinned - this
# only pulls Alpine security updates for the layer it already ships.
RUN apk upgrade --no-cache

# Runtime libvips for sharp.
RUN apk add --no-cache vips libc6-compat

# The workspace and its PRODUCTION dependency tree (root plus any nested one).
# Sources come along because the migration reads packages/db/sql at runtime.
COPY --from=prod-deps /app ./

# Compiled output: the API, and exactly the packages it loads at runtime. The
# `migrate` service runs packages/db/dist/migrate-cli.js from this same image.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/analysis-core/dist ./packages/analysis-core/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/sync-client/dist ./packages/sync-client/dist

# The lockfile is a BUILD-time contract (H16) and nothing in this image installs
# anything. Keeping it here would only hand a scanner a second inventory, listing
# every dev package that is deliberately NOT in the image.
RUN rm -f package-lock.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
# Exec form: node is PID 1 and receives SIGTERM directly (graceful shutdown).
CMD ["node", "dist/main.js"]
