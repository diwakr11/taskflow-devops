# Dockerfile
# ── Stage 1: Dependencies ─────────────────────────────────
# WHY: Separate stage for deps means Docker caches this layer
# If only src/ changes, npm install is NOT re-run — huge speed boost
FROM node:20-alpine AS deps

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy ONLY package files first
# WHY: Docker layer cache — if these don't change,
# the npm ci layer is reused on every build
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# ── Stage 2: Builder ──────────────────────────────────────
# WHY: Separate stage to build/prepare source code
# Keeps build tools OUT of final image
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/

# ── Stage 3: Production Runner ────────────────────────────
# WHY: Final image only contains what's needed to RUN
# No build tools, no dev dependencies, no test files
# Result: smaller, faster, more secure image
FROM node:20-alpine AS runner

# Add metadata labels
# WHY: Labels make images self-documenting
# docker inspect shows who built it, when, from what commit
ARG BUILD_DATE
ARG BUILD_NUMBER
ARG GIT_COMMIT
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.version="${BUILD_NUMBER}" \
      org.opencontainers.image.title="TaskFlow API" \
      org.opencontainers.image.description="TaskFlow REST API DevOps Project" \
      maintainer="diwakr11"

# Install wget for health check (tiny addition)
RUN apk add --no-cache wget

# Security: create non-root user
# WHY: Running as root in containers is a security risk
# If the container is compromised, attacker gets root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S taskflow -u 1001 -G nodejs

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps --chown=taskflow:nodejs /app/node_modules ./node_modules

# Copy application source from builder stage
COPY --from=builder --chown=taskflow:nodejs /app/src ./src

# Copy package files
COPY --chown=taskflow:nodejs package*.json ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && \
    chown -R taskflow:nodejs /app/data

# Switch to non-root user
USER taskflow

# Document port
EXPOSE 3000

# Runtime environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/taskflow.db

# Health check
# WHY: Docker marks container as unhealthy if this fails
# Docker Compose, ECS, and Kubernetes all use this
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=30s \
            --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Start application
CMD ["node", "src/app.js"]