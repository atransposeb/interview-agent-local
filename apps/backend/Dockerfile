# The backend API. Build from the repository root, which holds the workspace
# lockfile:
#   docker build -f apps/backend/Dockerfile -t fitfortherole-api .
FROM oven/bun:1.3.14

WORKDIR /app
COPY . .

# Dev dependencies included: the Prisma CLI generates the client here and
# runs migrations at startup.
RUN bun install --frozen-lockfile

WORKDIR /app/apps/backend
RUN bun run db:generate

ENV NODE_ENV=production
USER bun
EXPOSE 3001

# Applies pending migrations, then starts the API on $PORT (default 3001).
CMD ["bun", "run", "start:prod"]
