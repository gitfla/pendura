"use client";

import { useProject } from "@/context/ProjectContext";
import { STEP_INDEX } from "@/lib/types";

const SEGMENTS = 6;

export default function ProgressBar() {
  const { currentStep } = useProject();
  const filled = STEP_INDEX[currentStep] + 1;

  return (
    <div className="flex gap-1 px-4 pt-3 pb-2" style={{ backgroundColor: "var(--surface)" }}>
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <div
          key={i}
          className="h-[2px] flex-1 transition-colors duration-300"
          style={{
            backgroundColor:
              i < filled ? "var(--primary)" : "var(--surface-dim)",
          }}
        />
      ))}
    </div>
  );
}
