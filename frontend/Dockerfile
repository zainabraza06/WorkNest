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

# nginx-unprivileged runs as a non-root user and listens on 8080, so a compromise of the web
# tier does not start from root and the container needs no NET_BIND_SERVICE capability.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Templates in /etc/nginx/templates are rendered with envsubst at start-up. Limiting the
# substituted variables keeps nginx's own $uri / $host from being eaten.
ENV NGINX_ENVSUBST_FILTER=API_ORIGIN     API_ORIGIN=""

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3   CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
