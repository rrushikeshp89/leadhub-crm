# syntax=docker/dockerfile:1

# ---- build: install everything, then compile the client and bundle the server ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: production dependencies and build output only ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    DB_PATH=/data/crm.db \
    PORT=4000
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data
EXPOSE 4000
# Starts as root only to hand the mounted volume to the "node" user, then drops privileges
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist-server/index.js"]
