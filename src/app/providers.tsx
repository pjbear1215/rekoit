"use client";

import { SetupProvider } from "@/lib/store";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SetupProvider>{children}</SetupProvider>;
}
