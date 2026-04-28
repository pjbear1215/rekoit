"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import ProgressBar from "@/components/ProgressBar";
import TerminalOutput from "@/components/TerminalOutput";
import ErrorReport from "@/components/ErrorReport";
import { useSetup } from "@/lib/store";
import { ensureSshSession } from "@/lib/client/sshSession";
import { useTranslation } from "@/lib/i18n";

type UninstallStatus = "ready" | "uninstalling" | "complete" | "error";

export default function UninstallPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useSetup();
  const returnPath = state.ip && state.password ? "/entry" : "/";
  const [status, setStatus] = useState<UninstallStatus>("ready");
  const [logs, setLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const cleanupFiles = true;
  const targetParam = searchParams.get("target");
  const removeTarget = targetParam === "hangul" || targetParam === "bt" ? targetParam : "all";
  const isPartialRemove = removeTarget !== "all";
  const [detected, setDetected] = useState<{
    hangul: boolean;
    bt: boolean;
    factoryGuard: boolean;
    swupdateHook: boolean;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusRef = useRef<UninstallStatus>("ready");

  const pageTitle = isPartialRemove
    ? removeTarget === "hangul"
      ? t('uninstall.titleHangul')
      : t('uninstall.titleBt')
    : t('uninstall.title');
    
  const pageDescription = isPartialRemove
    ? removeTarget === "hangul"
      ? t('uninstall.descHangul')
      : t('uninstall.descBt')
    : t('uninstall.descAll');
    
  const readyGuideTitle = isPartialRemove ? t('uninstall.readyGuideTitlePartial') : t('uninstall.readyGuideTitle');
  
  const completeMessage = isPartialRemove
    ? removeTarget === "hangul"
      ? t('uninstall.completeMessageHangul')
      : t('uninstall.completeMessageBt')
    : t('uninstall.completeMessage');
    
  const errorContext = t('uninstall.errorContext');
  const startLabel = t('uninstall.startUninstall');

  const startUninstall = async (): Promise<void> => {
    statusRef.current = "uninstalling";
    setStatus("uninstalling");
    setLogs([]);
    setErrors([]);
    setProgress(0);

    try {
      await ensureSshSession(state.ip, state.password);
    } catch {
      statusRef.current = "error";
      setStatus("error");
      setLogs([`ERROR: ${t('install.sshAuthFailed') || "Unable to prepare SSH session."}`]);
      setErrors([t('install.sshAuthFailed') || "Unable to prepare SSH session."]);
      return;
    }

    if (isPartialRemove) {
      setCurrentStep(removeTarget === "hangul" ? t('uninstall.titleHangul') : t('uninstall.titleBt'));
      setProgress(20);
      try {
        const res = await fetch("/api/manage/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password, target: removeTarget }),
        });
        const data = await res.json();
        const nextLogs = Array.isArray(data.logs) ? data.logs : [];
        setLogs(nextLogs);

        if (!res.ok || data.success !== true) {
          const message = data.error ?? t('common.error');
          const errLine = `ERROR: ${message}`;
          setErrors([errLine]);
          setLogs((prev) => [...prev, errLine]);
          statusRef.current = "error";
          setStatus("error");
          setProgress(100);
          return;
        }

        setProgress(100);
        statusRef.current = "complete";
        setStatus("complete");
      } catch {
        const errLine = `ERROR: ${t('common.error')}`;
        setErrors([errLine]);
        setLogs([errLine]);
        statusRef.current = "error";
        setStatus("error");
      }
      return;
    }

    const params = new URLSearchParams({
      cleanup: String(cleanupFiles),
      deleteFont: "true",
    });

    const es = new EventSource(`/api/uninstall/stream?${params}`);
    eventSourceRef.current = es;

    es.addEventListener("detect", (e) => {
      const data = JSON.parse(e.data);
      setDetected(data);
    });

    es.addEventListener("step", (e) => {
      const data = JSON.parse(e.data);
      setCurrentStep(data.name);
      if (data.status === "complete") {
        setLogs((prev) => [...prev, `OK: ${data.name}`]);
      }
    });

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      const line = data.line as string;
      setLogs((prev) => [...prev, line]);
      if (line.startsWith("ERROR") || line.startsWith("FAIL")) {
        setErrors((prev) => [...prev, line]);
      }
    });

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setProgress(data.percent);
    });

    es.addEventListener("complete", () => {
      statusRef.current = "complete";
      setStatus("complete");
      setProgress(100);
      es.close();
    });

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        const errLine = `ERROR: ${data.message}`;
        setLogs((prev) => [...prev, errLine]);
        setErrors((prev) => [...prev, errLine]);
      } catch {
        setLogs((prev) => [...prev, `ERROR: ${t('common.error')}`]);
        setErrors((prev) => [...prev, t('common.error')]);
      }
      statusRef.current = "error";
      setStatus("error");
      es.close();
    });

    es.onerror = () => {
      if (statusRef.current === "uninstalling") {
        statusRef.current = "error";
        setStatus("error");
        setLogs((prev) => [...prev, `ERROR: ${t('common.error')}`]);
        setErrors((prev) => [...prev, t('common.error')]);
      }
      es.close();
    };
  };

  return (
    <div className="animate-fade-in-up">
      <div className="space-y-6">
        <div>
          <h1
            className="text-[32px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {pageTitle}
          </h1>
          <p className="text-[15px] mt-2 font-medium" style={{ color: "var(--text-muted)" }}>
            {pageDescription}
          </p>
        </div>

        <div className="stagger-1">
          <div className="space-y-8">
            {/* Warning */}
              {status === "ready" && (
                <div className="space-y-4">
                  <div
                    className="rounded-none animate-fade-in-up"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      padding: "20px 24px",
                      borderLeft: "4px solid var(--border)",
                      borderTop: "1.5px solid var(--border)",
                      borderRight: "1.5px solid var(--border)",
                      borderBottom: "1.5px solid var(--border)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[18px]">⚠️</span>
                      <p className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                        {readyGuideTitle}
                      </p>
                    </div>
                    <ul className="space-y-2.5 text-[15px]" style={{ color: "var(--text-secondary)" }}>
                      {(isPartialRemove ? [
                        t('uninstall.guideItemPartial1'),
                        t('uninstall.guideItemPartial2'),
                        t('uninstall.guideItemPartial3')
                      ] : [
                        t('uninstall.guideItemAll1'),
                        t('uninstall.guideItemAll2'),
                        t('uninstall.guideItemAll3'),
                        t('uninstall.guideItemAll4')
                      ]).map((text, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                          <span className="font-medium">{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Progress */}
              {status !== "ready" && (
                <div className="space-y-8 py-4 animate-fade-in">
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-1.5 text-[22px] font-bold text-black">
                      <span>{currentStep || (status === "complete" ? t('uninstall.completeStatus') : t('common.loading'))}</span>
                      {status === "uninstalling" && (
                        <span className="flex gap-1 ml-1">
                          <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] font-medium opacity-50">
                      {status === "uninstalling" ? t('uninstall.uninstallingStatus') : 
                       status === "complete" ? t('complete.description') : t('common.error')}
                    </p>
                  </div>
                  <div className="w-full">
                    <ProgressBar
                      progress={progress}
                      status={status === "error" ? "error" : status === "complete" ? "complete" : "active"}
                    />
                  </div>
                  <div className="pt-4 border-t border-black/5">
                    <TerminalOutput
                      lines={logs}
                      maxHeight="240px"
                      title={t('uninstall.errorContext')}
                      showDownload={status === "complete" || status === "error"}
                      onDownload={() => {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                        const content = `=== REKOIT Removal Log ===\nDevice: ${state.deviceModel}\nIP: ${state.ip}\nStatus: ${status}\n\n${logs.join("\n")}`;
                        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `rekoit-uninstall-${timestamp}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Complete */}
              {status === "complete" && (
                <div
                  className="p-8 bg-[#e6f4ea] border border-[#1e8e3e] animate-scale-in"
                >
                  <p className="text-[20px] font-bold text-center" style={{ color: "#1e8e3e" }}>{completeMessage}</p>
                  {!isPartialRemove && detected && (
                    <div className="mt-2 text-[15px] text-center font-medium opacity-60">
                      {detected.hangul && detected.bt
                        ? t('uninstall.detectedHangulBt')
                        : detected.hangul
                        ? t('uninstall.detectedHangul')
                        : detected.bt
                        ? t('uninstall.detectedBt')
                        : t('uninstall.detectedNone')}
                    </div>
                  )}
                </div>
              )}

              {status === "complete" && errors.length > 0 && (
                <ErrorReport errors={errors} allLogs={logs} context={errorContext} />
              )}

              {/* Error */}
              {status === "error" && (
                <div className="space-y-4">
                  <div
                    className="p-6 bg-[#fce8e6] border border-[#d93025] animate-fade-in"
                  >
                    <p className="text-[17px] font-bold" style={{ color: "#d93025" }}>{t('common.error')}</p>
                  </div>
                  <ErrorReport errors={errors} allLogs={logs} context={errorContext} />
                  <Button variant="primary" onClick={startUninstall} className="font-bold">
                    {t('common.retry')}
                  </Button>
                </div>
              )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-8 stagger-2">
          <Button variant="ghost" onClick={() => router.push(returnPath)} disabled={status === "uninstalling"} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>}>
            {t('uninstall.backToSelect')}
          </Button>
          {status === "ready" ? (
            <Button onClick={startUninstall} size="lg" className="px-16 font-bold">
              {startLabel}
            </Button>
          ) : status === "complete" ? (
            <Button onClick={() => router.push(returnPath)} size="lg" className="px-16 font-bold" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>}>
              {t('uninstall.backToSelect')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
