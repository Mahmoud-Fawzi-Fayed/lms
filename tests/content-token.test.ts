import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.CONTENT_SECRET = 'a'.repeat(64);
});

describe('content-token', () => {
  it('round-trips userId/courseId/lessonId', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const token = generateContentToken('u1', 'c1', 'l1');
    const parsed = verifyContentToken(token);
    expect(parsed).toMatchObject({ userId: 'u1', courseId: 'c1', lessonId: 'l1' });
  });

  it('rejects tampered HMAC', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const token = generateContentToken('u1', 'c1', 'l1');
    // flip a character in the base64url body
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(verifyContentToken(tampered)).toBeNull();
  });

  it('rejects garbage tokens', async () => {
    const { verifyContentToken } = await import('@/lib/content-token');
    expect(verifyContentToken('not-a-real-token')).toBeNull();
    expect(verifyContentToken('')).toBeNull();
    expect(verifyContentToken(Buffer.from('foo').toString('base64url'))).toBeNull();
  });

  it('rejects tokens signed with a different secret', async () => {
    const { generateContentToken } = await import('@/lib/content-token');
    const token = generateContentToken('u1', 'c1', 'l1');

    // Reset module cache and re-import with a different secret.
    process.env.CONTENT_SECRET = 'b'.repeat(64);
    const fresh = await import('@/lib/content-token?v=2' as any).catch(() => null);
    // ESM cache means re-import returns same module unless we bust it; instead, verify
    // directly by replacing the secret and calling verify on the OLD token.
    const { verifyContentToken } = await import('@/lib/content-token');
    expect(verifyContentToken(token)).toBeNull();

    // restore for subsequent tests
    process.env.CONTENT_SECRET = 'a'.repeat(64);
  });

  it('throws when CONTENT_SECRET is missing or too short', async () => {
    const original = process.env.CONTENT_SECRET;
    process.env.CONTENT_SECRET = 'short';
    // Use a fresh import; vitest caches modules, so we test via the export indirectly.
    const { generateContentToken } = await import('@/lib/content-token');
    expect(() => generateContentToken('u', 'c', 'l')).toThrow(/CONTENT_SECRET/);
    process.env.CONTENT_SECRET = original;
  });

  // ── Session-fingerprint helpers ──────────────────────────────────────────
  it('hashUserAgent is stable and 16 hex chars', async () => {
    const { hashUserAgent } = await import('@/lib/content-token');
    const a = hashUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    const b = hashUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hashUserAgent('different')).not.toBe(a);
    expect(hashUserAgent(null)).toBe(hashUserAgent(''));
  });

  it('ipPrefix keeps first 3 octets of IPv4 and first 4 hextets of IPv6', async () => {
    const { ipPrefix } = await import('@/lib/content-token');
    expect(ipPrefix('203.0.113.45')).toBe('203.0.113');
    expect(ipPrefix('203.0.113.99')).toBe('203.0.113'); // same /24
    expect(ipPrefix('198.51.100.7')).toBe('198.51.100');
    expect(ipPrefix('2001:db8:abcd:1234:5678::1')).toBe('2001:db8:abcd:1234');
    expect(ipPrefix('')).toBe('');
    expect(ipPrefix(null)).toBe('');
    expect(ipPrefix('garbage')).toBe('');
  });

  it('round-trips a fingerprint through the token', async () => {
    const { generateContentToken, verifyContentToken, hashUserAgent, ipPrefix } = await import('@/lib/content-token');
    const fp = { uaHash: hashUserAgent('test-ua'), ipPrefix: ipPrefix('10.0.0.1') };
    const token = generateContentToken('u1', 'c1', 'l1', fp);
    const parsed = verifyContentToken(token);
    expect(parsed?.uaHash).toBe(fp.uaHash);
    expect(parsed?.ipPrefix).toBe(fp.ipPrefix);
  });

  it('fingerprintMatches allows legacy tokens without fingerprint', async () => {
    const { fingerprintMatches } = await import('@/lib/content-token');
    expect(fingerprintMatches(
      { userId: 'u', courseId: 'c', lessonId: 'l' },
      { uaHash: 'xxxx', ipPrefix: '1.2.3' },
    )).toBe(true);
  });

  it('fingerprintMatches rejects UA / IP mismatch', async () => {
    const { fingerprintMatches } = await import('@/lib/content-token');
    expect(fingerprintMatches(
      { userId: 'u', courseId: 'c', lessonId: 'l', uaHash: 'aaaa', ipPrefix: '1.2.3' },
      { uaHash: 'bbbb', ipPrefix: '1.2.3' },
    )).toBe(false);
    expect(fingerprintMatches(
      { userId: 'u', courseId: 'c', lessonId: 'l', uaHash: 'aaaa', ipPrefix: '1.2.3' },
      { uaHash: 'aaaa', ipPrefix: '9.9.9' },
    )).toBe(false);
    expect(fingerprintMatches(
      { userId: 'u', courseId: 'c', lessonId: 'l', uaHash: 'aaaa', ipPrefix: '1.2.3' },
      { uaHash: 'aaaa', ipPrefix: '1.2.3' },
    )).toBe(true);
  });

  // ── Token kind & TTL ─────────────────────────────────────────────────────
  it('round-trips token kind=stream', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const token = generateContentToken('u1', 'c1', 'l1', undefined, 'stream');
    const parsed = verifyContentToken(token);
    expect(parsed?.kind).toBe('stream');
  });

  it('defaults kind to raw when not specified', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const token = generateContentToken('u1', 'c1', 'l1');
    const parsed = verifyContentToken(token);
    expect(parsed?.kind === 'raw' || parsed?.kind === undefined).toBe(true);
  });

  it('raw token expires in ~30min, stream token in ~4h', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const rawIat = Date.now();
    const rawTok = generateContentToken('u1', 'c1', 'l1', undefined, 'raw');
    const streamTok = generateContentToken('u1', 'c1', 'l1', undefined, 'stream');
    const rawParsed = verifyContentToken(rawTok)!;
    const streamParsed = verifyContentToken(streamTok)!;

    // raw token TTL ~30 min
    expect(rawParsed.exp! - rawIat).toBeGreaterThan(29 * 60_000);
    expect(rawParsed.exp! - rawIat).toBeLessThan(31 * 60_000);

    // stream TTL ~4h
    expect(streamParsed.exp! - rawIat).toBeGreaterThan(239 * 60_000);
    expect(streamParsed.exp! - rawIat).toBeLessThan(241 * 60_000);
  });

  it('embeds iat issuance timestamp', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const before = Date.now();
    const tok = generateContentToken('u1', 'c1', 'l1');
    const parsed = verifyContentToken(tok)!;
    const after = Date.now();
    expect(parsed.iat).toBeGreaterThanOrEqual(before);
    expect(parsed.iat).toBeLessThanOrEqual(after);
  });

  // ── Expiry ────────────────────────────────────────────────────────────────
  it('rejects a token whose exp is in the past', async () => {
    const { verifyContentToken } = await import('@/lib/content-token');
    const secret = process.env.CONTENT_SECRET!;
    const payload = JSON.stringify({
      userId: 'u1',
      courseId: 'c1',
      lessonId: 'l1',
      kind: 'raw',
      iat: Date.now() - 60_000,
      exp: Date.now() - 1, // already expired
      nonce: 'deadbeef',
    });
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = Buffer.from(`${payload}.${hmac}`).toString('base64url');
    expect(verifyContentToken(token)).toBeNull();
  });

  it('accepts a token whose exp is in the future (just issued)', async () => {
    const { generateContentToken, verifyContentToken } = await import('@/lib/content-token');
    const token = generateContentToken('u1', 'c1', 'l1');
    // Must still be valid immediately after creation
    expect(verifyContentToken(token)).not.toBeNull();
  });

  it('rejects a token with invalid JSON payload', async () => {
    const { verifyContentToken } = await import('@/lib/content-token');
    const secret = process.env.CONTENT_SECRET!;
    const badPayload = 'not-json';
    const hmac = crypto.createHmac('sha256', secret).update(badPayload).digest('hex');
    const token = Buffer.from(`${badPayload}.${hmac}`).toString('base64url');
    expect(verifyContentToken(token)).toBeNull();
  });
});
