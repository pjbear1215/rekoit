"use client";

import { useState, useMemo } from "react";

import Button from "@/components/Button";
import SectionDivider from "@/components/SectionDivider";
import TerminalOutput from "@/components/TerminalOutput";
import { useTranslation } from "@/lib/i18n";

interface DiagnosisPanelProps {
  ip: string;
  password: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

export default function DiagnosisPanel({
  ip,
  password,
  title,
  subtitle,
  className,
}: DiagnosisPanelProps) {
  const { t } = useTranslation();
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<Record<string, string> | null>(null);

  const displayTitle = title || t('diagnose.title');
  const displaySubtitle = subtitle || t('diagnose.description');

  const runDiagnosis = async () => {
    setDiagnosing(true);
    setDiagResult(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, password }),
      });
      const data = await res.json();
      setDiagResult(data.results);
    } catch {
      setDiagResult({ error: t('common.error') });
    } finally {
      setDiagnosing(false);
    }
  };

  const downloadDiagnosis = () => {
    if (!diagResult) return;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:]/g, "-")
      .replace(/\..+$/, "");
    const body = Object.entries(diagResult)
      .map(([key, value]) => `--- ${key} ---\n${value}`.trimEnd())
      .join("\n\n");
    const content = `=== REKOIT Diagnosis Results ===\nTime: ${new Date().toISOString()}\nDevice: ${ip}\n\n${body}\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekoit-diagnose-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const logLines = useMemo(() => {
    if (!diagResult) return [];
    const lines: string[] = [];
    Object.entries(diagResult).forEach(([key, value]) => {
      lines.push(`=== ${key} ===`);
      lines.push(...value.split("\n"));
      lines.push(""); // spacer
    });
    return lines;
  }, [diagResult]);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <SectionDivider label={displayTitle} />
      <div
        className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
      >
        <div>
          <p className="text-[16px] font-bold text-black">
            {displayTitle}
          </p>
          <p className="text-[13px] font-medium opacity-50 mt-0.5">
            {displaySubtitle}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={runDiagnosis} loading={diagnosing} className="font-bold">
          {t('diagnose.runDiagnose')}
        </Button>
      </div>
      {diagResult && (
        <div className="animate-fade-in">
          <TerminalOutput
            lines={logLines}
            title={t('diagnose.logTitle') || "System Diagnosis"}
            initiallyOpen={true}
            showDownload={true}
            onDownload={downloadDiagnosis}
            maxHeight="400px"
          />
        </div>
      )}
    </div>
  );
}
