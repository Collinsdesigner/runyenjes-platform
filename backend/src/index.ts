import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import postsRoutes from './routes/posts.routes';
import settingsRoutes from './routes/settings.routes';
import programsRoutes from './routes/programs.routes';
import applicationsRoutes from './routes/applications.routes';
import groupsRoutes from './routes/groups.routes';
import termsRoutes from './routes/terms.routes';
import libraryRoutes from './routes/library.routes';
import adminRoutes from './routes/admin.routes';
import uploadsRoutes from './routes/uploads.routes';
import profileRoutes from './routes/profile.routes';
import securityRoutes from './routes/security.routes';
import aiRoutes from './routes/ai.routes';
import { errorHandler } from './middleware/errorHandler';
import morgan from 'morgan';

import {
  apiLimiter,
  loginLimiter,
securityLimiter,  
uploadLimiter,
} from './middleware/rateLimit';

const app = express();

/**
 * =========================
 * Security Configuration
 * =========================
 */

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/**
 * =========================
 * CORS Configuration
 * =========================
 */

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow Postman, curl and server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS: Origin not allowed'));
    },
    credentials: true,
  })
);

/**
 * =========================
 * Request Logging
 * =========================
 */

app.use(morgan('dev'));

/**
 * =========================
 * Body Parsing
 * =========================
 */

app.use(express.json());

/**
 * =========================
 * Global API Rate Limit
 * =========================
 */

app.use(apiLimiter);

/**
 * =========================
 * Static Files
 * =========================
 */

app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'))
);

/**
 * =========================
 * Health Check
 * =========================
 */

app.get('/', (_, res) => {
  res.json({
    status: 'ok',
    message: 'Runyenjes backend is running',
  });
});

/**
 * =========================
 * Routes
 * =========================
 */

app.use('/auth', loginLimiter, authRoutes);
app.use('/posts', postsRoutes);
app.use('/settings', settingsRoutes);
app.use('/programs', programsRoutes);
app.use('/applications', applicationsRoutes);
app.use('/groups', groupsRoutes);
app.use('/terms', termsRoutes);
app.use('/library', libraryRoutes);
app.use('/admin', adminRoutes);
app.use('/uploads', uploadLimiter, uploadsRoutes);
app.use('/profile', profileRoutes);
app.use('/security', securityLimiter, securityRoutes);
app.use('/ai', aiRoutes);

/**
 * =========================
 * 404 Handler
 * =========================
 */

app.use((req, res) => {
  res.status(404).json({
    message: `Route '${req.originalUrl}' not found`,
  });
});

app.use(errorHandler);

/**
 * =========================
 * Start Server
 * =========================
 */

const PORT = Number(env.PORT);
app.listen(PORT, () => {
  console.log(`✔ Server running at http://localhost:${PORT}`);
});
