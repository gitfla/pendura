"use client";

import { useProject } from "@/context/ProjectContext";
import ProgressBar from "@/components/ui/ProgressBar";
import SiteHeader from "@/components/ui/SiteHeader";
import StepCheckpoint from "@/components/ui/StepCheckpoint";
import WallUploadStep from "@/components/steps/WallUploadStep";
import PaintingUploadStep from "@/components/steps/PaintingUploadStep";
import CropStep from "@/components/steps/CropStep";
import PlacementStep from "@/components/steps/PlacementStep";
import RenderStep from "@/components/steps/RenderStep";

export default function HomePage() {
  const { currentStep, checkpointMessage, checkpointImageUrl, advanceFromCheckpoint } = useProject();

  return (
    <div className="flex flex-col min-h-dvh" style={{ backgroundColor: "var(--surface)" }}>
      <SiteHeader />
      <ProgressBar />
      <main className="flex-1 pb-8">
        {currentStep === "wall" && <WallUploadStep />}
        {currentStep === "painting" && <PaintingUploadStep />}
        {currentStep === "crop" && <CropStep />}
        {currentStep === "placement" && <PlacementStep />}
        {currentStep === "render" && <RenderStep />}
      </main>
      {checkpointMessage && (
        <StepCheckpoint message={checkpointMessage} imageUrl={checkpointImageUrl} onAdvance={advanceFromCheckpoint} />
      )}
    </div>
  );
}
