FROM node:20-slim AS app
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
COPY scripts ./scripts
EXPOSE 8080
CMD ["node", "src/server.js"]
