# Obraz z serwerem tsoftware.online. Budowanie z katalogu repozytorium:
#   docker build -f deploy/Dockerfile -t tsoftware .
# (albo przez deploy/docker-compose.yml). Lista pomijanych plików: deploy/Dockerfile.dockerignore.

FROM node:22-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app \
    DATA_DIR=/app/server/data

RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
