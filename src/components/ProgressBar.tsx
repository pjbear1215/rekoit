import type { ReactNode } from "react";

interface ProgressBarProps {
  progress: number;
  status?: "active" | "complete" | "error";
  currentStep?: string;
}

// Progress bar component
// Displays shimmer animation in active state, solid for complete/error states
export default function ProgressBar({
  progress,
  status = "active",
}: ProgressBarProps): ReactNode {
  const isComplete = progress >= 100 && status === "complete";

  // State-specific fill colors (reMarkable style: solid color emphasis)
  const fillBackground =
    status === "error"
      ? "var(--error)"
      : status === "complete"
        ? "var(--accent)" // Clean black finish on success
        : "var(--accent-secondary)"; // Sophisticated blue during progress

  return (
    <div className="w-full">
      <div className="flex justify-end items-center mb-2">
        <span
          className="text-[12px] font-bold font-mono tracking-tight"
          style={{
            color: status === "error" ? "var(--error)" : "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {progress}%
        </span>
      </div>
      {/* Progress bar track */}
      <div
        className="h-1.5 overflow-hidden rounded-full w-full"
        style={{
          backgroundColor: "var(--border-light)",
        }}
      >
        {/* Progress bar fill area */}
        <div
          className="h-full relative transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: fillBackground,
            borderRadius: progress > 98 ? "inherit" : "9999px 0 0 9999px",
          }}
        >
          {/* Shimmer overlay removed (aiming for flat design) */}
        </div>
      </div>
    </div>
  );
}
