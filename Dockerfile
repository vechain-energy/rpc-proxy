FROM node:18

WORKDIR /app

ADD ./ /app
RUN yarn install
RUN yarn build

ENTRYPOINT ["yarn", "start"]
CMD []
