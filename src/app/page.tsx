"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import { useSetup } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import Image from "next/image";
import logoImg from "./rekoit.png";

export default function WelcomePage() {
  const router = useRouter();
  const { state, setState, isLoaded } = useSetup();
  const { t } = useTranslation();
  const [ip, setIp] = useState("10.11.99.1");
  const [password, setPassword] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<"connected" | "disconnected" | null>(null);

  useEffect(() => {
    if (isLoaded) {
      if (state.ip) setIp(state.ip);
      if (state.password) setPassword(state.password);
      setMounted(true);
    }
  }, [isLoaded, state.ip, state.password]);

  const handlePing = async () => {
    if (!ip || !password) {
      setPingResult("disconnected");
      return;
    }
    setPinging(true);
    setPingResult(null);
    try {
      // Use /api/ssh/test to test actual SSH authentication, not just a simple ping
      const res = await fetch("/api/ssh/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, password }),
      });
      const data = await res.json();
      const success = res.ok && data.reachable === true;
      setPingResult(success ? "connected" : "disconnected");
      if (success) {
        setState({ ip, password, connected: true });
      }
    } catch {
      setPingResult("disconnected");
    } finally {
      setPinging(false);
    }
  };

  const isReachable = pingResult === "connected";

  const handleNext = () => {
    if (!isReachable) return;
    setState({ ip, password, connected: true });
    router.push("/prerequisites");
  };

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={0} />

      <div className="space-y-4">
        <div className="flex flex-col items-center text-center py-6">
          <div className="mb-6 relative w-24 h-24">
            <Image
              src={logoImg}
              alt="REKOIT Logo"
              width={96}
              height={96}
              priority
              className="object-contain"
            />
          </div>
          <h1
            className="text-[36px] font-bold leading-tight"
            style={{ color: "#000000" }}
          >
            REKOIT
          </h1>
          <p
            className="mt-3 text-[16px] font-medium max-w-md"
            style={{ color: "#666666" }}
          >
            {t('welcome.description')}
          </p>
        </div>

        <div className="stagger-1">
          <div className="operator-card operator-card-strong" style={{ padding: "16px 20px", border: "1.5px solid #000000" }}>
            <div className="space-y-5">
              <div>
                <label
                  className="block text-[13px] font-bold mb-1.5 uppercase tracking-wider"
                  style={{ color: "#000000" }}
                >
                  {t('welcome.ipAddress')}
                </label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => {
                    setIp(e.target.value);
                    setPingResult(null);
                    setState({ connected: false });
                  }}
                  className="w-full text-[16px] rounded-none input-enhanced"
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1.5px solid #000000",
                    color: "#000000",
                    padding: "12px 16px",
                  }}
                  placeholder="10.11.99.1"
                />
              </div>

              <div>
                <label
                  className="block text-[13px] font-bold mb-1.5 uppercase tracking-wider"
                  style={{ color: "#000000" }}
                >
                  {t('welcome.sshPassword')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPingResult(null);
                      setState({ connected: false });
                    }}
                    className="w-full pr-12 text-[16px] rounded-none input-enhanced"
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1.5px solid #000000",
                      color: "#000000",
                      padding: "12px 16px",
                    }}
                    placeholder={t('welcome.sshPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: "#000000" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                <p
                  className="mt-2 text-[12px] font-medium"
                  style={{ color: "#666666" }}
                >
                  {t('welcome.sshPasswordHelp')}
                </p>
              </div>

              <div
                className="rounded-none"
                style={{
                  backgroundColor: "#f6f6f6",
                  padding: "16px 20px",
                  borderLeft: "4px solid #000000",
                  borderTop: "1.5px solid #000000",
                  borderRight: "1.5px solid #000000",
                  borderBottom: "1.5px solid #000000",
                }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[18px]">⚠️</span>
                  <p className="text-[16px] font-bold" style={{ color: "#000000" }}>
                    {t('welcome.checkBeforeConnecting')}
                  </p>
                </div>
                <ul className="space-y-2 text-[15px]" style={{ color: "#333333" }}>
                  <li className="flex items-start gap-3">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                    <span className="font-medium">{t('welcome.checkSshPossible')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                    <span className="font-medium">{t('welcome.checkDevModeEnabled')}</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={handlePing}
                loading={pinging}
                disabled={!isLoaded || !mounted || !ip || !password}
                className="w-full font-bold tracking-tight"
                style={{
                  backgroundColor: isReachable ? "#0071e3" : "#000000",
                  borderColor: isReachable ? "#0071e3" : "#000000",
                  color: "#ffffff",
                  padding: "16px 40px",
                  fontSize: "16px",
                  borderRadius: "6px",
                  boxShadow: isReachable ? "0 4px 14px rgba(0, 113, 227, 0.25)" : "0 4px 12px rgba(0, 0, 0, 0.15)",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                }}
              >
                {isReachable ? t('welcome.sshCheckSuccess') : t('welcome.sshCheckButton')}
              </Button>

              {pingResult && !isReachable && (
                <div
                  className="text-[14px] animate-fade-in text-center mt-4"
                  style={{
                    color: "#000000",
                    borderTop: "1px solid #000000",
                    paddingTop: "12px",
                    fontWeight: "500"
                  }}
                >
                  {t('welcome.connectionFailed')}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end stagger-2 pt-6">
          <Button
            onClick={handleNext}
            disabled={!isLoaded || !mounted || !isReachable || !password}
            size="lg"
            className="px-16"
          >
            {t('common.next')}
          </Button>
        </div>

      </div>
    </div>
  );
}
