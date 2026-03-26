FROM oven/bun:1.2.5 AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.2.5 AS runner
WORKDIR /app

COPY package.json bun.lock ./
COPY src ./src
COPY --from=prod-deps /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
