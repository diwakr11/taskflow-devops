// src/app.js
// WHY: This is the application entry point — it wires everything together.
// We keep it lean; heavy logic lives in routes and middleware.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const taskRoutes = require('./routes/tasks');
const { register, metricsMiddleware } = require('./middleware/metrics');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ───────────────────────────────────────
// WHY: helmet() sets 14 security-related HTTP headers automatically
// This is a DevOps/security best practice — never skip this
app.use(helmet());

// WHY: CORS lets us control which domains can call our API
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

// ─── Logging Middleware ────────────────────────────────────────
// WHY: Structured logs are essential for debugging in production
// 'combined' format includes IP, method, URL, status, response time
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(logFormat));

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // Limit body size for security
app.use(express.urlencoded({ extended: true }));

// ─── Metrics Middleware ────────────────────────────────────────
// WHY: Must come BEFORE routes to capture all request metrics
app.use(metricsMiddleware);

// ─── Health Check Endpoint ────────────────────────────────────
// WHY: Load balancers, Kubernetes, and monitoring tools ping this
// endpoint to know if the app is alive. NEVER skip this in production.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ─── Prometheus Metrics Endpoint ──────────────────────────────
// WHY: Prometheus scrapes this endpoint every 15 seconds
// to collect your application metrics
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/tasks', taskRoutes);

// ─── Root Route ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: '🚀 TaskFlow API is running!',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      metrics: 'GET /metrics',
      tasks: {
        list: 'GET /api/tasks',
        stats: 'GET /api/tasks/stats',
        create: 'POST /api/tasks',
        get: 'GET /api/tasks/:id',
        update: 'PUT /api/tasks/:id',
        delete: 'DELETE /api/tasks/:id'
      }
    }
  });
});

// ─── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.path} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────
// WHY: Unhandled errors must be caught here to prevent server crashes
// and to return consistent error responses
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// ─── Start Server ─────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 TaskFlow API Server Started      ║
╠════════════════════════════════════════╣
║  Port:        ${PORT}                     ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(14)}  ║
║  Health:      http://localhost:${PORT}/health ║
║  Metrics:     http://localhost:${PORT}/metrics ║
╚════════════════════════════════════════╝
  `);
});

// ─── Graceful Shutdown ────────────────────────────────────────
// WHY: When Docker/Kubernetes sends SIGTERM, we finish in-flight
// requests before shutting down — prevents dropped connections
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed. Goodbye!');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down...');
  server.close(() => process.exit(0));
});

module.exports = app; // Export for testing