FROM node:18

WORKDIR /app

ADD ./ /app
RUN corepack enable
RUN yarn install
RUN yarn build

ENTRYPOINT ["npx", "pm2-runtime", "start", "dist/rpc.js", "--max-memory-restart", "512M"]
CMD []