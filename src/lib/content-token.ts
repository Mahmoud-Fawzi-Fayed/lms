import crypto from 'crypto';

const CONTENT_TOKEN_SECRET = process.env.CONTENT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret';
const TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

export function generateContentToken(
  userId: string,
  courseId: string,
  lessonId: string
): string {
  const payload = {
    userId,
    courseId,
    lessonId,
    exp: Date.now() + TOKEN_EXPIRY,
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const data = JSON.stringify(payload);
  const hmac = crypto
    .createHmac('sha256', CONTENT_TOKEN_SECRET)
    .update(data)
    .digest('hex');

  const tokenData = Buffer.from(`${data}.${hmac}`).toString('base64url');
  return tokenData;
}

export function verifyContentToken(
  token: string
): { userId: string; courseId: string; lessonId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return null;

    const data = decoded.substring(0, lastDot);
    const hmac = decoded.substring(lastDot + 1);

    const expectedHmac = crypto
      .createHmac('sha256', CONTENT_TOKEN_SECRET)
      .update(data)
      .digest('hex');

    if (!hmac || hmac.length !== expectedHmac.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return null;
    }

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;

    return {
      userId: payload.userId,
      courseId: payload.courseId,
      lessonId: payload.lessonId,
    };
  } catch {
    return null;
  }
}
