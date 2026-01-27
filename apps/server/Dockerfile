FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY tsconfig.base.json tsconfig.base.json
COPY apps/server/tsconfig.json apps/server/tsconfig.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY apps/server/src apps/server/src
COPY packages/shared/src packages/shared/src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
