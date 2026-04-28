"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import ProgressBar from "@/components/ProgressBar";
import TerminalOutput from "@/components/TerminalOutput";
import ErrorReport from "@/components/ErrorReport";
import Checkbox from "@/components/Checkbox";
import { useSetup } from "@/lib/store";
import { useGuard } from "@/lib/useGuard";
import { ensureSshSession } from "@/lib/client/sshSession";

type InstallStatus = "ready" | "installing" | "complete" | "error";

export default function InstallPage() {
  const allowed = useGuard();
  const router = useRouter();
  const { t } = useTranslation();
  const { state } = useSetup();
  const [status, setStatus] = useState<InstallStatus>("ready");
  const [logs, setLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(false);
  const [lockPasswordDisabled, setLockPasswordDisabled] = useState(false);
  const [koremarkUninstalled, setKoremarkUninstalled] = useState(false);
  const [btSelected, setBtSelected] = useState(state.installBtKeyboard || state.installHangul);
  const [swapCaps, setSwapCaps] = useState(state.swapLeftCtrlCapsLock);
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusRef = useRef<InstallStatus>("ready");

  const effectiveBtSelected = btSelected;
  const shouldConfigureBluetoothAfterInstall = effectiveBtSelected;
  const logFilePrefix = "rekoit-install";
  const errorContext = t('install.title');

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  if (!allowed) return null;

  const startInstall = async () => {
    statusRef.current = "installing";
    setStatus("installing");
    setLogs([]);
    setErrors([]);
    setProgress(0);

    // === Step 0: Pre-connection check (password verification) ===
    try {
      setLogs([t('install.verifyingSsh')]);
      const checkRes = await fetch("/api/ssh/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: state.ip, password: state.password }),
      });
      const checkData = await checkRes.json();
      if (!checkRes.ok || !checkData.reachable) {
        throw new Error(checkData.error || t('welcome.connectionFailed'));
      }
      setLogs((prev) => [...prev, t('install.sshSuccess')]);

      // === Step 0.5: Set SSH session cookie ===
      await ensureSshSession(state.ip, state.password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('welcome.connectionFailed');
      setLogs((prev) => [...prev, `ERROR: ${msg}`]);
      setErrors([msg]);
      setStatus("error");
      statusRef.current = "error";
      return;
    }

    const params = new URLSearchParams({
      hangul: String(state.installHangul),
      bt: String(effectiveBtSelected),
      swapLeftCtrlCapsLock: String(swapCaps),
    });

    const es = new EventSource(`/api/install/stream?${params}`);
    eventSourceRef.current = es;

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
      setStatus("complete");
      setProgress(100);
      es.close();
    });

    es.onerror = (e) => {
      if (statusRef.current === "complete" || statusRef.current === "error") return;

      try {
        const messageEvent = e as MessageEvent;
        if (messageEvent.data) {
          const data = JSON.parse(messageEvent.data);
          const errLine = `ERROR: ${data.message}`;
          setLogs((prev) => [...prev, errLine]);
          setErrors((prev) => [...prev, errLine]);
        } else {
          throw new Error("No data");
        }
      } catch {
        if (statusRef.current === "installing") {
          setLogs((prev) => [...prev, t('install.connectionLost')]);
          setErrors((prev) => [...prev, t('install.connectionLost')]);
        }
      }
      setStatus("error");
      statusRef.current = "error";
      es.close();
    };
  };

  const handleNext = () => {
    router.push(shouldConfigureBluetoothAfterInstall ? "/bluetooth" : "/complete");
  };

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={4} />

      <div className="space-y-5">
        <div>
          <h1
            className="text-[36px] font-bold leading-tight"
            style={{ color: "#000000" }}
          >
            {t('install.prepareTitle')}
          </h1>
        </div>
        <div className="mt-3 flex items-center gap-2">
            <span className="text-[18px]">💡</span>
            <p className="text-[15px] font-medium" style={{ color: "#666666" }}>
              {t('install.languageToggleHelp')}
            </p>
          </div>

        <div className="stagger-1">
          <div className="operator-card operator-card-strong" style={{ padding: "16px 20px", border: "1.5px solid #000000" }}>
            <div className="space-y-6">
              {/* Device info */}
              <div className="flex items-center justify-between pb-4 border-b border-black/10">
                <span className="text-[13px] font-bold uppercase tracking-wider">{t('install.connectedDevice')}</span>
                <div className="text-right">
                  <span className="text-[15px] font-bold">{state.deviceModel || "reMarkable Device"}</span>
                  <span className="ml-2 text-[13px] font-mono text-muted">({state.ip})</span>
                </div>
              </div>

              {status === "ready" ? (
                <div className="space-y-6">
                  {/* Features to apply */}
                  <div className="space-y-3">
                    <label className="block text-[13px] font-bold uppercase tracking-wider">{t('install.featuresToApply')}</label>
                    <div className="space-y-2">
                      {state.installHangul && (
                        <div className="flex items-center justify-between p-4 bg-black border border-black">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white border border-white flex items-center justify-center font-bold text-[13px] text-black">KO</div>
                            <span className="font-bold text-white">{t('install.featureHangul')}</span>
                          </div>
                          <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest">{t('install.featureReady')}</span>
                        </div>
                      )}
                      {effectiveBtSelected && (
                        <div className="flex items-center justify-between p-4 bg-black border border-black">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white border border-white flex items-center justify-center text-black">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M7 7l10 10-5 5V2l5 5L7 17" />
                              </svg>
                            </div>
                            <span className="font-bold text-white">{t('install.featureBt')}</span>
                          </div>
                          <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest">{t('install.featureReady')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Option settings */}
                  {state.installHangul && (
                    <div className="space-y-4 pt-2">
                      <label className="block text-[13px] font-bold uppercase tracking-wider">{t('install.optionSettings')}</label>
                      <div className="space-y-3">
                        <Checkbox
                          checked={btSelected}
                          onChange={setBtSelected}
                          label={t('install.includeBt')}
                          description={t('install.includeBtDesc')}
                        />
                        <Checkbox
                          checked={swapCaps}
                          onChange={setSwapCaps}
                          label={t('install.swapCaps')}
                          description={t('install.swapCapsDesc')}
                        />
                      </div>
                    </div>
                  )}

                  {/* Final confirmation items */}
                  <div className="space-y-4 pt-2">
                    <label className="block text-[13px] font-bold uppercase tracking-wider">{t('install.finalConfirmation')}</label>
                    <div className="space-y-3">
                      <Checkbox
                        checked={developerModeEnabled}
                        onChange={setDeveloperModeEnabled}
                        label={t('install.devMode')}
                        description={t('install.devModeDesc')}
                      />
                      <Checkbox
                        checked={lockPasswordDisabled}
                        onChange={setLockPasswordDisabled}
                        label={t('install.passcode')}
                        description={t('install.passcodeDesc')}
                      />
                      <Checkbox
                        checked={koremarkUninstalled}
                        onChange={setKoremarkUninstalled}
                        label={t('install.priorMods')}
                        description={t('install.priorModsDesc')}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={startInstall}
                    disabled={!developerModeEnabled || !lockPasswordDisabled || !koremarkUninstalled}
                    size="lg"
                    className="w-full font-bold"
                  >
                    {t('install.startButton')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Installation in progress / complete */}
                  <div className="text-center space-y-2 py-2">
                    <div className="flex items-center justify-center gap-1.5 text-[22px] font-bold">
                      <span>{currentStep || (status === "complete" ? t('install.statusComplete') : t('install.preparing'))}</span>
                      {status === "installing" && (
                        <span className="flex gap-1 ml-1">
                          <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] font-medium text-muted">
                      {status === "installing" ? t('install.installingDesc') : 
                       status === "complete" ? t('install.completeDesc') : t('install.errorDesc')}
                    </p>
                  </div>

                  <ProgressBar
                    progress={progress}
                    status={status === "error" ? "error" : status === "complete" ? "complete" : "active"}
                  />

                  <div className="pt-2">
                    <TerminalOutput
                      lines={logs}
                      maxHeight="200px"
                      title={t('install.logTitle')}
                      showDownload={status === "complete" || status === "error"}
                      onDownload={() => {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                        const content = `=== REKOIT Installation Log ===\nDevice: ${state.deviceModel}\nIP: ${state.ip}\nStatus: ${status}\n\n${logs.join("\n")}`;
                        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${logFilePrefix}-${timestamp}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    />
                  </div>

                  {status === "error" && (
                    <div className="space-y-4">
                      <ErrorReport errors={errors} allLogs={logs} context={errorContext} />
                      <Button variant="secondary" onClick={startInstall} className="w-full">
                        {t('common.retry')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="flex justify-between pt-6 stagger-2">
          <Button
            variant="ghost"
            onClick={() => router.push("/entry")}
            disabled={status === "installing"}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>}
          >
            {t('common.back')}
          </Button>

          <Button
            onClick={handleNext}
            disabled={status !== "complete"}
            size="lg"
            className="font-bold"
          >
            {shouldConfigureBluetoothAfterInstall ? t('install.toBluetooth') : t('install.toComplete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
