# 官方 Playwright 映像已內含 Chromium 與系統依賴；版本要跟 worker/package.json 的 playwright 一致
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY web/package.json web/
COPY worker/package.json worker/
RUN npm install --workspace worker --ignore-scripts --no-audit --no-fund

COPY shared shared
COPY worker worker

ENV NODE_ENV=production
USER pwuser
CMD ["npm", "start", "-w", "worker"]
