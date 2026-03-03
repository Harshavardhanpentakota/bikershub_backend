import { Router, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import { protect } from '../middleware/auth';

const router = Router();

/* ── POST /api/auth/register ──────────────────────────────── */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email and password are required' });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password });
    const signOpts: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'] };
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, signOpts);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/login ─────────────────────────────────── */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'email and password are required' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    const signOpts: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'] };
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, signOpts);

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/logout ────────────────────────────────── */
router.post('/logout', protect, (_req: Request, res: Response) => {
  // JWT is stateless; client removes token from storage
  res.json({ message: 'Logged out successfully' });
});

/* ── POST /api/auth/forgot-password ──────────────────────── */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: 'No account with that email' });

    // TODO: generate signed link and email it
    const resetToken = crypto.randomBytes(32).toString('hex');
    console.log(`[dev] Reset token for ${email}: ${resetToken}`);

    res.json({ message: 'Password reset link sent (check console in dev)' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/reset-password ───────────────────────── */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    // TODO: validate token from DB/cache, update user password
    console.log('[dev] Reset token received:', token);
    res.json({ message: 'Password reset successful' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
