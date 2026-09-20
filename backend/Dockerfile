# WorkNest API (Express + Socket.io)
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# npm ci needs the lockfile; --omit=dev keeps vitest and friends out of the image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Don't run the API as root
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
