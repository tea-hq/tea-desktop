FROM node:22-bookworm-slim AS build

WORKDIR /src/packages/runner
COPY packages/runner/package.json ./package.json
RUN npm install --ignore-scripts
COPY packages/runner/tsconfig.json ./tsconfig.json
COPY packages/runner/src ./src
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /runner
ENV NODE_ENV=production
ENV PATH="/runner/node_modules/.bin:${PATH}"
COPY --from=build /src/packages/runner/package.json ./package.json
COPY --from=build /src/packages/runner/node_modules ./node_modules
COPY --from=build /src/packages/runner/dist ./dist
RUN mkdir -p /var/lib/tea && chown -R node:node /runner /var/lib/tea
USER node
ENTRYPOINT ["node", "dist/cli.js"]
