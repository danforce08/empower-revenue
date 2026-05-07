import crypto from 'node:crypto';

const TTL_DAYS = 30;
export const COOKIE_NAME = 'erd_session';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var not set');
  return s;
}

/** Create an HMAC-signed session token: `<timestamp>.<hex-signature>`. */
export function createToken(): string {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret()).update(ts).digest('hex');
  return `${ts}.${sig}`;
}

/** Verify a session token: signature matches and within TTL. */
export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = crypto.createHmac('sha256', secret()).update(ts).digest('hex');
  } catch {
    return false;
  }
  if (sig.length !== expected.length) return false;
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, 'hex');
    expBuf = Buffer.from(expected, 'hex');
  } catch {
    return false;
  }
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  const ageMs = Date.now() - parseInt(ts);
  if (Number.isNaN(ageMs) || ageMs < 0) return false;
  if (ageMs > TTL_DAYS * 24 * 3600 * 1000) return false;
  return true;
}
