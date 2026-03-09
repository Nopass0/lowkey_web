FROM oven/bun:1.2.5
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
RUN bunx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]
