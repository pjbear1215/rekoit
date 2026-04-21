"use client";

import type { ReactNode } from "react";

interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
  children?: ReactNode;
}

// 커스텀 스타일 라디오 버튼 컴포넌트
// 네이티브 input은 sr-only로 숨기고 접근성 유지
export default function Radio({
  checked,
  onChange,
  label,
  description,
  disabled,
  children,
}: RadioProps): ReactNode {
  return (
    <label
      className={`flex items-start gap-4 py-5 px-6 rounded-xl cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      style={{
        backgroundColor: checked ? "rgba(10,132,255,0.08)" : "rgba(255,255,255,0.55)",
        border: checked
          ? "1px solid rgba(10,132,255,0.34)"
          : "1px solid var(--border-light)",
        boxShadow: checked ? "var(--shadow-sm)" : "none",
        transition: `all var(--transition-fast)`,
      }}
    >
      {/* 라디오 버튼 시각 요소 */}
      <div
        className="flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          backgroundColor: checked ? "rgba(10,132,255,0.12)" : "rgba(255,255,255,0.72)",
          border: checked ? "1px solid rgba(10,132,255,0.4)" : "1.5px solid rgba(126, 120, 111, 0.48)",
          transition: `all var(--transition-spring)`,
        }}
      >
        {checked && (
          <div
            className="animate-scale-in"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--apple-blue)",
            }}
          />
        )}
      </div>
      {/* 스크린 리더용 숨겨진 네이티브 input */}
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <div>
        <span
          className="text-[16px] font-medium leading-[1.5]"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </span>
        {description && (
          <p
            className="text-[14px] mt-1.5 leading-[1.6]"
            style={{ color: "var(--text-muted)" }}
          >
            {description}
          </p>
        )}
        {children}
      </div>
    </label>
  );
}
