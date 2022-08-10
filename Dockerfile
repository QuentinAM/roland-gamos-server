FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npm ci --only=production
# Type script and build
RUN npm install typescript
COPY . .
RUN npx tsc
EXPOSE 8080
CMD [ "node", "dist/index.js" ]