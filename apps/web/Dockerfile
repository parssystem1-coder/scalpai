# ScalpAI v2 - web image (ADR-0036)
# Same rules as the API image: npm ci, no --ignore-scripts, turbo build.
FROM node:22-alpine AS builder
WORKDIR /app

COPY . .

RUN npm ci --legacy-peer-deps
RUN npm exec -- turbo run build --filter=@scalpai/app-web...

FROM nginx:1.27-alpine AS runner

# M17: tools/ci/image-scan.sh blocks the build on any FIXABLE CRITICAL, so the
# base package set is patched at build time. The nginx tag stays pinned - this
# only pulls Alpine security updates for the layer it already ships.
RUN apk upgrade --no-cache

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY ops/nginx/web.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O - http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
