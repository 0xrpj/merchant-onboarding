# syntax=docker/dockerfile:1

# --- Build: install everything, compile TypeScript, then drop dev dependencies ---
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first: this layer is cached until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Runtime: only the compiled app and production dependencies ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Never run as root inside the container.
USER node
EXPOSE 3000

# The API by default. Compose runs the worker and migrations from the same image
# with a different command.
CMD ["node", "dist/main"]
