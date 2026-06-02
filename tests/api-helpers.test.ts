import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeRegex, isValidObjectId, rateLimit } from '@/lib/api-helpers';

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*c+d?')).toBe('a\\.b\\*c\\+d\\?');
    expect(escapeRegex('(foo|bar)')).toBe('\\(foo\\|bar\\)');
    expect(escapeRegex('^start$')).toBe('\\^start\\$');
    expect(escapeRegex('[abc]')).toBe('\\[abc\\]');
    expect(escapeRegex('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves plain strings unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
  });

  it('coerces non-string input', () => {
    expect(escapeRegex(123 as any)).toBe('123');
  });
});

describe('isValidObjectId', () => {
  it('accepts a 24-hex string', () => {
    expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('rejects strings of other lengths', () => {
    expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false);
    expect(isValidObjectId('507f1f77bcf86cd7994390111')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidObjectId('zzzf1f77bcf86cd799439011')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidObjectId('')).toBe(false);
  });
});

describe('escapeRegex — additional edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('escapes curly-brace quantifiers', () => {
    expect(escapeRegex('a{3}')).toBe('a\\{3\\}');
  });

  it('leaves plain Unicode / emoji unchanged', () => {
    // Emoji and Arabic letters have no special meaning in regex — no escaping needed.
    expect(escapeRegex('مرحبا 🎉')).toBe('مرحبا 🎉');
  });
});

describe('rateLimit', () => {
  it('allows up to N requests then blocks', () => {
    const id = `unit-test:${Date.now()}:${Math.random()}`;
    expect(rateLimit(id, 3, 60_000)).toBe(true);
    expect(rateLimit(id, 3, 60_000)).toBe(true);
    expect(rateLimit(id, 3, 60_000)).toBe(true);
    expect(rateLimit(id, 3, 60_000)).toBe(false);
  });

  it('keeps separate buckets per identifier', () => {
    const a = `unit-test-a:${Date.now()}:${Math.random()}`;
    const b = `unit-test-b:${Date.now()}:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });

  it('allows exactly maxRequests before blocking (boundary check)', () => {
    const id = `unit-exact-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(id, 5, 60_000)).toBe(true);
    }
    expect(rateLimit(id, 5, 60_000)).toBe(false);
  });
});

describe('rateLimit window reset', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resets counter after the window expires', () => {
    const id = `unit-reset-${Math.random()}`;
    const WINDOW = 1_000; // 1 second
    expect(rateLimit(id, 2, WINDOW)).toBe(true);
    expect(rateLimit(id, 2, WINDOW)).toBe(true);
    expect(rateLimit(id, 2, WINDOW)).toBe(false); // blocked

    // Advance clock past the window
    vi.advanceTimersByTime(WINDOW + 1);

    // Counter should reset — requests allowed again
    expect(rateLimit(id, 2, WINDOW)).toBe(true);
    expect(rateLimit(id, 2, WINDOW)).toBe(true);
    expect(rateLimit(id, 2, WINDOW)).toBe(false); // blocked again
  });
});
