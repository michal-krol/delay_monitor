FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Railway wstawia własne zmienne (RAILWAY_GIT_BRANCH, RAILWAY_ENVIRONMENT_NAME)
# do budowy, ale izolacja Dockera je blokuje, dopóki nie zostaną jawnie
# zadeklarowane przez ARG w tym etapie -- bez tego next.config.ts nie widzi
# ich w process.env, mimo że Railway je "dostarcza" (patrz docs.railway.com/
# builds/dockerfiles#using-variables-at-build-time). To one, nie `git
# rev-parse` (node:24-slim nie ma binarki `git`), są realnym źródłem etykiety
# gałęzi/środowiska widocznej w Sidebar/AppTitle.
ARG RAILWAY_GIT_BRANCH
ARG RAILWAY_ENVIRONMENT_NAME
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Obraz node:24-slim ma gotowego użytkownika `node` (uid 1000). Serwer nic nie
# zapisuje na dysku w czasie działania, więc nie ma powodu, żeby chodził jako
# root — wystarczy odczyt skopiowanych plików.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/fixtures ./fixtures
USER node

EXPOSE 3000
CMD ["node", "server.js"]
