"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import ProgressBar from "@/components/ProgressBar";
import StatusCheck from "@/components/StatusCheck";
import { useSetup } from "@/lib/store";
import { useGuard } from "@/lib/useGuard";
import { useTranslation } from "@/lib/i18n";

interface Tool {
  name: string;
  command: string;
  installed: boolean;
}

type InstallStatus = "idle" | "installing" | "complete" | "error";

interface ToolInstallState {
  label: string;
  status: "pending" | "installing" | "installed" | "failed";
  detail?: string;
}

interface PrerequisitesResponse {
  tools: Tool[];
  allReady: boolean;
  platform: {
    id: string;
    label: string;
  };
  packageManager: {
    label: string;
    installed: boolean;
    canAutoInstall: boolean;
    hint?: string;
    actionLabel?: string | null;
    bootstrapHint?: string;
  };
  manualInstallCommand: string;
}

export default function PrerequisitesPage() {
  const { t } = useTranslation();
  const allowed = useGuard();
  const router = useRouter();
  const { state } = useSetup();
  const [tools, setTools] = useState<Tool[]>([]);
  const [allReady, setAllReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [platformLabel, setPlatformLabel] = useState("");
  const [packageManagerLabel, setPackageManagerLabel] = useState(t('prerequisites.packageManagerLabel') || "Package Manager");
  const [packageManagerInstalled, setPackageManagerInstalled] = useState(false);
  const [packageManagerHint, setPackageManagerHint] = useState("");
  const [packageManagerActionLabel, setPackageManagerActionLabel] = useState<string | null>(null);
  const [packageManagerBootstrapHint, setPackageManagerBootstrapHint] = useState("");
  const [autoInstallSupported, setAutoInstallSupported] = useState(false);
  const [manualInstallCommand, setManualInstallCommand] = useState("");
  const [bootstrapActionLoading, setBootstrapActionLoading] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");
  const [toolStates, setToolStates] = useState<Record<string, ToolInstallState>>({});
  const [installProgress, setInstallProgress] = useState(0);
  const [installErrorDetail, setInstallErrorDetail] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const eventSourceRef = useRef<EventSource | null>(null);
  const autoNavigatedRef = useRef(false);

  const applySnapshot = (data: PrerequisitesResponse): void => {
    setTools(data.tools);
    setAllReady(data.allReady);
    setPlatformLabel(data.platform.label);
    setPackageManagerLabel(data.packageManager.label);
    setPackageManagerInstalled(data.packageManager.installed);
    setPackageManagerHint(data.packageManager.hint ?? "");
    setPackageManagerActionLabel(data.packageManager.actionLabel ?? null);
    setPackageManagerBootstrapHint(data.packageManager.bootstrapHint ?? "");
    setAutoInstallSupported(data.packageManager.canAutoInstall);
    setManualInstallCommand(data.manualInstallCommand);
  };

  useEffect(() => {
    if (!allowed) return;

    let cancelled = false;

    const loadTools = async (): Promise<void> => {
      try {
        const res = await fetch("/api/prerequisites");
        const data = (await res.json()) as PrerequisitesResponse;
        if (cancelled) return;
        applySnapshot(data);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void loadTools();

    return () => {
      cancelled = true;
    };
  }, [allowed]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!allowed || checking || !allReady || autoNavigatedRef.current) {
      return;
    }
    autoNavigatedRef.current = true;
    router.push("/connection");
  }, [allowed, checking, allReady, router]);

  if (!allowed) return null;

  const refreshTools = async (): Promise<PrerequisitesResponse | null> => {
    setChecking(true);
    try {
      const res = await fetch("/api/prerequisites");
      const data = (await res.json()) as PrerequisitesResponse;
      applySnapshot(data);
      return data;
    } catch {
      return null;
    } finally {
      setChecking(false);
    }
  };

  const openPackageManagerInstall = async () => {
    setBootstrapActionLoading(true);
    try {
      await fetch("/api/prerequisites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open-brew-install" }),
      });
    } catch {
      // ignore
    } finally {
      setBootstrapActionLoading(false);
    }
  };

  const copyManualCommand = async (): Promise<void> => {
    if (!manualInstallCommand) return;
    try {
      await navigator.clipboard.writeText(manualInstallCommand);
      setCopyState("done");
    } catch {
      setCopyState("failed");
    }
  };

  const startInstall = () => {
    setInstallStatus("installing");
    setInstallProgress(0);
    setInstallErrorDetail(null);

    const missing = tools.filter((t) => !t.installed);
    const initial: Record<string, ToolInstallState> = {};
    for (const t of missing) {
      initial[t.command] = { label: t.name, status: "pending" };
    }
    setToolStates(initial);

    const es = new EventSource("/api/prerequisites/install");
    eventSourceRef.current = es;

    es.addEventListener("tool", (e) => {
      const data = JSON.parse(e.data);
      setToolStates((prev) => ({
        ...prev,
        [data.tool]: {
          label: data.label,
          status: data.status,
          detail: data.detail,
        },
      }));
      setInstallProgress(data.progress);

      if (data.status === "installed") {
        setTools((prev) =>
          prev.map((t) =>
            t.command === data.tool ? { ...t, installed: true } : t,
          ),
        );
      }
    });

    es.addEventListener("complete", () => {
      setInstallProgress(100);
      es.close();
      void refreshTools().then((snapshot) => {
        setInstallStatus(snapshot?.allReady ? "complete" : "error");
      });
    });

    es.addEventListener("error", (e) => {
      setInstallStatus("error");
      if (e instanceof MessageEvent) {
        try {
          const data = JSON.parse(e.data) as { message?: string };
          setInstallErrorDetail(data.message ?? null);
        } catch {
          // ignore
        }
      }
      es.close();
    });

    es.onerror = () => {
      setInstallStatus("error");
      es.close();
    };
  };

  const hasMissingTools = tools.some((t) => !t.installed);
  const shouldShowManagerWarning = !allReady && !packageManagerInstalled;
  const shouldShowManualCommand = !allReady && hasMissingTools && !autoInstallSupported && Boolean(manualInstallCommand);
  const managerStatus: "checking" | "pass" | "fail" =
    checking ? "checking" : packageManagerInstalled || allReady ? "pass" : "fail";

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={1} />

      <div className="space-y-5">
        <div>
          <h1
            className="text-[36px] font-bold leading-tight"
            style={{ color: "#000000" }}
          >
            {t('prerequisites.title')}
          </h1>
          <p
            className="mt-3 text-[16px] font-medium"
            style={{ color: "#666666" }}
          >
            {platformLabel ? t('prerequisites.descriptionWithPlatform', { platform: platformLabel }) : t('prerequisites.description')}
          </p>
        </div>

        <div className="stagger-1">
          <div className="operator-card operator-card-strong" style={{ padding: "16px 20px", border: "1.5px solid #000000" }}>
            <div className="space-y-5">
              {/* Warning (if needed) */}
              {shouldShowManagerWarning && !checking && (
                <div
                  className="rounded-none"
                  style={{
                    backgroundColor: "#fff9e6",
                    padding: "16px 20px",
                    borderLeft: "4px solid #ffcc00",
                    borderTop: "1.5px solid #000000",
                    borderRight: "1.5px solid #000000",
                    borderBottom: "1.5px solid #000000",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[18px]">⚠️</span>
                    <p className="text-[16px] font-bold" style={{ color: "#000000" }}>
                      {t('welcome.checkBeforeConnecting')}
                    </p>
                  </div>
                  <p className="text-[14px] font-medium" style={{ color: "#333333" }}>
                    {packageManagerBootstrapHint || packageManagerHint}
                  </p>
                  {packageManagerActionLabel && (
                    <Button
                      onClick={openPackageManagerInstall}
                      loading={bootstrapActionLoading}
                      size="sm"
                      className="mt-3"
                    >
                      {bootstrapActionLoading ? t('common.loading') : packageManagerActionLabel}
                    </Button>
                  )}
                </div>
              )}

              {/* Checklist area */}
              <div className="space-y-3">
                <label className="block text-[13px] font-bold uppercase tracking-wider" style={{ color: "#000000" }}>
                  {t('prerequisites.manualInstallTitle')}
                </label>
                <div
                  className="rounded-none overflow-hidden"
                  style={{ border: "1.5px solid #000000" }}
                >
                  <StatusCheck
                    label={packageManagerLabel}
                    status={managerStatus}
                    detail={packageManagerHint}
                  />
                  {tools.map((tool) => {
                    const toolInstall = toolStates[tool.command];
                    let status: "checking" | "pass" | "fail" = checking
                      ? "checking"
                      : tool.installed
                        ? "pass"
                        : "fail";
                    let detail: string | undefined;

                    if (toolInstall) {
                      if (toolInstall.status === "installing") {
                        status = "checking";
                        detail = t('prerequisites.statusChecking');
                      } else if (toolInstall.status === "installed") {
                        status = "pass";
                      } else if (toolInstall.status === "failed") {
                        status = "fail";
                        detail = toolInstall.detail;
                      }
                    }

                    return (
                      <StatusCheck
                        key={tool.name}
                        label={tool.name}
                        status={status}
                        detail={detail}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Manual installation guide (if needed) */}
              {shouldShowManualCommand && (
                <div className="space-y-3">
                  <label className="block text-[13px] font-bold uppercase tracking-wider" style={{ color: "#000000" }}>
                    {t('prerequisites.manualInstallTitle')}
                  </label>
                  <div
                    className="rounded-none"
                    style={{
                      backgroundColor: "#f6f6f6",
                      border: "1.5px solid #000000",
                      padding: "16px",
                    }}
                  >
                    <pre className="whitespace-pre-wrap break-all text-[13px] font-mono" style={{ color: "#000000" }}>
                      {manualInstallCommand}
                    </pre>
                    <div className="flex items-center gap-3 mt-3">
                      <Button variant="secondary" size="sm" onClick={copyManualCommand}>
                        {t('prerequisites.copyCommand')}
                      </Button>
                      {copyState === "done" && (
                        <span className="text-[13px] font-bold" style={{ color: "#000000" }}>✓ {t('prerequisites.copied')}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Installation progress bar */}
              {installStatus === "installing" && (
                <div className="pt-2">
                  <ProgressBar
                    progress={installProgress}
                    status="active"
                    currentStep={t('prerequisites.statusChecking')}
                  />
                </div>
              )}

              {/* Action buttons (if installation required) */}
              {!checking && autoInstallSupported && hasMissingTools && installStatus === "idle" && (
                <Button onClick={startInstall} className="w-full font-bold" size="lg">
                  {t('prerequisites.autoInstallButton')}
                </Button>
              )}

              {/* Completion status */}
              {allReady && !checking && (
                <div
                  className="text-center py-4 font-bold border-t-2 border-b-2 border-black"
                  style={{ backgroundColor: "#ffffff", color: "#000000" }}
                >
                  ✓ {t('prerequisites.statusPass')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="flex justify-between pt-6 stagger-2">
          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>}
          >
            {t('common.first')}
          </Button>
          <div className="flex gap-3">
            {!allReady && installStatus !== "installing" && (
              <Button
                variant="secondary"
                onClick={refreshTools}
                loading={checking}
              >
                {t('common.retry')}
              </Button>
            )}
            <Button
              onClick={() => router.push("/connection")}
              disabled={!allReady}
              size="lg"
              className="px-16"
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
