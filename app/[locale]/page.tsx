"use client";

import { useProject } from "@/context/ProjectContext";
import StepNav from "@/components/ui/StepNav";
import ProgressBar from "@/components/ui/ProgressBar";
import WallUploadStep from "@/components/steps/WallUploadStep";
import PaintingUploadStep from "@/components/steps/PaintingUploadStep";
import CropStep from "@/components/steps/CropStep";
import PlacementStep from "@/components/steps/PlacementStep";
import PerspectiveStep from "@/components/steps/PerspectiveStep";
import RenderStep from "@/components/steps/RenderStep";

export default function HomePage() {
  const { currentStep } = useProject();

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "var(--surface)" }}>
      <ProgressBar />
      <main className="flex-1 pb-24">
        {currentStep === "wall" && <WallUploadStep />}
        {currentStep === "painting" && <PaintingUploadStep />}
        {currentStep === "crop" && <CropStep />}
        {currentStep === "placement" && <PlacementStep />}
        {currentStep === "perspective" && <PerspectiveStep />}
        {currentStep === "render" && <RenderStep />}
      </main>
      <StepNav />
    </div>
  );
}
