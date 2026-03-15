require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { connectDB } = require('./src/models/db');
const quizRoutes = require('./src/routes/quiz');
const adminRoutes = require('./src/routes/admin');
const participantRoutes = require('./src/routes/participant');
const resultsRoutes = require('./src/routes/results');
const { setupSocketHandlers } = require('./src/controllers/socketController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS || '*', methods: ['GET', 'POST'] }
});

// ── Middleware ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'quiz-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// Make io accessible in routes
app.use((req, res, next) => { req.io = io; next(); });

// ── Routes ──────────────────────────────────────────────────
app.use('/api/quiz', quizRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/participant', participantRoutes);
app.use('/api/results', resultsRoutes);

// Health check endpoint (Azure App Service uses this)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// Serve frontend SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── Socket.IO ────────────────────────────────────────────────
setupSocketHandlers(io);

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`🚀 Quiz server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = { app, server };
