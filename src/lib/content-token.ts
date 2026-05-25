import crypto from 'crypto';
import type { NextRequest } from 'next/server';

// CONTENT_SECRET must be a dedicated secret — never share with NEXTAUTH_SECRET.
// Set it to a random 32+ byte hex string (e.g. openssl rand -hex 32).
function getSecret(): string {
  const s = process.env.CONTENT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'CONTENT_SECRET env var is required and must be at least 32 characters. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  return s;
}

// Raw downloads (PDFs): short TTL — the leaked window is the entire problem.
// Stream playback (video): longer TTL — pausing/seeking re-uses the same token.
const TOKEN_EXPIRY_RAW    = 30 * 60 * 1000;       // 30 minutes
const TOKEN_EXPIRY_STREAM = 4  * 60 * 60 * 1000;  // 4 hours

export type TokenKind = 'raw' | 'stream';

export interface SessionFingerprint {
  uaHash: string;    // sha256(userAgent) truncated to 16 hex chars
  ipPrefix: string;  // first 3 octets of IPv4 / first 4 hextets of IPv6
}

export interface ContentTokenPayload {
  userId: string;
  courseId: string;
  lessonId: string;
  uaHash?: string;
  ipPrefix?: string;
  kind?: TokenKind;
  iat?: number;
  exp?: number;
}

/** Hash a user-agent string into a stable short fingerprint. */
export function hashUserAgent(ua: string | null | undefined): string {
  return crypto.createHash('sha256').update(String(ua ?? '')).digest('hex').slice(0, 16);
}

/**
 * Normalize an IP to a coarse prefix so the token survives DHCP / mobile-carrier
 * jitter but still binds to roughly the same network neighborhood.
 *   IPv4 → first 3 octets ("10.20.30")
 *   IPv6 → first 4 hextets
 *   Unknown → empty string
 */
export function ipPrefix(ip: string | null | undefined): string {
  const s = String(ip ?? '').trim();
  if (!s) return '';
  if (s.includes(':')) return s.split(':').slice(0, 4).join(':');
  const parts = s.split('.');
  if (parts.length === 4) return parts.slice(0, 3).join('.');
  return '';
}

/** Pull the client IP from a NextRequest (X-Forwarded-For aware). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || (req as any).ip || '';
}

/** Build a SessionFingerprint from an incoming request. */
export function fingerprintFromRequest(req: NextRequest): SessionFingerprint {
  return {
    uaHash:   hashUserAgent(req.headers.get('user-agent')),
    ipPrefix: ipPrefix(clientIp(req)),
  };
}

export function generateContentToken(
  userId: string,
  courseId: string,
  lessonId: string,
  fingerprint?: SessionFingerprint,
  kind: TokenKind = 'raw',
): string {
  const now = Date.now();
  const ttl = kind === 'stream' ? TOKEN_EXPIRY_STREAM : TOKEN_EXPIRY_RAW;
  const payload: any = {
    userId,
    courseId,
    lessonId,
    kind,
    iat: now,
    exp: now + ttl,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  if (fingerprint) {
    payload.uaHash   = fingerprint.uaHash;
    payload.ipPrefix = fingerprint.ipPrefix;
  }

  const data = JSON.stringify(payload);
  const secret = getSecret();
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');

  return Buffer.from(`${data}.${hmac}`).toString('base64url');
}

export function verifyContentToken(token: string): ContentTokenPayload | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return null;

    const data = decoded.substring(0, lastDot);
    const hmac = decoded.substring(lastDot + 1);

    const secret = getSecret();
    const expectedHmac = crypto.createHmac('sha256', secret).update(data).digest('hex');

    if (!hmac || hmac.length !== expectedHmac.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) return null;

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;

    return {
      userId:   payload.userId,
      courseId: payload.courseId,
      lessonId: payload.lessonId,
      uaHash:   payload.uaHash,
      ipPrefix: payload.ipPrefix,
      kind:     payload.kind,
      iat:      payload.iat,
      exp:      payload.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Check that the request's session fingerprint matches the one baked into the token.
 *   - If the token has no fingerprint (legacy / in-flight tokens), always allow.
 *   - Otherwise both uaHash and ipPrefix must match exactly.
 *
 * Returns true if the fingerprint is acceptable.
 */
export function fingerprintMatches(payload: ContentTokenPayload, current: SessionFingerprint): boolean {
  if (!payload.uaHash && !payload.ipPrefix) return true; // legacy token, no binding
  if (payload.uaHash && payload.uaHash !== current.uaHash) return false;
  if (payload.ipPrefix && payload.ipPrefix !== current.ipPrefix) return false;
  return true;
}
