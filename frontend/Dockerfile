FROM node:20-slim AS builder
# pnpm version comes from "packageManager" in package.json (via corepack)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm --version && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# A template: the entrypoint substitutes ${NGINX_LOCAL_RESOLVERS} (only defined
# env vars, so nginx's own $uri, $host… are left alone) into conf.d/default.conf
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
