// 상태 점검 항목 컴포넌트 (원형 아이콘 배경 + 구분 간격)
interface StatusCheckProps {
  label: string;
  status: "pending" | "checking" | "pass" | "fail";
  detail?: string;
}

export default function StatusCheck({
  label,
  status,
  detail,
}: StatusCheckProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-lg animate-fade-in-up"
      style={{
        padding: "16px 20px",
        marginBottom: "2px",
        transition: "background-color var(--transition-fast)",
      }}
    >
      {/* 원형 아이콘 배경 */}
      <div className="flex-shrink-0 flex items-center justify-center">
        {status === "pending" && (
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--border)" }}
          />
        )}
        {status === "checking" && (
          <span className="inline-flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: "var(--text-muted)",
                  animation: "dotBounce 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </span>
        )}
        {status === "pass" && (
          <div
            className="flex items-center justify-center animate-checkmark"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "#f0fdf4",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--success)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {status === "fail" && (
          <div
            className="flex items-center justify-center animate-scale-in"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "#fef2f2",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--error)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span
          className="text-[16px]"
          style={{
            color: status === "fail" ? "var(--error)" : "var(--text-primary)",
          }}
        >
          {label}
        </span>
        {detail && (
          <p
            className="text-[13px] mt-0.5 truncate"
            style={{ color: "var(--text-muted)" }}
            title={detail}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
