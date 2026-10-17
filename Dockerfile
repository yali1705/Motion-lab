# Motion Lab — editor + render service in one container.
# Based on Remotion's recommended Docker setup (chrome-headless-shell deps).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/render/package.json apps/render/package.json
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund
COPY packages packages
COPY apps apps
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
# Chromium runtime dependencies for Remotion's headless shell.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
    libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 \
    libcups2 libxshmfence1 fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3001 \
    MOTION_LAB_DATA_DIR=/data \
    MOTION_LAB_BUNDLE_DIR=/app/apps/render/.bundle \
    MOTION_LAB_WEB_DIST=/app/apps/web/dist
COPY --from=build /app /app
# Download Remotion's chrome-headless-shell at build time so first render is fast.
RUN node -e "require('@remotion/renderer').ensureBrowser().then(()=>console.log('browser ready'))"
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "apps/render/dist/server.js"]
