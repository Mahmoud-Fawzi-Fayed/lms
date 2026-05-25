'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { setGlobalLang, type Lang } from '@/lib/i18n';

const LS_KEY = 'lms_lang';
const DEFAULT: Lang = 'ar';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LangCtx>({
  lang: DEFAULT,
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY) as Lang | null;
    const init: Lang = stored === 'en' ? 'en' : DEFAULT;
    applyLang(init);
    setLangState(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyLang(l: Lang) {
    setGlobalLang(l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem(LS_KEY, l);
  }

  const setLang = (l: Lang) => {
    applyLang(l);
    setLangState(l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Returns `{ lang, setLang }`. Use to read language or toggle it. */
export function useLang() {
  return useContext(LanguageContext);
}
