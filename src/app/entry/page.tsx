"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import { useSetup } from "@/lib/store";
import { useGuard } from "@/lib/useGuard";
import { useTranslation } from "@/lib/i18n";

type EntryAction = "install-hangul" | "install-bt" | "manage";

export default function EntryPage() {
  const { t } = useTranslation();
  const allowed = useGuard();
  const router = useRouter();
  const { state, setState } = useSetup();
  const [selectedAction, setSelectedAction] = useState<EntryAction>("install-hangul");
  const selectionTouchedRef = useRef(false);
  const [manageAvailable, setManageAvailable] = useState<boolean | null>(null);
  const [installedState, setInstalledState] = useState<{ hangul: boolean; bt: boolean }>({ hangul: false, bt: false });
  const [manageChecking, setManageChecking] = useState(true);
  const [manageCheckError, setManageCheckError] = useState<string | null>(null);
  const [eulaChecked, setEulaChecked] = useState(state.eulaAgreed);

  useEffect(() => {
    if (!allowed) return;

    let cancelled = false;

    const checkManageAvailability = async () => {
      setManageChecking(true);
      setManageCheckError(null);
      try {
        const res = await fetch("/api/manage/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password }),
        });
        const data = await res.json();
        if (cancelled) return;
        const installed = res.ok && data.installed === true;
        setManageAvailable(installed);
        setInstalledState({
          hangul: res.ok && data.hangulInstalled === true,
          bt: res.ok && data.btInstalled === true,
        });
        if (!selectionTouchedRef.current) {
          setSelectedAction(installed ? "manage" : "install-hangul");
        }
        if (!res.ok && data.error) {
          setManageCheckError(t('entry.checkingManageError') || "Unable to verify if management is available.");
        }
      } catch {
        if (cancelled) return;
        setManageAvailable(false);
        setInstalledState({ hangul: false, bt: false });
        setManageCheckError(t('entry.checkingManageError') || "Unable to verify if management is available.");
        if (!selectionTouchedRef.current) {
          setSelectedAction("install-hangul");
        }
      } finally {
        if (!cancelled) {
          setManageChecking(false);
        }
      }
    };

    void checkManageAvailability();

    return () => {
      cancelled = true;
    };
  }, [allowed, state.ip, state.password, t]);

  if (!allowed) return null;

  const canManage = manageAvailable === true;
  const isInstallAction = selectedAction === "install-hangul" || selectedAction === "install-bt";
  const actionCards = [
    {
      id: "install-hangul" as const,
      title: installedState.hangul ? t('entry.installHangulReinstall') : t('entry.installHangulTitle'),
      description: t('entry.installHangulDesc'),
      disabled: false,
    },
    {
      id: "install-bt" as const,
      title: installedState.bt ? t('entry.installBtReinstall') : t('entry.installBtTitle'),
      description: t('entry.installBtDesc'),
      disabled: false,
    },
    {
      id: "manage" as const,
      title: t('entry.manageTitle'),
      description: t('entry.manageDesc'),
      disabled: !canManage,
    },
  ];

  const nextLabel = selectedAction === "install-hangul"
    ? t('entry.goInstallHangul')
    : selectedAction === "install-bt"
      ? t('entry.goInstallBt')
      : t('entry.goManage');

  const handleNext = () => {
    if (selectedAction === "manage") {
      setState({ eulaAgreed: state.eulaAgreed });
      router.push("/manage");
      return;
    }

    setState({
      eulaAgreed: eulaChecked,
      installHangul: selectedAction === "install-hangul",
      installBtKeyboard: selectedAction === "install-bt",
    });
    router.push("/install");
  };

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={3} />

      <div className="space-y-8">
        <div>
          <h1
            className="text-[32px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t('entry.title')}
          </h1>
          <p
            className="mt-2 text-[15px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {t('entry.description')}
          </p>
        </div>

        <div className="space-y-5 stagger-1">
          <div className="grid gap-y-6 gap-x-2 md:grid-cols-3">
            {actionCards.map((action) => {
              const selected = selectedAction === action.id;
              const disabled = action.disabled;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    if (!disabled) {
                      selectionTouchedRef.current = true;
                      setSelectedAction(action.id);
                    }
                  }}
                  disabled={disabled}
                  className="text-left rounded-xl transition-all disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: selected ? "#000000" : "var(--bg-secondary)",
                    border: selected ? "2px solid #000000" : "1.5px solid var(--border-light)",
                    padding: "18px 20px",
                    boxShadow: selected ? "0 8px 20px rgba(0,0,0,0.12)" : "none",
                    opacity: disabled ? 0.55 : 1,
                    transform: selected ? "translateY(-2px)" : "none",
                  }}
                >
                  <p className="text-[18px] font-semibold" style={{ color: selected ? "#ffffff" : "var(--text-primary)" }}>
                    {action.title}
                  </p>
                  <p className="text-[14px] mt-2" style={{ color: selected ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}>
                    {disabled
                      ? manageChecking
                        ? t('entry.checkingManage')
                        : t('entry.manageDisabledHelp')
                      : action.description}
                  </p>
                </button>
              );
            })}
          </div>

          {manageCheckError && (
            <p className="text-[14px] animate-fade-in" style={{ color: "var(--warning)" }}>
              {manageCheckError}
            </p>
          )}
        </div>

        {isInstallAction && (
          <div className="space-y-6 stagger-2">
            {/* System Information Card */}
            <div
              className="rounded-none border-l-4 border-black"
              style={{
                backgroundColor: "#f9f9f9",
                padding: "24px",
                borderTop: "1.5px solid #000000",
                borderRight: "1.5px solid #000000",
                borderBottom: "1.5px solid #000000",
              }}
            >
              <div className="flex items-center gap-2 mb-6">
                <span className="text-[18px]">⚠️</span>
                <p className="text-[18px] font-bold" style={{ color: "#000000" }}>
                  {t('entry.checkBeforeInstall')}
                </p>
              </div>
              
              <div className="space-y-6 text-[14.5px] leading-relaxed" style={{ color: "#333333" }}>
                {/* 1. System Safety & Warranty */}
                <div>
                  <p className="font-bold text-[15px] mb-2">{t('entry.eula.section1Title')}</p>
                  <ul className="space-y-1.5 ml-1">
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section1Item1')}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section1Item2')}</span>
                    </li>
                  </ul>
                </div>

                {/* 2. Korean Input Engine & Display Support */}
                <div>
                  <p className="font-bold text-[15px] mb-2">{t('entry.eula.section2Title')}</p>
                  <ul className="space-y-1.5 ml-1">
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section2Item1')}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section2Item2')}</span>
                    </li>
                  </ul>
                </div>

                {/* 3. Bluetooth Helper */}
                <div>
                  <p className="font-bold text-[15px] mb-2">{t('entry.eula.section3Title')}</p>
                  <ul className="space-y-1.5 ml-1">
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section3Item1')}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section3Item2')}</span>
                    </li>
                  </ul>
                </div>

                {/* 4. Compatibility & Recommendations */}
                <div>
                  <p className="font-bold text-[15px] mb-2">{t('entry.eula.section4Title')}</p>
                  <ul className="space-y-1.5 ml-1">
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section4Item1')}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section4Item2')}</span>
                    </li>
                  </ul>
                </div>

                {/* 5. Cleanup & Recovery */}
                <div>
                  <p className="font-bold text-[15px] mb-2">{t('entry.eula.section5Title')}</p>
                  <ul className="space-y-1.5 ml-1">
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section5Item1')}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section5Item2')}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{t('entry.eula.section5Item3')}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <Checkbox
              checked={eulaChecked}
              onChange={setEulaChecked}
              label={t('entry.eulaAgreed')}
            />
          </div>
        )}

        <div className="flex justify-between pt-4 stagger-3">
          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>}
          >
            {t('common.first')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={manageChecking || (!isInstallAction && !canManage) || (isInstallAction && !eulaChecked)}
            size="lg"
          >
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
