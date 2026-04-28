"use client";

import Button from "@/components/Button";
import { useTranslation } from "@/lib/i18n";

interface ActionItem {
  id: string;
  title: string;
  description: string;
  href: string;
  kind?: "primary" | "secondary" | "danger";
  recommended?: boolean;
}

interface ActionCardGridProps {
  actions: ActionItem[];
  onNavigate: (href: string) => void;
}

export default function ActionCardGrid({
  actions,
  onNavigate,
}: ActionCardGridProps) {
  const { t } = useTranslation();

  return (
    <section className="grid gap-y-8 gap-x-3 md:grid-cols-2 xl:grid-cols-4 animate-fade-in-up stagger-1">
      {actions.map((action) => (
        <div
          key={action.id}
          className="operator-card flex flex-col justify-between p-6"
          style={{ minHeight: "220px", gap: "20px" }}
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="operator-label">{action.recommended ? t('common.recommended') : t('common.action')}</p>
              {action.recommended && (
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: "rgba(17,24,39,0.06)", color: "var(--text-primary)" }}
                >
                  {t('common.recommended')}
                </span>
              )}
            </div>
            <h3 className="text-[22px] font-semibold mt-3" style={{ color: "var(--text-primary)" }}>
              {action.title}
            </h3>
            <p className="text-[14px] mt-3" style={{ color: "var(--text-muted)" }}>
              {action.description}
            </p>
          </div>

          <Button
            variant={action.kind === "danger" ? "danger" : action.recommended ? "primary" : "secondary"}
            size="md"
            onClick={() => onNavigate(action.href)}
          >
            {t('common.open')}
          </Button>
        </div>
      ))}
    </section>
  );
}
