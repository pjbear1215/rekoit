"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSetup } from "./store";

// EULA agreement + Connection verification guard
// Used on all pages except welcome (/) and management pages (/manage, /uninstall)
export function useGuard(): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const { state, isLoaded } = useSetup();

  const isWelcome = pathname === "/";
  const allowsCredentialOnly =
    pathname === "/prerequisites"
    || pathname === "/connection"
    || pathname === "/entry"
    || pathname === "/manage"
    || pathname === "/uninstall"
    || pathname === "/bluetooth";
  const isAllowed = state.eulaAgreed && state.connected;
  const hasCredentials = Boolean(state.ip && state.password);

  useEffect(() => {
    if (!isLoaded) return;
    if (isWelcome) return;
    if (allowsCredentialOnly && hasCredentials) return;
    if (!isAllowed) router.replace("/");
  }, [isLoaded, isWelcome, allowsCredentialOnly, isAllowed, hasCredentials, router]);

  if (!isLoaded) return false;
  return isAllowed || isWelcome || (allowsCredentialOnly && hasCredentials);
}
