import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import RefreshToken from '../models/RefreshToken';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? 30);

/** Short-lived JWT sent in the response body and attached as a Bearer header by clients. */
export function signAccessToken(userId: string): string {
  const opts: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'],
  };
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, opts);
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Issues a new opaque refresh token, stores only its hash in the DB (so a DB
 * leak alone can't be replayed), and returns the raw value to hand to the client.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ user: userId, tokenHash: hashToken(raw), expiresAt });
  return raw;
}

/**
 * Validates a raw refresh token against the DB and rotates it: the old
 * record is deleted and a new one issued, so a stolen-and-replayed old
 * token stops working the moment the legitimate client refreshes.
 */
export async function rotateRefreshToken(raw: string): Promise<{ userId: string; token: string } | null> {
  const tokenHash = hashToken(raw);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record || record.expiresAt < new Date()) {
    if (record) await record.deleteOne();
    return null;
  }

  const userId = record.user.toString();
  await record.deleteOne();
  const token = await issueRefreshToken(userId);
  return { userId, token };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await RefreshToken.deleteOne({ tokenHash: hashToken(raw) });
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await RefreshToken.deleteMany({ user: userId });
}

const isProd = process.env.NODE_ENV === 'production';

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/api/auth',
  maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
};

export { REFRESH_COOKIE_NAME };
