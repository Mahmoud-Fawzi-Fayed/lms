import { describe, it, expect } from 'vitest';
import {
  normalizeAcademicYear,
  getAcademicYearVariants,
  isSameAcademicYear,
} from '@/lib/academic-year';

describe('normalizeAcademicYear', () => {
  it('returns empty string for nullish input', () => {
    expect(normalizeAcademicYear('')).toBe('');
    expect(normalizeAcademicYear(undefined)).toBe('');
    expect(normalizeAcademicYear(null)).toBe('');
  });

  it('maps short aliases to canonical', () => {
    expect(normalizeAcademicYear('grade4')).toBe('grade4_primary');
    expect(normalizeAcademicYear('prep1')).toBe('grade1_prep');
    expect(normalizeAcademicYear('sec2')).toBe('grade2_secondary');
  });

  it('is case-insensitive and ignores spaces/dashes', () => {
    expect(normalizeAcademicYear('  Grade-4 ')).toBe('grade4_primary');
    expect(normalizeAcademicYear('Prep1')).toBe('grade1_prep');
  });

  it('passes through already-canonical values', () => {
    expect(normalizeAcademicYear('grade4_primary')).toBe('grade4_primary');
  });
});

describe('isSameAcademicYear', () => {
  it('matches alias with canonical', () => {
    expect(isSameAcademicYear('grade4', 'grade4_primary')).toBe(true);
    expect(isSameAcademicYear('Prep1 ', 'grade1_prep')).toBe(true);
  });

  it('returns false on mismatched years', () => {
    expect(isSameAcademicYear('grade4', 'grade5')).toBe(false);
  });

  it('returns false when either side is empty', () => {
    expect(isSameAcademicYear('', 'grade4_primary')).toBe(false);
    expect(isSameAcademicYear('grade4_primary', '')).toBe(false);
  });
});

describe('getAcademicYearVariants', () => {
  it('returns canonical plus all aliases pointing to it', () => {
    const variants = getAcademicYearVariants('grade4');
    expect(variants).toContain('grade4_primary');
    expect(variants).toContain('grade4');
    expect(variants).toContain('grade_4');
    expect(variants).toContain('fourth_primary');
  });

  it('returns [] for empty input', () => {
    expect(getAcademicYearVariants('')).toEqual([]);
  });

  it('returns [] for null/undefined input', () => {
    expect(getAcademicYearVariants(null)).toEqual([]);
    expect(getAcademicYearVariants(undefined)).toEqual([]);
  });

  it('returns only the canonical for a value with no defined aliases', () => {
    // 'completely_unknown_year' has no alias mappings → only itself
    const variants = getAcademicYearVariants('completely_unknown_year');
    expect(variants).toEqual(['completely_unknown_year']);
  });
});

describe('normalizeAcademicYear — additional edge cases', () => {
  it('passes through unknown values (sanitized) unchanged', () => {
    expect(normalizeAcademicYear('my_custom_year')).toBe('my_custom_year');
  });

  it('replaces dashes with underscores during sanitization', () => {
    expect(normalizeAcademicYear('grade-4')).toBe('grade4_primary');
  });

  it('handles all-whitespace input as empty', () => {
    expect(normalizeAcademicYear('   ')).toBe('');
  });
});

describe('isSameAcademicYear — additional edge cases', () => {
  it('returns false when both inputs are null', () => {
    expect(isSameAcademicYear(null, null)).toBe(false);
  });

  it('returns false when both inputs are undefined', () => {
    expect(isSameAcademicYear(undefined, undefined)).toBe(false);
  });

  it('two different unknown values are not equal', () => {
    expect(isSameAcademicYear('alpha', 'beta')).toBe(false);
  });

  it('same unknown value normalizes to same string → equal', () => {
    expect(isSameAcademicYear('special-year', 'special_year')).toBe(true);
  });
});
