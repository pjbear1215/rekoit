"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import BluetoothPowerControl from "@/components/BluetoothPowerControl";
import DiagnosisPanel from "@/components/DiagnosisPanel";
import KeyboardSwapControl from "@/components/KeyboardSwapControl";
import SectionDivider from "@/components/SectionDivider";
import StatusCheck from "@/components/StatusCheck";
import { useSetup } from "@/lib/store";
import { useGuard } from "@/lib/useGuard";

interface VerifyResult {
  name: string;
  pass: boolean;
  detail: string;
}

function getInstallSummary(installHangul: boolean, installBtKeyboard: boolean, t: any): string {
  if (installHangul && installBtKeyboard) {
    return t('complete.summaryBoth');
  }
  if (installHangul) {
    return t('complete.summaryHangulOnly');
  }
  return t('complete.summaryBtOnly');
}

export default function CompletePage() {
  const allowed = useGuard();
  const router = useRouter();
  const { t } = useTranslation();
  const { state, setState } = useSetup();
  const [results, setResults] = useState<VerifyResult[]>([]);
  const [verifying, setVerifying] = useState(true);
  const [installedState, setInstalledState] = useState({
    hangul: state.installHangul,
    bt: state.installBtKeyboard,
  });
  
  const [btDevices, setBtDevices] = useState<Array<{ address: string; connected: boolean; name: string }>>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btRemovingAddr, setBtRemovingAddr] = useState<string | null>(null);
  
  const [fontUploading, setFontUploading] = useState(false);
  const [fontResult, setFontResult] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const placeholderChecks = [
    ...(installedState.hangul ? [t('complete.checkFont'), t('complete.checkDaemon')] : []),
    ...(installedState.bt ? [t('complete.checkBt')] : []),
  ];

  const loadBtDevices = useCallback(async () => {
    if (!state.ip || !state.password) return;
    setBtLoading(true);
    try {
      const res = await fetch("/api/bluetooth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: state.ip, password: state.password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBtDevices(data.devices || []);
      }
    } catch {
      // ignore
    } finally {
      setBtLoading(false);
    }
  }, [state.ip, state.password]);

  useEffect(() => {
    if (!allowed) return;
    const verify = async () => {
      try {
        // 1. Re-verify device availability (sync status)
        const availabilityRes = await fetch("/api/manage/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password }),
        });
        
        let isBtInstalled = state.installBtKeyboard;
        if (availabilityRes.ok) {
          const availData = await availabilityRes.json();
          setInstalledState({
            hangul: availData.hangulInstalled,
            bt: availData.btInstalled,
          });
          isBtInstalled = availData.btInstalled;
        }

        // 2. Component verification
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: state.ip,
            password: state.password,
            hangul: state.installHangul,
            bt: state.installBtKeyboard,
          }),
        });
        const data = await res.json();
        
        // Translate verification names if needed
        const translatedResults = data.results.map((r: any) => {
          let name = r.name;
          if (name === "Korean Font") name = t('complete.checkFont');
          if (name === "Input Daemon") name = t('complete.checkDaemon');
          if (name === "Bluetooth") name = t('complete.checkBt');
          return { ...r, name };
        });
        setResults(translatedResults);

        // 3. Load Bluetooth device list
        if (isBtInstalled) {
          void loadBtDevices();
        }
      } catch {
        setResults([{
          name: t('complete.verifyFailed'),
          pass: false,
          detail: t('complete.verifyFailedDetail'),
        }]);
      } finally {
        setVerifying(false);
      }
    };
    verify();
  }, [allowed, state.installBtKeyboard, state.installHangul, state.ip, state.password, loadBtDevices, t]);

  const handleBtRemove = useCallback(
    async (address: string, name: string) => {
      if (!confirm(t('complete.removeConfirm', { name }))) return;
      setBtRemovingAddr(address);
      try {
        const res = await fetch("/api/bluetooth/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password, address }),
        });
        const data = await res.json();
        if (data.success) {
          setBtDevices(prev => prev.filter(d => d.address !== address));
        } else {
          alert(t('complete.removeFailed', { error: data.error ?? "Unknown error" }));
        }
      } catch {
        alert(t('complete.serverError'));
      } finally {
        setBtRemovingAddr(null);
      }
    },
    [state.ip, state.password, t],
  );

  const handleFontUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFontUploading(true);
      setFontResult(null);

      const formData = new FormData();
      formData.append("font", file);
      formData.append("ip", state.ip);
      formData.append("password", state.password);

      try {
        const res = await fetch("/api/font/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          setFontResult(data.message);
        } else {
          setFontResult(t('complete.fontUploadFailed', { error: data.error }));
        }
      } catch {
        setFontResult(t('complete.serverError'));
      } finally {
        setFontUploading(false);
        if (fontInputRef.current) fontInputRef.current.value = "";
      }
    },
    [state.ip, state.password, t],
  );

  const allPassed = results.length > 0 && results.every((r) => r.pass);
  const hasFail = results.length > 0 && results.some((r) => !r.pass);
  const failedCheckNames = results.filter((r) => !r.pass).map((r) => r.name);
  const hasHangulFail = failedCheckNames.some((name) => name === t('complete.checkFont') || name === t('complete.checkDaemon'));
  const hasBtFail = failedCheckNames.includes(t('complete.checkBt'));
  const returnPath = state.ip && state.password ? "/entry" : "/";

  if (!allowed) return null;

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={6} />

      <div className="space-y-6">
        <div>
          <h1
            className="text-[36px] font-bold leading-tight"
            style={{ color: "#000000" }}
          >
            {verifying ? t('complete.verifying') : allPassed ? t('complete.title') : t('complete.resultTitle')}
          </h1>
          <p
            className="mt-3 text-[17px] font-medium"
            style={{ color: "#666666" }}
          >
            {getInstallSummary(installedState.hangul, installedState.bt, t)}
          </p>
        </div>

        <div className="stagger-1">
          <div className="operator-card operator-card-strong" style={{ padding: "20px 24px", border: "1.5px solid #000000" }}>
            <div className="space-y-8">
              {/* Verification status */}
              <div
                className="border border-black/10 overflow-hidden bg-black/[0.02]"
              >
                {verifying ? (
                  placeholderChecks.map((name) => (
                    <StatusCheck key={name} label={name} status="checking" />
                  ))
                ) : (
                  results.map((result) => (
                    <StatusCheck
                      key={result.name}
                      label={result.name}
                      status={result.pass ? "pass" : "fail"}
                      detail={result.detail}
                    />
                  ))
                )}
              </div>

              {/* Result message */}
              {!verifying && allPassed && (
                <div
                  className="text-center py-8 bg-[#e6f4ea] border border-[#1e8e3e] animate-scale-in"
                >
                  <p className="text-[20px] font-bold" style={{ color: "#1e8e3e" }}>
                    {t('complete.title')}
                  </p>
                  <div className="text-[15px] mt-2 font-medium space-y-1" style={{ color: "rgba(0,0,0,0.6)" }}>
                    {installedState.hangul && (
                      <>
                        <p>{t('complete.languageToggleGuide')}</p>
                        <div className="mt-4 p-4 bg-white/50 border border-black/5 text-left space-y-2">
                          <p className="text-[13px] font-bold text-black uppercase tracking-wider mb-2">{t('complete.specialCharGuideTitle')}</p>
                          <p className="text-[14px] leading-relaxed">
                            <span className="shrink-0 mr-1.5">•</span>
                            {t('complete.specialCharGuide1')}
                          </p>
                          <p className="text-[14px] leading-relaxed">
                            <span className="shrink-0 mr-1.5">•</span>
                            {t('complete.specialCharGuide2')}
                          </p>
                          <p className="text-[14px] leading-relaxed">
                            <span className="shrink-0 mr-1.5">•</span>
                            {t('complete.specialCharGuide3')}
                          </p>
                        </div>
                      </>
                    )}
                    {installedState.bt && (
                      <p className="pt-2">{t('complete.btAutoReconnectGuide')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Guidance on failure */}
              {!verifying && hasFail && (
                <div
                  className="p-6 bg-[#fce8e6] border border-[#d93025] animate-fade-in"
                >
                  <p className="font-bold text-[17px]" style={{ color: "#d93025" }}>
                    {t('complete.problemsDetected')}
                  </p>
                  <ul className="mt-3 space-y-2 text-[14px] font-medium" style={{ color: "rgba(0,0,0,0.7)" }}>
                    {hasHangulFail && (
                      <li>{t('complete.hangulIssueGuide')}</li>
                    )}
                    {hasHangulFail && (
                      <li>{t('complete.daemonIssueGuide')}</li>
                    )}
                    {hasBtFail && (
                      <li>{t('complete.btIssueGuide')}</li>
                    )}
                    <li>{t('complete.startOverGuide')}</li>
                  </ul>
                </div>
              )}

              {/* Quick management tools */}
              {!verifying && (
                <div className="space-y-8 border-t border-black/10 pt-8">
                  {installedState.hangul && (
                    <div className="space-y-4">
                      <SectionDivider label={t('manage.keyboardTitle')} />
                      <KeyboardSwapControl ip={state.ip} password={state.password} />
                    </div>
                  )}

                  {installedState.bt && (
                    <div className="space-y-6">
                      <SectionDivider label={t('complete.checkBt')} />
                      
                      {/* Registered device list */}
                      <div className="space-y-3">
                        <label className="block text-[13px] font-bold uppercase tracking-wider px-1">{t('manage.registeredDevices')}</label>
                        <div className="space-y-2">
                          {btLoading && btDevices.length === 0 ? (
                            <div className="p-4 bg-black/[0.03] border border-black/5 text-center text-[13px] text-muted animate-pulse">
                              {t('manage.loadingDevices')}
                            </div>
                          ) : btDevices.length > 0 ? (
                            btDevices.map((device) => (
                              <div
                                key={device.address}
                                className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2.5 h-2.5 rounded-full ${device.connected ? "bg-green-500" : "bg-black/20"}`} />
                                  <div>
                                    <p className="text-[15px] font-bold text-black">{device.name || t('manage.unnamedDevice')}</p>
                                    <p className="text-[12px] font-mono opacity-50">{device.address}</p>
                                  </div>
                                </div>
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => handleBtRemove(device.address, device.name)}
                                  loading={btRemovingAddr === device.address}
                                  className="font-bold border-none bg-black/5 hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                  {t('common.delete') || "Delete"}
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="p-8 bg-black/[0.03] border border-black/5 text-center">
                              <p className="text-[14px] text-muted font-medium">{t('manage.noDevices')}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5">
                        <div className="min-w-0">
                          <p className="text-[16px] font-bold text-black">{t('manage.connectNew')}</p>
                          <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('complete.connectNewHelp')}</p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => router.push("/bluetooth?mode=manage")}
                          className="font-bold"
                        >
                          {t('manage.openSetup')}
                        </Button>
                      </div>
                      <BluetoothPowerControl ip={state.ip} password={state.password} />
                    </div>
                  )}

                  {installedState.hangul && (
                    <div className="space-y-4">
                      <SectionDivider label={t('manage.fontTitle')} />
                      <div className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5">
                        <span className="text-[15px] font-bold">{t('manage.fontUpload')}</span>
                        <input ref={fontInputRef} type="file" accept=".otf,.ttf" onChange={handleFontUpload} className="hidden" />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => fontInputRef.current?.click()}
                          loading={fontUploading}
                          className="font-bold"
                        >
                          {t('manage.fontSelect')}
                        </Button>
                      </div>
                      {fontResult && (
                        <p className="text-[13px] font-bold px-1" style={{ color: fontResult.includes("Failed") || fontResult.includes("실패") ? "#d93025" : "#1e8e3e" }}>
                          {fontResult}
                        </p>
                      )}
                    </div>
                  )}

                  <DiagnosisPanel
                    ip={state.ip}
                    password={state.password}
                    title={t('diagnose.logTitle')}
                    subtitle={t('complete.diagSubtitle')}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 stagger-2">
          <Button variant="ghost" onClick={() => router.push(returnPath)} disabled={verifying} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>}>
            {t('complete.startOver')}
          </Button>
          <Button onClick={() => router.push("/manage")} disabled={verifying} size="lg" className="px-12 font-bold">
            {t('entry.goManage')}
          </Button>
        </div>
      </div>
    </div>
  );
}
