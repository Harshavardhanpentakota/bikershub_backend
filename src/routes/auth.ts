import { Router, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import { protect } from '../middleware/auth';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const googleClient =
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI
    ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
    : null;

const buildAppToken = (userId: string) => {
  const signOpts: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'],
  };
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, signOpts);
};

const findOrCreateGoogleUser = async (payload: {
  name?: string;
  email?: string;
}) => {
  if (!payload.email) throw new Error('Google account email is missing');

  let user = await User.findOne({ email: payload.email.toLowerCase() });
  if (!user) {
    user = await User.create({
      name: payload.name ?? payload.email.split('@')[0],
      email: payload.email.toLowerCase(),
      password: crypto.randomBytes(24).toString('hex'),
    });
  }

  if (payload.name && user.name !== payload.name) {
    user.name = payload.name;
    await user.save();
  }

  return user;
};

/** Build the URL the browser should land on after a successful OAuth.
 *  Priority:
 *    1. `state` param if it is itself a valid http/https URL  (frontend's redirectTo)
 *    2. GOOGLE_OAUTH_SUCCESS_REDIRECT env var
 *    3. null  → respond with JSON instead
 */
const createFrontendCallbackUrl = (token: string, state?: string): string | null => {
  const candidates: (string | undefined)[] = [
    state,
    process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        url.searchParams.set('token', token);
        url.searchParams.set('access_token', token);
        url.searchParams.set('jwt', token);
        return url.toString();
      }
    } catch {
      // not a valid URL, skip
    }
  }

  return null;
};

const respondWithGoogleAuth = (
  req: Request,
  res: Response,
  token: string,
  user: {
    id: unknown;
    name: string;
    email: string;
    role: string;
  }
) => {
  const state = req.query.state as string | undefined;
  const redirectUrl = createFrontendCallbackUrl(token, state);
  if (redirectUrl) return res.redirect(redirectUrl);

  return res.json({ token, user });
};

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

/* ── GET /api/auth/google ─────────────────────────────────── */
router.get('/google', async (req: Request, res: Response) => {
  if (!googleClient)
    return res.status(500).json({
      message:
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
    });

  // Accept ?redirectTo=<frontend-url>  (used by Vite/React frontend)
  // or legacy ?state=<value> — prefer redirectTo when both present
  const redirectTo = typeof req.query.redirectTo === 'string' ? req.query.redirectTo : undefined;
  const state = redirectTo ?? (typeof req.query.state === 'string' ? req.query.state : undefined);

  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    include_granted_scopes: true,
    prompt: 'consent',
    ...(state ? { state } : {}),
  });

  return res.redirect(url);
});

/* ── GET /api/auth/google/callback ────────────────────────── */
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    if (!googleClient)
      return res.status(500).json({
        message:
          'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
      });

    const code = req.query.code;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        message: 'Missing authorization code in callback query.',
      });
    }

    const { tokens } = await googleClient.getToken(code);
    if (!tokens.id_token)
      return res.status(400).json({ message: 'Google did not return an id_token.' });

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const user = await findOrCreateGoogleUser({
      name: payload?.name,
      email: payload?.email,
    });

    const token = buildAppToken(String(user._id));
    return respondWithGoogleAuth(req, res, token, {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/google/callback ───────────────────────── */
router.post('/google/callback', async (req: Request, res: Response) => {
  try {
    if (!googleClient)
      return res.status(500).json({
        message:
          'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
      });

    const code = req.body?.code;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'code is required in request body' });
    }

    const { tokens } = await googleClient.getToken(code);
    if (!tokens.id_token)
      return res.status(400).json({ message: 'Google did not return an id_token.' });

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const user = await findOrCreateGoogleUser({
      name: payload?.name,
      email: payload?.email,
    });

    const token = buildAppToken(String(user._id));
    return res.json({
      token,
      access_token: token,
      jwt: token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
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
