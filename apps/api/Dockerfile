# ScalpAI v2 — Backend API Dockerfile for Self-Hosted Clinics
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json turbo.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

# Install and build
RUN npm install --ignore-scripts
RUN npm run build --filter=@scalpai/app-api...

# Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api

EXPOSE 3000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
