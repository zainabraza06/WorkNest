# WorkNest web app — build with Vite, serve the static bundle with nginx
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at BUILD time, so these must be build args, not runtime env.
# Changing them means rebuilding the image.
#
# Docker warns about ARG/ENV "secrets" here — that is a false positive. A Stripe *publishable*
# key is designed to ship in the browser bundle; the secret key never leaves the backend.
# hadolint ignore=SecretsUsedInArgOrEnv
ARG VITE_API_URL=""
ARG VITE_STRIPE_PUBLISHABLE_KEY=""
ENV VITE_API_URL=$VITE_API_URL \
    VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
