import { describe, it, expect } from 'vitest';
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

  it('rejects non-strings', () => {
    expect(isValidObjectId(123 as any)).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(undefined)).toBe(false);
    expect(isValidObjectId({} as any)).toBe(false);
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
});
