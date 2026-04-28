"use client";

import { useTranslation } from "@/lib/i18n";

interface StepIndicatorProps {
  currentStep: number;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const { t } = useTranslation();
  
  const steps = [
    t('components.stepIndicator.start'),
    t('components.stepIndicator.tools'),
    t('components.stepIndicator.connect'),
    t('components.stepIndicator.select'),
    t('components.stepIndicator.install'),
    t('components.stepIndicator.bt'),
    t('components.stepIndicator.done')
  ];

  return (
    <div className="flex items-center justify-between mb-6 px-2 relative">
      {/* Connector line background (full) */}
      <div
        className="absolute top-[10px] left-0 right-0 h-[1.5px]"
        style={{
          backgroundColor: "#e0e0e0",
        }}
      />
      {/* Connector line progress (completed section) */}
      <div
        className="absolute top-[10px] left-0 h-[1.5px]"
        style={{
          width: `${(Math.min(currentStep, steps.length - 1) / (steps.length - 1)) * 100}%`,
          backgroundColor: "#000000",
          transition: "width 0.4s ease-out",
        }}
      />
      {steps.map((label, i) => (
        <div
          key={i}
          className="flex flex-col items-center"
        >
          {/* Dot */}
          {i < currentStep ? (
            // Completed step: Black circle + White checkmark
            <div
              className="relative z-10"
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: "#000000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.3s ease",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : i === currentStep ? (
            // Current step: Black border circle
            <div
              className="relative z-10"
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: "#ffffff",
                border: "2.5px solid #000000",
                transition: "all 0.3s ease",
              }}
            />
          ) : (
            // Future step: Light gray small circle
            <div
              className="relative z-10"
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                backgroundColor: "#e0e0e0",
                transition: "all 0.3s ease",
              }}
            />
          )}
          {/* Label */}
          <span
            className="text-[12px] mt-2.5 font-bold uppercase tracking-widest"
            style={{
              color: i === currentStep ? "#000000" : i < currentStep ? "#666666" : "#bbbbbb",
              transition: "color 0.3s ease",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
