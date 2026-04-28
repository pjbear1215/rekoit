"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import { useSetup } from "@/lib/store";
import { useGuard } from "@/lib/useGuard";
import { useTranslation } from "@/lib/i18n";

const DEVICE_NAMES: Record<string, string> = {
  "paper-pro": "Paper Pro",
  "paper-pro-move": "Paper Pro Move",
};

const DEVICE_DESCS: Record<string, string> = {
  "paper-pro": "Korean Input Engine + Bluetooth Keyboard",
  "paper-pro-move": "Korean Input Engine + Bluetooth Keyboard",
};

export default function ConnectionPage() {
  const { t } = useTranslation();
  const allowed = useGuard();
  const router = useRouter();
  const { state, setState } = useSetup();
  const [testing, setTesting] = useState(false);
  const [autoTested, setAutoTested] = useState(false);
  const autoNavigatedRef = useRef(false);
  const [result, setResult] = useState<{
    connected: boolean;
    hostname?: string;
    firmware?: string;
    freeSpace?: string;
    model?: string;
    detectedDevice?: "paper-pro-move" | "paper-pro" | null;
    error?: string;
  } | null>(null);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/ssh/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: state.ip, password: state.password }),
      });
      const data = await res.json();
      setResult(data);
      if (data.connected) {
        setState({
          connected: true,
          detectedDevice: data.detectedDevice ?? null,
          deviceModel: data.model ?? "",
          deviceType: data.detectedDevice ?? state.deviceType,
        });
      }
    } catch {
      setResult({ connected: false, error: "A server error occurred." });
    } finally {
      setTesting(false);
    }
  }, [state.ip, state.password, state.deviceType, setState]);

  useEffect(() => {
    if (!allowed) return;
    if (state.ip && state.password && !autoTested) {
      setAutoTested(true);
      handleTest();
    }
  }, [allowed, state.ip, state.password, autoTested, handleTest]);

  const isConnected = result?.connected === true;
  const detectedType = result?.detectedDevice;
  const isUnsupported = isConnected && !detectedType;
  const deviceReady = isConnected && detectedType;

  useEffect(() => {
    if (!allowed || testing || !deviceReady || autoNavigatedRef.current) {
      return;
    }
    autoNavigatedRef.current = true;
    router.push("/entry");
  }, [allowed, testing, deviceReady, router]);

  if (!allowed) return null;

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={2} />

      <div className="space-y-8">
        <div>
          <h1
            className="text-[32px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t('connection.title')}
          </h1>
          <p
            className="mt-2 text-[15px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {t('connection.description')}
          </p>
        </div>

        <div
          className="flex items-center justify-between py-2 stagger-1"
        >
          <div>
            <span className="text-[15px] font-mono opacity-60" style={{ color: "var(--text-muted)" }}>
              {state.ip}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            loading={testing}
          >
            {testing ? t('common.loading') : t('common.retry')}
          </Button>
        </div>

        {testing && !result && (
          <div
            className="py-8 text-center rounded-xl"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div className="flex items-center justify-center gap-3">
              <span className="inline-flex gap-1" style={{ color: "var(--accent)" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "currentColor", animation: "dotBounce 1.4s ease-in-out infinite", animationDelay: `${i * 0.16}s` }} />
                ))}
              </span>
              <span className="text-[16px]" style={{ color: "var(--text-muted)" }}>
                {t('connection.checkingDevice')}
              </span>
            </div>
          </div>
        )}

        {result && (
          <div
            className="rounded-xl stagger-2"
            style={{
              backgroundColor: isConnected ? "var(--success-light)" : "var(--error-light)",
              color: isConnected ? "var(--success)" : "var(--error)",
              padding: "20px 24px",
            }}
          >
            {isConnected ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[17px]">{t('connection.connectionSuccess')}</span>
                  <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {result.hostname} | {result.firmware} | {result.freeSpace}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-medium text-[17px]">{t('connection.connectionFailedTitle')}</p>
                <p className="text-[15px]" style={{ color: "var(--text-muted)" }}>
                  {result.error}
                </p>
                <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                  {t('connection.connectionFailedHelp')}
                </p>
                <Button variant="secondary" size="sm" onClick={() => router.push("/")} icon={<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="15 18 9 12 15 6" /></svg>}>
                  {t('common.first')}
                </Button>
              </div>
            )}
          </div>
        )}

        {isConnected && (
          <div className="space-y-3 stagger-3">
            {(["paper-pro", "paper-pro-move"] as const).map((id) => {
              const isDetected = detectedType === id;
              return (
                <div
                  key={id}
                  className="card-interactive rounded-xl flex items-center justify-between transition-all"
                  style={{
                    backgroundColor: isDetected ? "var(--bg-card)" : "var(--bg-secondary)",
                    border: isDetected ? "2px solid var(--accent)" : "2px solid transparent",
                    opacity: isDetected ? 1 : 0.4,
                    padding: "20px 24px",
                  }}
                >
                  <div>
                    <span
                      className="text-[17px] font-medium"
                      style={{ color: isDetected ? "var(--text-primary)" : "var(--text-muted)" }}
                    >
                      {DEVICE_NAMES[id]}
                    </span>
                    <span className="text-[14px] ml-3" style={{ color: "var(--text-muted)" }}>
                      {t('entry.installHangulTitle')} + {t('entry.installBtTitle')}
                    </span>
                  </div>
                  {isDetected && (
                    <span
                      className="text-[12px] flex-shrink-0"
                      style={{ backgroundColor: "var(--success-light)", color: "var(--success)", borderRadius: "9999px", padding: "4px 12px" }}
                    >
                      {t('connection.detected')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isUnsupported && (
          <div
            className="py-5 px-6 rounded-xl"
            style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}
          >
            <p className="font-medium text-[16px]">{t('connection.unsupported')}</p>
            <p className="text-[14px] mt-1" style={{ color: "var(--text-muted)" }}>
              {t('connection.unsupportedHelp', { model: result?.model || 'Device' })}
            </p>
          </div>
        )}

        <div className="flex justify-between pt-4 stagger-3">
          <Button
            variant="ghost"
            onClick={() => router.push("/prerequisites")}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>}
          >
            {t('common.back')}
          </Button>
          <Button
            onClick={() => router.push("/entry")}
            disabled={!deviceReady}
            size="lg"
          >
            {t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
