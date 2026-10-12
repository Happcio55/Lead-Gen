# Build the optional Privy login bundle in its own stage (client/ has its own dependencies),
# then ship a lean runtime image with only the server's dependencies.
FROM node:22-alpine AS login
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY client/login.jsx ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html ./
COPY assets ./assets
COPY --from=login /app/assets/login ./assets/login
COPY server ./server
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/api/health >/dev/null || exit 1
CMD ["node", "server/index.js"]
