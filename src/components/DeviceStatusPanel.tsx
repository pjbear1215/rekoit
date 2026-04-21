import type { CSSProperties } from "react";

interface DeviceCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

interface SafetyStatus {
  tone: "safe" | "caution" | "danger" | "neutral";
  label: string;
  description: string;
}

interface DeviceStatusPanelProps {
  hostname?: string;
  firmware?: string;
  freeSpace?: string;
  model?: string;
  runtimeStateLabel: string;
  safety: SafetyStatus;
  checks: DeviceCheck[];
}

const toneStyles: Record<SafetyStatus["tone"], CSSProperties> = {
  safe: {
    backgroundColor: "var(--success-light)",
    color: "var(--success)",
  },
  caution: {
    backgroundColor: "var(--warning-light)",
    color: "var(--warning)",
  },
  danger: {
    backgroundColor: "var(--error-light)",
    color: "var(--error)",
  },
  neutral: {
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-secondary)",
  },
};

export default function DeviceStatusPanel({
  hostname,
  firmware,
  freeSpace,
  model,
  runtimeStateLabel,
  safety,
  checks,
}: DeviceStatusPanelProps) {
  return (
    <section
      className="operator-card operator-card-strong animate-fade-in-up"
      style={{ display: "flex", flexDirection: "column", gap: "20px" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="operator-label">현재 기기 상태</p>
          <h2 className="text-[28px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
            {runtimeStateLabel}
          </h2>
          <p className="text-[14px] mt-3" style={{ color: "var(--text-muted)" }}>
            {hostname || "unknown"} · {model || "unknown"} · {firmware || "unknown"} · /home 여유 {freeSpace || "unknown"}
          </p>
        </div>

        <div
          className="px-4 py-3 rounded-2xl min-w-[220px]"
          style={{
            ...toneStyles[safety.tone],
            border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
          }}
        >
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em]">
            Safety
          </div>
          <div className="text-[16px] font-semibold mt-2">{safety.label}</div>
          <div className="text-[13px] mt-2" style={{ color: "inherit", opacity: 0.86 }}>
            {safety.description}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {checks.map((check) => (
          <div
            key={check.id}
            className="rounded-2xl px-4 py-4"
            style={{
              backgroundColor: check.pass ? "rgba(22,163,74,0.08)" : "rgba(217,119,6,0.10)",
              border: `1px solid ${check.pass ? "rgba(22,163,74,0.18)" : "rgba(217,119,6,0.18)"}`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>
                {check.label}
              </span>
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: check.pass ? "var(--success)" : "var(--warning)" }}
              >
                {check.pass ? "Ready" : "Check"}
              </span>
            </div>
            <p className="text-[13px] mt-2" style={{ color: "var(--text-muted)" }}>
              {check.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
