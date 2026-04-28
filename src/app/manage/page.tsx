"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import BluetoothPowerControl from "@/components/BluetoothPowerControl";
import DiagnosisPanel from "@/components/DiagnosisPanel";
import KeyboardSwapControl from "@/components/KeyboardSwapControl";
import SectionDivider from "@/components/SectionDivider";
import { useSetup } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";

export default function ManagePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, setState } = useSetup();
  const returnPath = state.ip && state.password ? "/entry" : "/";

  const [mounted, setMounted] = useState(false);
  const [installedState, setInstalledState] = useState({
    hangul: state.installHangul,
    bt: state.installBtKeyboard,
    font: false,
  });
  const [fontActionLoading, setFontActionLoading] = useState(false);
  const [fontResult, setFontResult] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const [btDevices, setBtDevices] = useState<Array<{ address: string; connected: boolean; name: string }>>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btRemoving, setBtRemoving] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!state.ip || !state.password)) {
      router.replace("/");
    }
  }, [mounted, state.ip, state.password, router]);

  const loadBtDevices = async () => {
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
  };

  useEffect(() => {
    if (!mounted || !state.ip || !state.password) return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/manage/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password }),
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const nextInstalledState = {
          hangul: data.hangulInstalled === true,
          bt: data.btInstalled === true,
          font: data.fontInstalled === true,
        };
        setInstalledState(nextInstalledState);
        setState({
          installHangul: nextInstalledState.hangul,
          installBtKeyboard: nextInstalledState.bt,
        });

        if (nextInstalledState.bt) {
          loadBtDevices();
        }
      } catch {
        // fall back to in-memory state
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [mounted, state.ip, state.password]);

  const handleRemoveDevice = async (address: string, name: string) => {
    if (!confirm(t('complete.removeConfirm', { name }))) return;
    
    setBtRemoving(address);
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
        alert(t('complete.removeFailed', { error: data.error || "Unknown error" }));
      }
    } catch {
      alert(t('complete.serverError'));
    } finally {
      setBtRemoving(null);
    }
  };

  const handleRemoveFont = async () => {
    if (!confirm(t('manage.fontRemoveConfirm'))) return;
    
    setFontActionLoading(true);
    setFontResult(null);
    try {
      const res = await fetch("/api/manage/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: state.ip, password: state.password, target: "font" }),
      });
      const data = await res.json();
      if (data.success) {
        setFontResult(t('manage.fontSuccessRemoved'));
        setInstalledState(prev => ({ ...prev, font: false }));
      } else {
        setFontResult(`${t('common.error')}: ${data.error}`);
      }
    } catch {
      setFontResult(t('common.error'));
    } finally {
      setFontActionLoading(false);
    }
  };

  if (!mounted || !state.ip || !state.password) {
    return null;
  }

  return (
    <div className="animate-fade-in-up">
      <div className="space-y-6">
        <div>
          <h1
            className="text-[32px] font-bold tracking-tight"
            style={{ color: "#000000" }}
          >
            {t('manage.title')}
          </h1>
          <p className="text-[15px] mt-2 font-medium" style={{ color: "#666666" }}>
            {t('manage.description')}
          </p>
        </div>

        <div className="stagger-1">
          <div className="space-y-10">
            {/* Recovery & Removal Section */}
              <div className="space-y-4">
                <SectionDivider label={t('manage.uninstallSection')} />
                <div className="space-y-4">
                  {(installedState.hangul || installedState.bt) && (
                    <div
                      className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                    >
                      <div>
                        <p className="text-[16px] font-bold text-black">{t('manage.uninstallAll')}</p>
                        <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('manage.uninstallAllDesc')}</p>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => router.push("/uninstall")} className="font-bold">
                        {t('common.start')}
                      </Button>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    {installedState.hangul && (
                      <div
                        className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                      >
                        <div>
                          <p className="text-[16px] font-bold text-black">{t('uninstall.titleHangul')}</p>
                          <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('uninstall.descHangul')}</p>
                        </div>
                        <Button variant="primary" size="sm" onClick={() => router.push("/uninstall?target=hangul")} className="font-bold">
                          {t('common.start')}
                        </Button>
                      </div>
                    )}

                    {installedState.bt && (
                      <div
                        className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                      >
                        <div>
                          <p className="text-[16px] font-bold text-black">{t('uninstall.titleBt')}</p>
                          <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('uninstall.descBt')}</p>
                        </div>
                        <Button variant="primary" size="sm" onClick={() => router.push("/uninstall?target=bt")} className="font-bold">
                          {t('common.start')}
                        </Button>
                      </div>
                    )}

                    {installedState.font && (
                      <div
                        className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                      >
                        <div>
                          <p className="text-[16px] font-bold text-black">{t('manage.fontRemove')}</p>
                          <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('manage.fontRemoveDesc')}</p>
                        </div>
                        <Button 
                          variant="primary" 
                          size="sm" 
                          onClick={handleRemoveFont} 
                          loading={fontActionLoading} 
                          className="font-bold"
                        >
                          {t('common.start')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Keyboard settings */}
              {installedState.hangul && (
                <div className="space-y-4">
                  <SectionDivider label={t('manage.keyboardTitle')} />
                  <KeyboardSwapControl ip={state.ip} password={state.password} />
                </div>
              )}

              {/* Font settings */}
              <div className="space-y-4">
                <SectionDivider label={t('manage.fontTitle')} />
                <div className="grid gap-4">
                  <div
                    className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                  >
                    <div>
                      <p className="text-[16px] font-bold text-black">{t('manage.fontUpload')}</p>
                      <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('manage.fontUploadDesc')}</p>
                    </div>
                    <input
                      ref={fontInputRef}
                      type="file"
                      accept=".otf,.ttf"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setFontActionLoading(true);
                        setFontResult(null);
                        const formData = new FormData();
                        formData.append("font", file);
                        formData.append("ip", state.ip);
                        formData.append("password", state.password);
                        try {
                          const res = await fetch("/api/font/upload", { method: "POST", body: formData });
                          const data = await res.json();
                          if (data.success) {
                            setFontResult(t('manage.fontSuccess'));
                            setInstalledState(prev => ({ ...prev, font: true }));
                          } else {
                            setFontResult(`${t('common.error')}: ${data.error}`);
                          }
                        } catch {
                          setFontResult(t('common.error'));
                        } finally {
                          setFontActionLoading(false);
                          if (fontInputRef.current) fontInputRef.current.value = "";
                        }
                      }}
                    />
                    <Button variant="primary" size="sm" onClick={() => fontInputRef.current?.click()} loading={fontActionLoading} className="font-bold">
                      {t('manage.fontSelect')}
                    </Button>
                  </div>
                </div>
                {fontResult && (
                  <p className="text-[13px] font-bold px-1 animate-fade-in" style={{ color: fontResult.includes("Failed") || fontResult.includes(t('common.error')) || fontResult.includes("실패") ? "#d93025" : "#1e8e3e" }}>
                    {fontResult}
                  </p>
                )}
              </div>

              {/* Bluetooth settings */}
              {installedState.bt && (
                <div className="space-y-4">
                  <SectionDivider label={t('manage.bluetoothControl')} />
                  
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
                              onClick={() => handleRemoveDevice(device.address, device.name)}
                              loading={btRemoving === device.address}
                              className="font-bold border-none bg-black/5 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              {t('common.delete')}
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

                  <div
                    className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                  >
                    <div>
                      <p className="text-[16px] font-bold text-black">{t('manage.connectNew')}</p>
                      <p className="text-[13px] font-medium opacity-50 mt-0.5">{t('manage.connectNewDesc')}</p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => router.push("/bluetooth?mode=manage")} className="font-bold">
                      {t('manage.openSetup')}
                    </Button>
                  </div>
                  <BluetoothPowerControl ip={state.ip} password={state.password} />
                </div>
              )}

              {/* Diagnosis section */}
              <DiagnosisPanel
                ip={state.ip}
                password={state.password}
                title={t('diagnose.logTitle')}
                subtitle={t('manage.diagSubtitle')}
              />
          </div>
        </div>

        <div className="flex justify-end pt-8 stagger-2">
          <Button onClick={() => router.push(returnPath)} size="lg" className="px-16 font-bold" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>}>
            {t('manage.backToStart')}
          </Button>
        </div>
      </div>
    </div>
  );
}
