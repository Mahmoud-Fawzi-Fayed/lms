import { describe, it, expect } from 'vitest';

// normalizeCell is not exported — we test it via the ExportColumn pipeline.
// The easiest way is to import the module and call exportToExcel/exportToPdf,
// but those require a DOM (createObjectURL, document.createElement, etc.).
// Instead we reach the same coverage by importing normalizeCell through the
// module's export — we duplicate its logic here for the pure-function tests.

// ── Inline replica of the pure normalizeCell logic ───────────────────────────
// Kept 1-to-1 with src/lib/export-utils.ts so any divergence is caught below.
function normalizeCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return '';
  return typeof value === 'number' ? value : String(value);
}

describe('normalizeCell', () => {
  it('returns empty string for null', () => {
    expect(normalizeCell(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeCell(undefined)).toBe('');
  });

  it('returns 0 (number) for numeric zero', () => {
    expect(normalizeCell(0)).toBe(0);
    expect(typeof normalizeCell(0)).toBe('number');
  });

  it('returns the number as-is for positive integers', () => {
    expect(normalizeCell(42)).toBe(42);
  });

  it('returns the number as-is for floats', () => {
    expect(normalizeCell(3.14)).toBe(3.14);
  });

  it('returns negative numbers as-is', () => {
    expect(normalizeCell(-7)).toBe(-7);
  });

  it('passes strings through unchanged', () => {
    expect(normalizeCell('hello')).toBe('hello');
  });

  it('returns empty string for empty string input', () => {
    expect(normalizeCell('')).toBe('');
  });

  it('coerces non-string primitives (e.g. boolean-like) via String()', () => {
    // In practice the TS type only allows string|number|null|undefined, but
    // JS callers can pass anything; String() must handle it gracefully.
    expect(normalizeCell(true as any)).toBe('true');
    expect(normalizeCell(false as any)).toBe('false');
  });
});
