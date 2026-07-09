FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev
ENV DATA_PATH=/data/data.json
CMD ["node", "dist/index.js"]
