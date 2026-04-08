"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { rectToQuad } from "@/lib/geometry";
import { Point, PaintingDimensions } from "@/lib/types";
import dynamic from "next/dynamic";
import type { KonvaPlacementHandle } from "@/components/editor/KonvaPlacement";
import WallMeasure from "@/components/editor/WallMeasure";
import PaintingSizeInput from "@/components/editor/PaintingSizeInput";

const KonvaPlacement = dynamic(() => import("@/components/editor/KonvaPlacement"), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center" style={{ aspectRatio: "4/3", backgroundColor: "var(--surface-container-low)" }}>
      <span className="text-xs tracking-widest uppercase" style={{ color: "var(--outline-variant)" }}>
        Loading editor...
      </span>
    </div>
  ),
});

type CalibrationPhase = "off" | "measure" | "dimensions";

export default function PlacementStep() {
  const t = useTranslations("placement");
  const { state, setState, goNext, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const konvaRef = useRef<KonvaPlacementHandle>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [calibPhase, setCalibPhase] = useState<CalibrationPhase>("off");
  const [pendingCalib, setPendingCalib] = useState<{
    pointA: Point;
    pointB: Point;
    realDistance: number;
    unit: "cm" | "in";
    pxPerUnit: number;
  } | null>(null);
  const [toast, setToast] = useState(false);
  const [pendingResize, setPendingResize] = useState<{ w: number; h: number } | null>(null);

  // Apply deferred resize after Konva becomes visible again
  useEffect(() => {
    if (calibPhase === "off" && pendingResize) {
      // Small delay to ensure Konva has re-rendered after becoming visible
      const id = requestAnimationFrame(() => {
        konvaRef.current?.resizePainting(pendingResize.w, pendingResize.h);
        setPendingResize(null);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [calibPhase, pendingResize]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleMeasureComplete = (
    pointA: Point,
    pointB: Point,
    realDistance: number,
    unit: "cm" | "in",
    pxPerUnit: number,
  ) => {
    setPendingCalib({ pointA, pointB, realDistance, unit, pxPerUnit });
    setCalibPhase("dimensions");
  };

  const handleDimensionsApply = (dims: PaintingDimensions) => {
    if (!pendingCalib) return;

    const { pxPerUnit } = pendingCalib;
    // Convert painting real dimensions to the same unit as calibration
    let dimW = dims.width;
    let dimH = dims.height;
    if (dims.unit !== pendingCalib.unit) {
      if (dims.unit === "in") {
        dimW *= 2.54;
        dimH *= 2.54;
      } else {
        dimW /= 2.54;
        dimH /= 2.54;
      }
    }

    const newW = dimW * pxPerUnit;
    const newH = dimH * pxPerUnit;

    console.log("[Calibration] apply dimensions", {
      inputDims: dims,
      calibUnit: pendingCalib.unit,
      convertedDims: { w: dimW, h: dimH },
      pxPerUnit,
      resultPx: { w: newW, h: newH },
      containerWidth,
    });

    // Defer resize — Konva is hidden during calibration, apply after it's visible
    setPendingResize({ w: newW, h: newH });

    // Store calibration and painting dimensions
    setState({
      calibration: {
        pointA: pendingCalib.pointA,
        pointB: pendingCalib.pointB,
        realDistance: pendingCalib.realDistance,
        unit: pendingCalib.unit,
        pxPerUnit,
      },
      paintingDimensions: dims,
    });

    // Clean up and show toast
    setCalibPhase("off");
    setPendingCalib(null);
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  };

  const handleCalibCancel = () => {
    setCalibPhase("off");
    setPendingCalib(null);
  };

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      <div ref={containerRef} className="w-full mb-4 overflow-hidden">
        {containerWidth > 0 && (
          <div style={{ display: calibPhase === "off" ? "block" : "none" }}>
            <KonvaPlacement
              ref={konvaRef}
              wallUrl={state.wallPreviewUrl ?? ""}
              paintingUrl={state.croppedPaintingUrl ?? ""}
              containerWidth={containerWidth}
              onTransformChange={(x, y, width, height, rotation, canvasWidth, canvasHeight) => {
                const quad = rectToQuad(x, y, width, height, rotation);
                console.log("[Placement] quad in canvas coords", quad, "canvas:", canvasWidth, canvasHeight);
                setState({
                  placement: {
                    mode: "basic",
                    quad,
                    rotationDeg: rotation,
                    canvasWidth,
                    canvasHeight,
                  },
                });
              }}
            />
          </div>
        )}

        {calibPhase === "measure" && containerWidth > 0 && (
          <WallMeasure
            wallUrl={state.wallPreviewUrl ?? ""}
            containerWidth={containerWidth}
            onComplete={handleMeasureComplete}
            onCancel={handleCalibCancel}
          />
        )}

        {calibPhase === "dimensions" && pendingCalib && (
          <PaintingSizeInput
            unit={pendingCalib.unit}
            onApply={handleDimensionsApply}
            onCancel={handleCalibCancel}
          />
        )}
      </div>

      {toast && (
        <p className="text-xs text-center mb-4" style={{ color: "var(--primary)" }}>
          {t("calibration.suggestedApplied")}
        </p>
      )}

      {calibPhase === "off" && (
        <>
          <button
            onClick={() => setCalibPhase("measure")}
            className="w-full py-3 text-xs tracking-widest uppercase mb-4 flex items-center justify-center gap-2"
            style={{ color: "var(--on-surface-variant)" }}
          >
            {t("setExactSize")}
          </button>

          <button
            onClick={() => goToStep("render")}
            className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-center mb-3"
            style={{
              background: `linear-gradient(to right, var(--primary), var(--primary-dim))`,
              color: "var(--on-primary)",
            }}
          >
            {t("continueButton")}
          </button>

          <button
            onClick={goNext}
            className="w-full py-3 text-xs tracking-widest uppercase mb-3 flex items-center justify-center gap-2"
            style={{
              border: "1px solid var(--primary)",
              color: "var(--primary)",
            }}
          >
            {t("adjustCornersButton")}
          </button>

          <button
            onClick={goPrev}
            className="w-full py-3 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
            style={{ color: "var(--on-surface-variant)" }}
          >
            <span>←</span>
            <span>{t("previousButton")}</span>
          </button>
        </>
      )}
    </div>
  );
}
