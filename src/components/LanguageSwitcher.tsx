"use client";

import { useTranslation } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <div 
      className="flex items-center gap-1 p-1 bg-black/[0.04] border border-black/10 rounded-full"
      style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }}
    >
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${
          language === "en" 
            ? "bg-white text-black shadow-sm" 
            : "text-black/40 hover:text-black/60"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("ko")}
        className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${
          language === "ko" 
            ? "bg-white text-black shadow-sm" 
            : "text-black/40 hover:text-black/60"
        }`}
      >
        KO
      </button>
    </div>
  );
}
