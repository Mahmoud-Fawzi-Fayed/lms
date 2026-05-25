/**
 * Minimal i18n helper.
 * `t(ar, en)` returns the string matching the active language.
 * The language state lives in this module so it can be used
 * outside React (e.g. in plain async functions) without hooks.
 */

export type Lang = 'ar' | 'en';

const DEFAULT_LANG: Lang = 'ar';
let _lang: Lang = DEFAULT_LANG;

/** Called by LanguageContext whenever the language changes. */
export function setGlobalLang(l: Lang): void {
  _lang = l;
}

export function getLang(): Lang {
  return _lang;
}

/**
 * Return `ar` when the active language is Arabic, `en` otherwise.
 * Usage: `t('فشل التحميل', 'Load failed')`
 */
export function t(ar: string, en: string): string {
  return _lang === 'ar' ? ar : en;
}
