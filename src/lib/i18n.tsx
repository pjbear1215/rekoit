"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { en } from "@/locales/en";
import { ko } from "@/locales/ko";

type Language = "en" | "ko";
type Dictionary = typeof en;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const dictionaries: Record<Language, any> = { en, ko };

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageInternal] = useState<Language>("en");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("rekoit-lang") as Language;
    if (saved && (saved === "en" || saved === "ko")) {
      setLanguageInternal(saved);
    } else {
      const browserLang = navigator.language.toLowerCase();
      const initial = browserLang.startsWith("ko") ? "ko" : "en";
      setLanguageInternal(initial);
      localStorage.setItem("rekoit-lang", initial);
    }
    setIsLoaded(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageInternal(lang);
    localStorage.setItem("rekoit-lang", lang);
    document.documentElement.lang = lang;
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = dictionaries[language];
    const keys = key.split(".");
    let value = dict;
    
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return key; // Fallback to key if not found
      }
    }
    
    if (typeof value !== "string") return key;

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = (value as string).split(`{${k}}`).join(String(v));
      });
    }
    
    return value;
  }, [language]);

  const value = React.useMemo(() => ({
    language,
    setLanguage,
    t
  }), [language, setLanguage, t]);

  if (!isLoaded) return null;

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within I18nProvider");
  }
  return context;
}
