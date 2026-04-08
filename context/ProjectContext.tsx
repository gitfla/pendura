"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ProjectState, Step, STEP_INDEX } from "@/lib/types";
import { serializeSession, deserializeSession } from "@/lib/sessionPersist";

const initialState: ProjectState = {
  wallImage: null,
  wallPreviewUrl: null,
  paintingImage: null,
  paintingPreviewUrl: null,
  croppedPaintingBlob: null,
  croppedPaintingUrl: null,
  cropRect: null,
  placement: null,
};

type ProjectContextType = {
  state: ProjectState;
  setState: (updates: Partial<ProjectState>) => void;
  currentStep: Step;
  maxReachedStep: Step;
  goToStep: (step: Step) => void;
  goNext: () => void;
  goPrev: () => void;
  reset: () => void;
  persistForLocaleSwitch: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextType | null>(null);

const STEPS_ORDER: Step[] = [
  "wall",
  "painting",
  "crop",
  "placement",
  "perspective",
  "render",
];

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<ProjectState>(initialState);
  const [currentStep, setCurrentStep] = useState<Step>("wall");
  const [maxReachedStep, setMaxReachedStep] = useState<Step>("wall");

  // Restore session from IndexedDB on mount (after locale switch)
  useEffect(() => {
    deserializeSession().then((restored) => {
      if (restored) {
        setStateRaw(restored.state);
        setCurrentStep(restored.currentStep);
        setMaxReachedStep(restored.maxReachedStep);
      }
    });
  }, []);

  const setState = (updates: Partial<ProjectState>) => {
    setStateRaw((prev) => ({ ...prev, ...updates }));
  };

  const scrollToTop = () => setTimeout(() => window.scrollTo(0, 0), 0);

  const goToStep = (step: Step) => {
    // Allow navigating to any already-reached step, or skipping forward (e.g. skip perspective → render)
    setCurrentStep(step);
    if (STEP_INDEX[step] > STEP_INDEX[maxReachedStep]) {
      setMaxReachedStep(step);
    }
    scrollToTop();
  };

  const goNext = () => {
    const idx = STEP_INDEX[currentStep];
    if (idx < STEPS_ORDER.length - 1) {
      const next = STEPS_ORDER[idx + 1];
      setCurrentStep(next);
      if (STEP_INDEX[next] > STEP_INDEX[maxReachedStep]) {
        setMaxReachedStep(next);
      }
    }
    scrollToTop();
  };

  const goPrev = () => {
    const idx = STEP_INDEX[currentStep];
    if (idx > 0) {
      setCurrentStep(STEPS_ORDER[idx - 1]);
    }
    scrollToTop();
  };

  const reset = () => {
    // croppedPaintingUrl is still an object URL (created from canvas blob)
    if (state.croppedPaintingUrl) URL.revokeObjectURL(state.croppedPaintingUrl);
    setStateRaw(initialState);
    setCurrentStep("wall");
    setMaxReachedStep("wall");
    scrollToTop();
  };

  const persistForLocaleSwitch = useCallback(async () => {
    await serializeSession(state, currentStep, maxReachedStep);
  }, [state, currentStep, maxReachedStep]);

  return (
    <ProjectContext.Provider
      value={{
        state,
        setState,
        currentStep,
        maxReachedStep,
        goToStep,
        goNext,
        goPrev,
        reset,
        persistForLocaleSwitch,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
