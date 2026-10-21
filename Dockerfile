# One container for all of Msgr: the API also serves the built app, so a
# single address and a single session cookie cover both.
#
# Base images come from Google's mirror of Docker Hub (mirror.gcr.io): the
# same official images, without Docker Hub's anonymous pull limit or Amazon
# ECR Public's anonymous data cap, which builders on shared addresses run out of.

FROM mirror.gcr.io/library/node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/frontend/package.json apps/frontend/
COPY libs/media/package.json libs/media/
RUN npm ci --no-audit --no-fund
COPY . .
ENV NX_DAEMON=false NX_NO_CLOUD=true
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npx nx run-many -t build --projects=@msgr/api,@msgr/frontend

FROM mirror.gcr.io/library/node:22-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production STATIC_DIR=/app/apps/frontend/dist
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/frontend/package.json apps/frontend/
COPY libs/media/package.json libs/media/
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/generated apps/api/generated
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/frontend/dist apps/frontend/dist
COPY --from=build /app/libs/media/dist libs/media/dist
EXPOSE 4000
# Bring the database up to date, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && exec node apps/api/dist/main.js"]
