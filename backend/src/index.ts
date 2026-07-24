import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
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
import aiRoutes from './routes/ai.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Simple health check — visit this in a browser to confirm the server is alive
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Runyenjes backend is running' });
});

app.use('/auth', authRoutes);
app.use('/posts', postsRoutes);
app.use('/settings', settingsRoutes);
app.use('/programs', programsRoutes);
app.use('/applications', applicationsRoutes);
app.use('/groups', groupsRoutes);
app.use('/terms', termsRoutes);
app.use('/library', libraryRoutes);
app.use('/admin', adminRoutes);
app.use('/uploads', uploadsRoutes);
app.use('/profile', profileRoutes);
app.use('/ai', aiRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✔ Server running at http://localhost:${PORT}`);
});
