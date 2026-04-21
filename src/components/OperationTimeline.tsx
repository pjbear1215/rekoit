interface TimelineItem {
  id: string;
  label: string;
  status: "done" | "pending";
  detail: string;
}

interface OperationTimelineProps {
  items: TimelineItem[];
}

export default function OperationTimeline({
  items,
}: OperationTimelineProps) {
  return (
    <section className="operator-card animate-fade-in-up stagger-3">
      <p className="operator-label">운영 타임라인</p>
      <h3 className="text-[24px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
        재부팅, 업데이트, 초기화 준비 상태
      </h3>

      <div className="mt-6 space-y-4">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-start gap-4">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: item.status === "done" ? "var(--accent)" : "var(--border)" }}
              />
              {index < items.length - 1 && (
                <div
                  style={{
                    width: "2px",
                    height: "56px",
                    marginTop: "8px",
                    background: item.status === "done"
                      ? "linear-gradient(to bottom, rgba(17,24,39,0.4), rgba(17,24,39,0.08))"
                      : "linear-gradient(to bottom, rgba(148,163,184,0.45), rgba(148,163,184,0.12))",
                  }}
                />
              )}
            </div>
            <div className="pb-6">
              <div className="flex items-center gap-3">
                <h4 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {item.label}
                </h4>
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: item.status === "done" ? "var(--success)" : "var(--warning)" }}
                >
                  {item.status === "done" ? "Ready" : "Pending"}
                </span>
              </div>
              <p className="text-[14px] mt-2" style={{ color: "var(--text-muted)" }}>
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
