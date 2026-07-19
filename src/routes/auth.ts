import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import { authLimiter, forgotPasswordLimiter, refreshLimiter } from '../middleware/rateLimit';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  hashToken,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
} from '../utils/tokens';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const googleClient =
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI
    ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
    : null;

const PASSWORD_MIN_LENGTH = 8;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Issues a fresh access + refresh token pair for a user, setting the refresh
 *  token as an httpOnly cookie, and returns the access token to embed in the
 *  JSON response body. */
async function issueSession(res: Response, userId: string): Promise<string> {
  const accessToken = signAccessToken(userId);
  const refreshToken = await issueRefreshToken(userId);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
}

const publicUser = (user: InstanceType<typeof User>) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
});

const findOrCreateGoogleUser = async (payload: { name?: string; email?: string }) => {
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

/** Build the URL the browser should land on after a successful OAuth redirect.
 *  No token is ever placed in this URL — the session lives in the httpOnly
 *  refresh cookie already set on this response; the frontend calls
 *  POST /api/auth/refresh on landing to obtain an access token. */
const createFrontendCallbackUrl = (state?: string): string | null => {
  const candidates: (string | undefined)[] = [state, process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch {
      // not a valid URL, skip
    }
  }
  return null;
};

/* ── POST /api/auth/register ──────────────────────────────── */
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email and password are required' });
    if (String(password).length < PASSWORD_MIN_LENGTH)
      return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password });
    const token = await issueSession(res, String(user._id));

    res.status(201).json({ token, user: publicUser(user) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/login ─────────────────────────────────── */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'email and password are required' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.isActive)
      return res.status(403).json({ message: user.bannedReason || 'This account has been disabled' });

    const token = await issueSession(res, String(user._id));

    res.json({ token, user: publicUser(user) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/refresh ───────────────────────────────── */
/* Exchanges the httpOnly refresh cookie for a new access token. Rotates the
   refresh token on every use so a captured-and-replayed old one is dead the
   moment the legitimate client refreshes. */
router.post('/refresh', refreshLimiter, async (req: Request, res: Response) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) return res.status(401).json({ message: 'Not authenticated' });

    const rotated = await rotateRefreshToken(raw);
    if (!rotated) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }

    const user = await User.findById(rotated.userId);
    if (!user || !user.isActive) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
      return res.status(401).json({ message: 'Not authenticated' });
    }

    res.cookie(REFRESH_COOKIE_NAME, rotated.token, REFRESH_COOKIE_OPTIONS);
    const accessToken = signAccessToken(rotated.userId);

    res.json({ token: accessToken, user: publicUser(user) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── GET /api/auth/google ─────────────────────────────────── */
router.get('/google', async (req: Request, res: Response) => {
  if (!googleClient)
    return res.status(500).json({
      message: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
    });

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
/* Browser redirect leg of the OAuth flow — sets the refresh cookie directly
   on this response, then sends the browser to the frontend with no token
   in the URL (avoids tokens leaking via browser history / referrer / logs). */
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    if (!googleClient)
      return res.status(500).json({
        message: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
      });

    const code = req.query.code;
    if (!code || typeof code !== 'string')
      return res.status(400).json({ message: 'Missing authorization code in callback query.' });

    const { tokens } = await googleClient.getToken(code);
    if (!tokens.id_token)
      return res.status(400).json({ message: 'Google did not return an id_token.' });

    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const user = await findOrCreateGoogleUser({ name: payload?.name, email: payload?.email });

    if (!user.isActive) return res.status(403).json({ message: user.bannedReason || 'This account has been disabled' });

    await issueSession(res, String(user._id));

    const state = req.query.state as string | undefined;
    const redirectUrl = createFrontendCallbackUrl(state);
    if (redirectUrl) return res.redirect(redirectUrl);
    return res.json({ user: publicUser(user) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/google/callback ───────────────────────── */
/* Fetch-based exchange used by SPA flows that pass the code via JS instead
   of a full browser redirect. Access token in the JSON body is fine here —
   it's never placed in a URL. */
router.post('/google/callback', async (req: Request, res: Response) => {
  try {
    if (!googleClient)
      return res.status(500).json({
        message: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
      });

    const code = req.body?.code;
    if (!code || typeof code !== 'string')
      return res.status(400).json({ message: 'code is required in request body' });

    const { tokens } = await googleClient.getToken(code);
    if (!tokens.id_token)
      return res.status(400).json({ message: 'Google did not return an id_token.' });

    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const user = await findOrCreateGoogleUser({ name: payload?.name, email: payload?.email });

    if (!user.isActive) return res.status(403).json({ message: user.bannedReason || 'This account has been disabled' });

    const token = await issueSession(res, String(user._id));

    res.json({ token, user: publicUser(user) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/logout ────────────────────────────────── */
router.post('/logout', async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (raw) await revokeRefreshToken(raw);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
  res.json({ message: 'Logged out successfully' });
});

/* ── POST /api/auth/forgot-password ──────────────────────── */
/* Always responds identically whether or not the email is registered, so
   the endpoint can't be used to enumerate accounts. */
router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  const genericResponse = { message: 'If that email is registered, a password reset link has been sent.' };
  try {
    const { email } = req.body;
    if (!email) return res.json(genericResponse);

    const user = await User.findOne({ email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = hashToken(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();

      // No transactional email provider is configured yet — log the link
      // server-side so it's usable in development. Wire up real email
      // delivery here (e.g. via a provider's API) before relying on this
      // in production.
      const resetLink = `${process.env.FRONTEND_URL ?? 'http://localhost:8080'}/reset-password?token=${rawToken}`;
      console.log(`[password-reset] ${email}: ${resetLink}`);
    }

    res.json(genericResponse);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/auth/reset-password ───────────────────────── */
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'token and password are required' });
    if (String(password).length < PASSWORD_MIN_LENGTH)
      return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordTokenHash +resetPasswordExpires');

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.password = password;
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // A password reset means any existing session may have been the
    // compromise vector — force re-login everywhere.
    await revokeAllRefreshTokensForUser(String(user._id));

    res.json({ message: 'Password reset successful. Please log in again.' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
