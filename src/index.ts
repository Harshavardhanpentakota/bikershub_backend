import 'dotenv/config';   // ← MUST be first: loads .env before any module reads process.env
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDB } from './config/db';
import { errorHandler } from './middleware/errorHandler';

import authRoutes    from './routes/auth';
import productRoutes from './routes/products';
import bikesRoutes   from './routes/bikes';
import cartRoutes    from './routes/cart';
import orderRoutes   from './routes/orders';
import userRoutes    from './routes/users';
import reviewRoutes  from './routes/reviews';
import paymentRoutes from './routes/payment';
import adminRoutes   from './routes/admin';

connectDB();

const app = express();

// ── Security & logging ──────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:8080',
      'http://localhost:5173',  // Vite default
      'https://bikershub-system-admin.vercel.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bikes',    bikesRoutes);
app.use('/api/cart',     cartRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/payment',  paymentRoutes);
app.use('/api/admin',    adminRoutes);

// ── Global error handler ────────────────────────────────────
app.use(errorHandler);

const PORT: number = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
