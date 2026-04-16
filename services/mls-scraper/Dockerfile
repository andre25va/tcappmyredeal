FROM ghcr.io/puppeteer/puppeteer:21.0.0

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

EXPOSE 3000

CMD ["node", "index.js"]
