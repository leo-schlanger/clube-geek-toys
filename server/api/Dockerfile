FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM base AS development
RUN npm ci
COPY . .
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
# su-exec: drop root → node after fixing upload volume permissions
RUN apk add --no-cache su-exec \
    && mkdir -p /app/uploads/contracts /app/uploads/photos /app/uploads/products \
    && chown -R node:node /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
# Start as root so entrypoint can chown the mounted uploads volume, then su-exec node
USER root
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=20s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
