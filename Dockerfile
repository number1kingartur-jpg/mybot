FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV DATA_PATH=/data/data.json
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
