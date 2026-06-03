/**
 * Unit tests — src/lib/i18n.ts
 *
 * Tiny module but it powers every user-facing error message. Bugs here would
 * surface as English copy in an Arabic UI (or vice-versa) for every error
 * thrown anywhere in the app.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setGlobalLang, getLang, t, type Lang } from '@/lib/i18n';

describe('i18n', () => {
  // Reset to default (Arabic) before every test so module-level state
  // never leaks between cases.
  beforeEach(() => {
    setGlobalLang('ar');
  });

  it('default language is ar', () => {
    expect(getLang()).toBe('ar');
  });

  it('t() returns the Arabic string by default', () => {
    expect(t('مرحبا', 'Hello')).toBe('مرحبا');
  });

  it('t() returns the English string after switching to en', () => {
    setGlobalLang('en');
    expect(t('مرحبا', 'Hello')).toBe('Hello');
    expect(getLang()).toBe('en');
  });

  it('t() switches back to Arabic when language is set back to ar', () => {
    setGlobalLang('en');
    expect(t('م', 'M')).toBe('M');
    setGlobalLang('ar');
    expect(t('م', 'M')).toBe('م');
  });

  it('setGlobalLang accepts only "ar" or "en" (TypeScript Lang type)', () => {
    const valid: Lang[] = ['ar', 'en'];
    for (const l of valid) {
      setGlobalLang(l);
      expect(getLang()).toBe(l);
    }
  });

  it('t() preserves the exact strings passed in (no transformation)', () => {
    setGlobalLang('en');
    expect(t('  spaced  ', '  spaced en  ')).toBe('  spaced en  ');
    setGlobalLang('ar');
    expect(t('  spaced  ', '  spaced en  ')).toBe('  spaced  ');
  });

  it('t() with empty strings returns the active-lang empty string', () => {
    setGlobalLang('en');
    expect(t('', '')).toBe('');
    setGlobalLang('ar');
    expect(t('', '')).toBe('');
  });

  it('t() handles RTL marks and emoji unchanged', () => {
    setGlobalLang('ar');
    expect(t('\u202Bعربية\u202C', 'English')).toBe('\u202Bعربية\u202C');
    setGlobalLang('en');
    expect(t('🎉', '🎉 hello')).toBe('🎉 hello');
  });
});
