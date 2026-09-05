"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type Lang = "en" | "zh";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

const LangCtx = createContext<Ctx>({ lang: "zh", setLang: () => {} });

export function LangProvider({ children, initialLang = "zh" }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const router = useRouter();

  useEffect(() => {
    if (document.cookie.split(";").some(v => v.trim().startsWith("hotai-lang="))) return;
    let stored: string | null = null;
    try {
      stored = typeof window !== "undefined" ? localStorage.getItem("hotai-lang") : null;
    } catch {
      stored = null;
    }
    if (stored === "en" || stored === "zh") {
      setLangState(stored);
      document.documentElement.lang = stored;
      document.cookie = `hotai-lang=${stored}; Path=/; Max-Age=31536000; SameSite=Lax`;
      if (stored !== initialLang) router.refresh();
      return;
    }
    setLangState("zh");
    document.documentElement.lang = "zh";
  }, [initialLang, router]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      if (typeof window !== "undefined") localStorage.setItem("hotai-lang", l);
    } catch {
      // Private browsing and storage-disabled environments can reject writes.
    }
    document.documentElement.lang = l;
    document.cookie = `hotai-lang=${l}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  };

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
