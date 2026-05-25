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
});
