import type { ReactNode } from "react";

interface SectionDividerProps {
  label: string;
}

// Section divider component
// Modern Pill-style label design + left accent bar
export default function SectionDivider({
  label,
}: SectionDividerProps): ReactNode {
  return (
    <div style={{ paddingTop: "4px", paddingBottom: "4px" }}>
      <div className="flex items-center gap-3">
        {/* Left accent bar (black) */}
        <div
          className="flex-shrink-0"
          style={{
            width: "3px",
            height: "14px",
            backgroundColor: "#000000",
          }}
        />
        <span
          className="text-[12px] font-bold uppercase tracking-[0.15em] flex-shrink-0"
          style={{
            color: "#000000",
            letterSpacing: "0.15em",
          }}
        >
          {label}
        </span>
        <div
          className="flex-1"
          style={{
            height: "1.5px",
            backgroundColor: "rgba(0,0,0,0.08)",
          }}
        />
      </div>
    </div>
  );
}
