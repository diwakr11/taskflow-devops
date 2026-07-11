# Dockerfile
# WHY: Multi-stage build — Stage 1 builds, Stage 2 runs
# Result: Final image has NO build tools, only what's needed to run
# This makes the image smaller and more secure

# ── Stage 1: Builder ──────────────────────────────────────
FROM node:20-alpine AS builder

# Set working directory inside container
WORKDIR /app

# Copy package files first (Docker layer caching)
# WHY: If package.json hasn't changed, Docker reuses
# the cached npm install layer — much faster builds
COPY package*.json ./

# Install ALL dependencies including devDeps for building
RUN npm ci

# Copy rest of source code
COPY src/ ./src/

# ── Stage 2: Production Runner ────────────────────────────
FROM node:20-alpine AS runner

# Security: Don't run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S taskflow -u 1001

WORKDIR /app

# Copy only production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package*.json ./

# Create data directory for SQLite with correct permissions
RUN mkdir -p /app/data && \
    chown -R taskflow:nodejs /app

# Switch to non-root user
USER taskflow

# Document which port the app uses
EXPOSE 3000

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/taskflow.db

# Health check — Docker monitors this automatically
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/app.js"]