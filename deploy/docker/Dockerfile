FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY README.md ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=20128
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data
EXPOSE 20128

CMD ["node", "--no-warnings", "src/server/main.mjs"]
