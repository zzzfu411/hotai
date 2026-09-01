"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "zh";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

const LangCtx = createContext<Ctx>({ lang: "zh", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = typeof window !== "undefined" ? localStorage.getItem("hotai-lang") : null;
    } catch {
      stored = null;
    }
    if (stored === "en" || stored === "zh") {
      setLangState(stored);
      document.documentElement.lang = stored;
      return;
    }
    setLangState("zh");
    document.documentElement.lang = "zh";
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      if (typeof window !== "undefined") localStorage.setItem("hotai-lang", l);
    } catch {
      // Private browsing and storage-disabled environments can reject writes.
    }
    document.documentElement.lang = l;
  };

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
