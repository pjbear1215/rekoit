"use client";

import { useEffect, useState, useCallback } from "react";

import Button from "@/components/Button";
import TerminalOutput from "@/components/TerminalOutput";
import { useSetup } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";

interface KeyboardSwapControlProps {
  ip: string;
  password: string;
}

export default function KeyboardSwapControl({
  ip,
  password,
}: KeyboardSwapControlProps) {
  const { t } = useTranslation();
  const { state, setState: setSetupState } = useSetup();
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState<"on" | "off" | null>(null);
  const [swapLeftCtrlCapsLock, setSwapLeftCtrlCapsLock] = useState(state.swapLeftCtrlCapsLock);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  useEffect(() => {
    setSwapLeftCtrlCapsLock(state.swapLeftCtrlCapsLock);
  }, [state.swapLeftCtrlCapsLock]);

  const loadKeyboardSettings = useCallback(async (options?: { silent?: boolean }) => {
    if (!ip || !password) return;

    setLoading(true);
    const silent = options?.silent ?? false;
    if (!silent) addLog(t('manage.keyboard.reading'));

    try {
      const res = await fetch("/api/manage/keyboard-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip,
          password,
          action: "get",
        }),
      });
      const data = await res.json();
      if (data.success) {
        const nextValue = Boolean(data.swapLeftCtrlCapsLock);
        setSwapLeftCtrlCapsLock(nextValue);
        setSetupState({ swapLeftCtrlCapsLock: nextValue });
        if (!silent) addLog(t('manage.keyboard.verified', { status: nextValue ? t('bluetooth.power.on') : t('bluetooth.power.off') }));
      } else {
        if (!silent) addLog(`${t('common.error')}: ${data.error ?? t('common.error')}`);
      }
    } catch (e) {
      if (!silent) addLog(`${t('common.error')}: ${e instanceof Error ? e.message : t('common.error')}`);
    } finally {
      setLoading(false);
    }
  }, [ip, password, setSetupState, addLog, t]);

  useEffect(() => {
    void loadKeyboardSettings();
  }, [loadKeyboardSettings]);

  const applySwapSetting = async (nextValue: boolean) => {
    setSavingAction(nextValue ? "on" : "off");
    addLog(t('manage.keyboard.changing', { status: nextValue ? t('bluetooth.power.on') : t('bluetooth.power.off') }));
    try {
      const res = await fetch("/api/manage/keyboard-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip,
          password,
          action: "set",
          swapLeftCtrlCapsLock: nextValue,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSwapLeftCtrlCapsLock(nextValue);
        setSetupState({ swapLeftCtrlCapsLock: nextValue });
        const statusStr = nextValue ? t('manage.keyboard.enabled') : t('manage.keyboard.disabled');
        const msg = data.restarted
          ? `OK: ${statusStr} (${t('manage.keyboard.restarted')})`
          : `OK: ${statusStr} (${t('manage.keyboard.nextStart')})`;
        addLog(msg);
      } else {
        addLog(`FAIL: ${data.error ?? t('common.error')}`);
      }
    } catch (e) {
      addLog(`${t('common.error')}: ${e instanceof Error ? e.message : t('common.error')}`);
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
      >
        <div>
          <p className="text-[16px] font-bold text-black">
            {t('manage.keyboardTitle')}
          </p>
          <p className="text-[13px] font-medium opacity-50 mt-0.5">
            {t('manage.keyboardDesc')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant={swapLeftCtrlCapsLock ? "primary" : "ghost"}
            size="sm"
            onClick={() => applySwapSetting(true)}
            loading={savingAction === "on"}
            disabled={loading || savingAction !== null}
            aria-pressed={swapLeftCtrlCapsLock}
            className="font-bold"
          >
            {t('bluetooth.power.on')}
          </Button>
          <Button
            variant={swapLeftCtrlCapsLock ? "ghost" : "primary"}
            size="sm"
            onClick={() => applySwapSetting(false)}
            loading={savingAction === "off"}
            disabled={loading || savingAction !== null}
            aria-pressed={!swapLeftCtrlCapsLock}
            className="font-bold"
          >
            {t('bluetooth.power.off')}
          </Button>
        </div>
      </div>

      <TerminalOutput
        lines={logs}
        title={t('manage.keyboardLog')}
        initiallyOpen={false}
        maxHeight="180px"
        showDownload={logs.length > 0}
        onDownload={() => {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const content = `=== REKOIT Keyboard Settings Log ===\n${logs.join("\n")}`;
          const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `rekoit-keyboard-log-${timestamp}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
