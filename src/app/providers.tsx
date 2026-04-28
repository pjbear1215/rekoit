"use client";

import { SetupProvider } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <SetupProvider>{children}</SetupProvider>
    </I18nProvider>
  );
}
