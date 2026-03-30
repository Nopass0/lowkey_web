FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

RUN mkdir -p uploads

EXPOSE 3002
CMD ["bun", "run", "start"]
