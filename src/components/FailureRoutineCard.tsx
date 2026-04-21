interface FailureRoutine {
  id: string;
  title: string;
  steps: string[];
}

interface FailureRoutineCardProps {
  routines: FailureRoutine[];
}

export default function FailureRoutineCard({
  routines,
}: FailureRoutineCardProps) {
  return (
    <section className="operator-card animate-fade-in-up stagger-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="operator-label">실패 시 루틴</p>
          <h3 className="text-[24px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
            지금 확인할 것
          </h3>
        </div>
      </div>

      <div className="grid gap-4 mt-6 md:grid-cols-2">
        {routines.map((routine) => (
          <div
            key={routine.id}
            className="rounded-2xl px-5 py-5"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h4 className="text-[17px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {routine.title}
            </h4>
            <div className="mt-4 space-y-3">
              {routine.steps.map((step, index) => (
                <div key={`${routine.id}-${index}`} className="flex items-start gap-3">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-light)" }}
                  >
                    {index + 1}
                  </span>
                  <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
