# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Skip lifecycle scripts (the `postinstall` hook needs scripts/ and public/,
# which aren't copied yet at this stage). We re-sync the PDF worker explicitly
# in the builder stage below.
RUN npm ci --ignore-scripts

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Make sure public/pdf.worker.min.mjs matches the installed pdfjs-dist version.
# PDF.js refuses to load if API and worker versions disagree; this prevents
# silent worker drift between the bundle and the static file we serve.
RUN node scripts/sync-pdf-worker.js
RUN --mount=type=secret,id=lms_env,target=/app/.env.production \
  npm run build && npm prune --omit=dev --ignore-scripts

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/uploads/pdfs /app/uploads/videos /app/uploads/tmp /app/uploads/thumbnails /app/public/thumbnails \
  && chown -R nextjs:nodejs /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

USER nextjs
EXPOSE 3001

CMD ["npm", "start", "--", "-p", "3001", "-H", "0.0.0.0"]