# Frontend image: the ONLY Dockerfile the pipeline builds.
#
# The JVM services use Jib (no Dockerfile, no daemon). A React app is a pile
# of static files behind a web server, so it gets the classic two-stage
# build instead: stage 1 has Node and produces dist/, stage 2 is a plain
# nginx that ships only dist/ -- Node, node_modules (~300 MB) and the
# TypeScript compiler never reach the runtime image (~15 MB).
#
#   docker build -t localhost:5000/frontend:dev frontend
#   docker run --rm -p 3000:80 localhost:5000/frontend:dev   -> http://localhost:3000

# ---- stage 1: build ---------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Copy the lockfile first and install BEFORE copying sources: this layer is
# cached until package*.json changes, so a source edit does not re-download
# every dependency. `npm ci` (not `install`) refuses to touch the lockfile,
# i.e. the build gets exactly the versions committed in git.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# = `tsc -b && vite build` (package.json). tsc type-checks, Vite bundles and
# content-hashes the assets (index-<hash>.js) so they can be cached forever.
RUN npm run build

# ---- stage 2: serve ---------------------------------------------------------
FROM nginx:1.27-alpine
# The stock image ships a default server block; replace it with ours.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
