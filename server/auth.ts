import {createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import type {Express, Request, RequestHandler} from 'express';
const scrypt = promisify(scryptCallback);
const lifetime = 7 * 24 * 60 * 60 * 1000;
const cookieName = 'mcc_session';

export function signSession(secret: string, expires = Date.now() + lifetime) {
  const content = `${expires}.${randomBytes(24).toString('hex')}`;
  return `${content}.${createHmac('sha256', secret).update(content).digest('hex')}`;
}
export function validSession(token: string | undefined, secret: string, now = Date.now()) {
  if (!token || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) <= now || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  return timingSafeEqual(Buffer.from(parts[2], 'hex'), expected);
}
function token(req: Request) {return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);}

export async function installAuthentication(app: Express): Promise<{requireAuth: RequestHandler}> {
  const password = process.env.MCC_ADMIN_PASSWORD;
  const secret = process.env.MCC_SESSION_SECRET;
  const production = process.env.NODE_ENV === 'production';
  if (production && (!password || password.length < 16 || !secret || secret.length < 32)) throw new Error('Production requires MCC_ADMIN_PASSWORD (16+ characters) and MCC_SESSION_SECRET (32+ characters).');
  if (password && (!secret || secret.length < 32)) throw new Error('Set MCC_SESSION_SECRET to at least 32 characters when enabling sign-in.');
  const enabled = Boolean(password);
  const salt = randomBytes(16);
  const passwordHash = password ? await scrypt(password, salt, 64) as Buffer : undefined;
  const authenticated = (req: Request) => !enabled || validSession(token(req), secret!);
  const attempts = new Map<string, {count: number; reset: number}>();
  app.get('/api/session', (req, res) => res.json({authenticated: authenticated(req), loginRequired: enabled}));
  app.post('/api/login', async (req, res) => {
    if (!enabled) {res.json({ok: true}); return;}
    const now = Date.now();
    for (const [ip, attempt] of attempts) if (attempt.reset < now) attempts.delete(ip);
    const ip = req.ip || 'unknown';
    const attempt = attempts.get(ip) || {count: 0, reset: now + 15 * 60_000};
    if (attempt.count >= 10 || attempts.size > 10_000) {res.status(429).json({error: 'Too many attempts. Please try again later.'}); return;}
    attempt.count++; attempts.set(ip, attempt);
    const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!candidate || candidate.length > 1024 || !timingSafeEqual(await scrypt(candidate, salt, 64) as Buffer, passwordHash!)) {res.status(401).json({error: 'Incorrect password.'}); return;}
    attempts.delete(ip);
    res.cookie(cookieName, signSession(secret!), {httpOnly: true, secure: production, sameSite: 'strict', maxAge: lifetime, path: '/'});
    res.json({ok: true});
  });
  app.post('/api/logout', (_req, res) => {res.clearCookie(cookieName, {path: '/', httpOnly: true, secure: production, sameSite: 'strict'}); res.json({ok: true});});
  return {
    requireAuth: (req, res, next) => {
      if (!authenticated(req)) {res.status(401).json({error: 'Please sign in to your studio.'}); return;}
      res.setHeader('Cache-Control', 'private, no-store'); next();
    },
  };
}
