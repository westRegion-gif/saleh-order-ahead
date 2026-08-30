'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { updateMe } from './_api';
import { readCustomerProfile, readCustomerToken, saveCustomerSession } from './_auth';

export type Language = 'ar' | 'en';

const STORAGE_KEY = 'lmtd_language';

type LanguageContextValue = {
  language: Language;
  dir: 'rtl' | 'ltr';
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyLanguage(language: Language) {
  if (typeof document === 'undefined') return;
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
  document.documentElement.dir = dir;
  document.body.dir = dir;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ar');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const profile = readCustomerProfile();
    const initial: Language = stored === 'en' || stored === 'ar'
      ? stored
      : profile?.preferredLanguage === 'en'
        ? 'en'
        : 'ar';
    setLanguageState(initial);
    localStorage.setItem(STORAGE_KEY, initial);
    applyLanguage(initial);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);

    const token = readCustomerToken();
    if (token) {
      updateMe({ preferredLanguage: next })
        .then((customer) => saveCustomerSession(token, customer))
        .catch(() => undefined);
    }
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    dir: language === 'ar' ? 'rtl' : 'ltr',
    setLanguage,
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className={`languageToggle${compact ? ' compact' : ''}`} role="group" aria-label="Language">
      <button type="button" className={language === 'ar' ? 'active' : ''} onClick={() => setLanguage('ar')}>عربي</button>
      <span>/</span>
      <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
}
