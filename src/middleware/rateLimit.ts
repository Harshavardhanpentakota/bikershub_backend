import rateLimit from 'express-rate-limit';

/** Login/register/refresh — narrow window, blocks brute-force credential guessing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

/** Password-reset requests — looser than login, but still capped to slow enumeration/spam. */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

/**
 * Refresh doesn't take a password (a 96-hex-char random cookie value isn't
 * brute-forceable), and every logged-in tab/user behind a shared office IP
 * hits this route routinely — needs its own generous bucket so it never
 * competes with the login-guessing limiter above.
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});
