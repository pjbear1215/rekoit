"use client";

import { useState, useCallback } from "react";

interface ErrorReportProps {
  errors: string[];
  allLogs: string[];
  context?: string;
}

export default function ErrorReport({
  errors,
  allLogs,
  context = "설치",
}: ErrorReportProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  // 복사 버튼 스케일 애니메이션용
  const [justCopied, setJustCopied] = useState(false);

  const buildReport = useCallback((): string => {
    const timestamp = new Date().toISOString();
    const header = `=== ${context} 오류 리포트 ===`;
    const meta = `시간: ${timestamp}\n오류 수: ${errors.length}`;
    const errorSection = errors.length > 0
      ? `\n--- 오류 ---\n${errors.join("\n")}`
      : "";
    const logSection = `\n--- 전체 로그 ---\n${allLogs.join("\n")}`;
    return `${header}\n${meta}${errorSection}${logSection}`;
  }, [errors, allLogs, context]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 200);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = buildReport();
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 200);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (errors.length === 0) return null;

  return (
    <div
      className="overflow-hidden"
      style={{
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer"
        style={{
          backgroundColor: "var(--bg-secondary)",
          transition: "background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          오류 상세 ({errors.length}건)
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 부드러운 max-height 트랜지션으로 펼침/접힘 */}
      <div
        style={{
          maxHeight: expanded ? "500px" : "0px",
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 400ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="px-3 py-2 space-y-1 overflow-y-auto font-mono text-[11px]"
          style={{ maxHeight: "160px" }}
        >
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span
                className="flex-shrink-0 text-[10px] font-semibold px-1 rounded"
                style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}
              >
                {i + 1}
              </span>
              <span className="break-all" style={{ color: "var(--error)" }}>
                {err.replace(/^ERROR:\s*/, "")}
              </span>
            </div>
          ))}
        </div>

        <div
          className="px-3 py-2 flex justify-end"
          style={{ borderTop: "1px solid var(--border-light)" }}
        >
          <button
            onClick={handleCopy}
            className="text-[11px] font-medium cursor-pointer"
            style={{
              backgroundColor: copied ? "var(--success-light)" : "var(--bg-secondary)",
              color: copied ? "var(--success)" : "var(--text-muted)",
              padding: "4px 14px",
              borderRadius: "9999px",
              transform: justCopied ? "scale(1.05)" : "scale(1)",
              transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {copied ? "복사됨" : "리포트 복사"}
          </button>
        </div>
      </div>
    </div>
  );
}
