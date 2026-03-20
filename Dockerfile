FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDeps needed by tsx/typescript)
RUN npm install

# Copy rest of source
COPY . .

# Expose server port
EXPOSE 3000

# Start the server
CMD ["npx", "tsx", "server/index.ts"]
