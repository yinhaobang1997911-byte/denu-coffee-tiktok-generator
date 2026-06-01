FROM mcr.microsoft.com/playwright:v1.44.1-jammy

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-noto-extra fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8787

CMD ["npm", "start"]
