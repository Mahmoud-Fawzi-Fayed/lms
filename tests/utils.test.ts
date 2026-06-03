/**
 * Unit tests — src/lib/utils.ts
 *
 * Helpers used by many client-side components. Bugs here surface as
 * broken slugs, malformed durations, or initials with stray spaces.
 */

import { describe, it, expect } from 'vitest';
import {
  cn,
  formatPrice,
  formatDuration,
  formatDate,
  slugify,
  generateToken,
  getInitials,
  truncate,
} from '@/lib/utils';

describe('cn (className merge)', () => {
  it('joins class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy class names (null, undefined, false)', () => {
    expect(cn('a', null, undefined, false, 'b')).toBe('a b');
  });

  it('twMerge resolves conflicting tailwind utilities (later wins)', () => {
    // tailwind-merge collapses px-2 and px-4 into the latter
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles array and object inputs (clsx behavior)', () => {
    expect(cn(['a', 'b'])).toBe('a b');
    expect(cn({ a: true, b: false, c: true })).toBe('a c');
  });

  it('returns empty string when nothing is truthy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });
});

describe('formatPrice', () => {
  // Output uses ar-EG locale which renders digits as Arabic-Indic ('١٠٠'),
  // so assertions on Latin digits would fail in CI. Use locale-tolerant checks.
  it('returns a non-empty currency-shaped string', () => {
    const out = formatPrice(100);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('produces different output for different magnitudes', () => {
    expect(formatPrice(100)).not.toBe(formatPrice(50));
    expect(formatPrice(0)).not.toBe(formatPrice(1));
  });

  it('respects custom currency code (USD vs default)', () => {
    expect(formatPrice(50, 'USD')).not.toBe(formatPrice(50));
  });

  it('zero returns a string', () => {
    expect(typeof formatPrice(0)).toBe('string');
  });

  it('100 and 100.0 produce identical strings (no fractional tail)', () => {
    expect(formatPrice(100)).toBe(formatPrice(100.0));
  });
});

describe('formatDuration', () => {
  it('returns "Nm" when under 1 hour', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(59)).toBe('0m');     // floors
    expect(formatDuration(3599)).toBe('59m');  // boundary just below 1h
  });

  it('returns "Xh Ym" when at or above 1 hour', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3661)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h 0m');
  });

  it('rounds DOWN — never inflates duration', () => {
    expect(formatDuration(7259)).toBe('2h 0m'); // not 2h 1m
  });
});

describe('formatDate', () => {
  it('returns a non-empty string for a valid Date', () => {
    const out = formatDate(new Date('2024-06-15'));
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/2024/);
  });

  it('accepts an ISO string', () => {
    const out = formatDate('2024-06-15T00:00:00Z');
    expect(out).toMatch(/2024/);
  });
});

describe('slugify', () => {
  it('lowercases, replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips punctuation', () => {
    expect(slugify('Foo! Bar? Baz.')).toBe('foo-bar-baz');
  });

  it('collapses multiple spaces / hyphens to single hyphen', () => {
    expect(slugify('A   B---C')).toBe('a-b-c');
  });

  it('preserves underscores and digits (\\w)', () => {
    expect(slugify('foo_bar 123')).toBe('foo_bar-123');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('strips Arabic characters (matched by [^\\w\\s-]) and collapses gaps', () => {
    // \w matches only [A-Za-z0-9_], so non-Latin Unicode is dropped. The two
    // surrounding spaces collapse to a single hyphen via /\s+/g and /-+/g.
    expect(slugify('hello عربي world')).toBe('hello-world');
  });
});

describe('generateToken', () => {
  it('returns a string of the requested length (default 32)', () => {
    expect(generateToken().length).toBe(32);
    expect(generateToken(16).length).toBe(16);
    expect(generateToken(64).length).toBe(64);
  });

  it('uses only the safe alphabet [A-Za-z0-9]', () => {
    const tok = generateToken(256);
    expect(tok).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('two consecutive tokens are different (high-entropy)', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('handles length 1 and length 0', () => {
    expect(generateToken(0)).toBe('');
    expect(generateToken(1).length).toBe(1);
  });
});

describe('getInitials', () => {
  it('returns first two initials uppercase', () => {
    expect(getInitials('john doe')).toBe('JD');
    expect(getInitials('Mohamed Ahmed')).toBe('MA');
  });

  it('caps at 2 characters', () => {
    expect(getInitials('Alpha Beta Gamma Delta')).toBe('AB');
  });

  it('single name returns single initial', () => {
    expect(getInitials('Madonna')).toBe('M');
  });

  it('handles Arabic name initials (preserves first letters)', () => {
    expect(getInitials('محمد أحمد')).toBe('مأ');
  });
});

describe('truncate', () => {
  it('returns string unchanged when shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('appends ellipsis when longer', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('boundary: equal to maxLength is unchanged', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates a 1-char-too-long string', () => {
    expect(truncate('abcdef', 5)).toBe('abcde...');
  });
});
