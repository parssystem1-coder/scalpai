# ScalpAI v2 - web image (ADR-0036)
# Same rules as the API image: npm ci, no --ignore-scripts, turbo build.
FROM node:26-alpine AS builder
WORKDIR /app

COPY . .

RUN npm ci --legacy-peer-deps
RUN npm exec -- turbo run build --filter=@scalpai/app-web...

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY ops/nginx/web.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O - http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
