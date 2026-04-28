"use client";

import { useCallback, useEffect, useState } from "react";

import Button from "@/components/Button";
import TerminalOutput from "@/components/TerminalOutput";
import { useTranslation } from "@/lib/i18n";

interface BluetoothPowerControlProps {
  ip: string;
  password: string;
}

export default function BluetoothPowerControl({
  ip,
  password,
}: BluetoothPowerControlProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState<"on" | "off" | null>(null);
  const [active, setActive] = useState(false);
  const [powered, setPowered] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const postJsonWithTimeout = useCallback(
    async (url: string, body: Record<string, unknown>, timeoutMs: number) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    [],
  );

  const loadStatus = useCallback(async (options?: { silent?: boolean; retries?: number }) => {
    if (!ip || !password) {
      return;
    }

    setLoading(true);
    const silent = options?.silent ?? false;
    const retries = options?.retries ?? 1;

    if (!silent) addLog(t('bluetooth.power.checking'));

    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        const data = await postJsonWithTimeout("/api/bluetooth/status", { ip, password }, 15000);
        if (data.success) {
          setActive(Boolean(data.active));
          setPowered(Boolean(data.powered));
          if (!silent) {
            const statusLabel = data.active && data.powered 
              ? t('bluetooth.power.statusOn') 
              : data.active ? t('bluetooth.power.statusServiceOnly') : t('bluetooth.power.statusOff');
            addLog(t('bluetooth.power.success', { status: statusLabel }));
          }
          return;
        }

        const message = String(data.error ?? "");
        const transient = message.includes("Permission denied") || message.includes("timeout");
        if (!transient || attempt === retries - 1) {
          if (!silent) {
            addLog(`${t('common.error')}: ${t('bluetooth.power.changeFail', { error: data.error ?? t('common.error') })}`);
          }
          return;
        }

        if (!silent) addLog(`${t('common.retry')}... (${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (e) {
      if (!silent) {
        addLog(`${t('common.error')}: ${e instanceof Error ? e.message : t('common.error')}`);
      }
    } finally {
      setLoading(false);
    }
  }, [ip, password, postJsonWithTimeout, addLog, t]);

  useEffect(() => {
    void loadStatus({ retries: 4 });
  }, [loadStatus]);

  const applyPower = async (action: "on" | "off") => {
    setSavingAction(action);
    addLog(t('bluetooth.power.changing', { action: action === "on" ? t('bluetooth.power.on') : t('bluetooth.power.off') }));
    try {
      const data = await postJsonWithTimeout("/api/bluetooth/power", { ip, password, action }, 20000);
      if (data.success) {
        setActive(Boolean(data.active));
        setPowered(Boolean(data.powered));
        addLog(t('bluetooth.power.changeOk', { status: action === "on" ? t('bluetooth.power.statusOn') : t('bluetooth.power.statusOff') }));
      } else {
        addLog(t('bluetooth.power.changeFail', { error: data.error ?? t('common.error') }));
      }
    } catch (e) {
      addLog(`${t('common.error')}: ${e instanceof Error ? e.message : t('common.error')}`);
    } finally {
      setSavingAction(null);
      void loadStatus({ silent: true, retries: 2 });
    }
  };

  const isOn = active && powered;

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
      >
        <div>
          <p className="text-[16px] font-bold text-black">
            {t('bluetooth.power.title')}
          </p>
          <p className="text-[13px] font-medium opacity-50 mt-0.5">
            {t('bluetooth.power.help')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant={isOn ? "primary" : "ghost"}
            size="sm"
            onClick={() => applyPower("on")}
            loading={savingAction === "on"}
            disabled={savingAction !== null}
            className="font-bold"
          >
            {t('bluetooth.power.on')}
          </Button>
          <Button
            variant={!isOn ? "primary" : "ghost"}
            size="sm"
            onClick={() => applyPower("off")}
            loading={savingAction === "off"}
            disabled={savingAction !== null}
            className="font-bold"
          >
            {t('bluetooth.power.off')}
          </Button>
        </div>
      </div>

      <TerminalOutput
        lines={logs}
        title={t('bluetooth.power.logTitle') || "Bluetooth Power Log"}
        initiallyOpen={false}
        maxHeight="180px"
        showDownload={logs.length > 0}
        onDownload={() => {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const content = `=== REKOIT Bluetooth Power Control Log ===\n${logs.join("\n")}`;
          const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `rekoit-bt-power-${timestamp}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
