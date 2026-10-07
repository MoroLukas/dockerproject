FROM node:lts-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]