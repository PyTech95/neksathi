import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { STRINGS } from "./translations";

const LANG_KEY = "nk_lang";
export const LANGS = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिंदी" },
];

const getInitial = () => {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "hi" || v === "en" ? v : "en";
  } catch { return "en"; }
};

const I18nCtx = createContext({ lang: "en", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getInitial);

  const setLang = useCallback((l) => {
    const next = l === "hi" ? "hi" : "en";
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  }, []);

  useEffect(() => { try { document.documentElement.setAttribute("lang", lang); } catch { /* ignore */ } }, [lang]);

  // t(key, vars?) — current language, falling back to English, then the key itself.
  const t = useCallback((key, vars) => {
    const table = STRINGS[lang] || STRINGS.en;
    let s = table[key];
    if (s == null) s = STRINGS.en[key];
    if (s == null) s = key;
    if (vars) {
      for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
    }
    return s;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT() { return useContext(I18nCtx); }
