"use client";

import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { Step, STEP_INDEX } from "@/lib/types";

type SegmentItem = {
  step: Step;
  labelKey: "wall" | "art" | "crop" | "place" | "render";
};

const SEGMENTS: SegmentItem[] = [
  { step: "wall", labelKey: "wall" },
  { step: "painting", labelKey: "art" },
  { step: "crop", labelKey: "crop" },
  { step: "placement", labelKey: "place" },
  { step: "render", labelKey: "render" },
];

export default function ProgressBar() {
  const t = useTranslations("nav");
  const { currentStep, maxReachedStep, goToStep } = useProject();

  return (
    <nav
      className="flex gap-1 px-4 pt-3 pb-1"
      style={{ backgroundColor: "var(--surface)" }}
    >
      {SEGMENTS.map(({ step, labelKey }) => {
        const isActive = currentStep === step;
        const isReachable = STEP_INDEX[step] <= STEP_INDEX[maxReachedStep];
        const isFilled = STEP_INDEX[step] <= STEP_INDEX[currentStep];

        return (
          <button
            key={step}
            onClick={() => isReachable && goToStep(step)}
            disabled={!isReachable}
            className="flex-1 flex flex-col items-center gap-1 transition-opacity"
            style={{
              cursor: isReachable ? "pointer" : "default",
              opacity: isReachable ? 1 : 0.4,
            }}
          >
            <div
              className="w-full h-[2px] transition-colors duration-300"
              style={{
                backgroundColor: isFilled
                  ? "var(--primary)"
                  : "var(--surface-dim)",
              }}
            />
            <span
              className="text-[9px] font-medium tracking-widest uppercase transition-colors"
              style={{
                color: isActive
                  ? "var(--primary)"
                  : isReachable
                    ? "var(--on-surface-variant)"
                    : "var(--outline-variant)",
              }}
            >
              {t(labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
