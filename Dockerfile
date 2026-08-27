# Multi-stage: Vite SPA + Flask API for demo.experiencebt.com.mx
FROM node:20-alpine AS webbuild
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.14-rc-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libopenjp2-7-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .
COPY --from=webbuild /web/dist ./web/dist

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && find . -name '.ssh_explore*.py' -delete 2>/dev/null || true

EXPOSE 5000
ENTRYPOINT ["/entrypoint.sh"]
