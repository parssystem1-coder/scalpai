# ScalpAI v2 — Web Frontend Dockerfile for Self-Hosted Clinics
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and source
COPY package.json turbo.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

# Install dependencies and build static bundle
RUN npm install --ignore-scripts
RUN npm run build --filter=@scalpai/app-web...

# Production static server with Nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /health {
        access_log off;
        return 200 "healthy\n";
    }

    # Caching static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
