FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY tsconfig.base.json tsconfig.base.json
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY apps/web/src apps/web/src
COPY apps/web/index.html apps/web/index.html
COPY apps/web/vite.config.ts apps/web/vite.config.ts
COPY apps/web/public apps/web/public
COPY packages/shared/src packages/shared/src

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm --prefix apps/web run build

FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/etc/99-env.sh /docker-entrypoint.d/99-env.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/99-env.sh

EXPOSE 80
