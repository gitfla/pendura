"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { rectToQuad } from "@/lib/geometry";
import { Point, PaintingDimensions } from "@/lib/types";
import dynamic from "next/dynamic";
import type { KonvaPlacementHandle } from "@/components/editor/KonvaPlacement";
import CalibrationOverlay from "@/components/editor/CalibrationOverlay";

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

type CalibrationPhase = "off" | "measure" | "distance" | "dimensions";

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

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const stageHeight = konvaRef.current?.getStageHeight() ?? Math.round(containerWidth * 0.75);

  const handleMeasureComplete = (pointA: Point, pointB: Point) => {
    // Points picked — open distance modal
    setPendingCalib({ pointA, pointB, realDistance: 0, unit: "cm", pxPerUnit: 0 });
    setCalibPhase("distance");
  };

  const handleDistanceConfirm = (
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

    // Apply resize directly — KonvaPlacement is always mounted
    konvaRef.current?.resizePainting(newW, newH);

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

      {/* Canvas area — always visible, overlay for calibration */}
      <div
        ref={containerRef}
        className="w-full mb-4 relative overflow-hidden"
      >
        {/* Instant wall preview — prevents flash while Konva loads */}
        {state.wallPreviewUrl && (
          <img
            src={state.wallPreviewUrl}
            alt=""
            className="w-full block"
            style={{ pointerEvents: "none" }}
          />
        )}
        {containerWidth > 0 && (
          <div style={{ position: "absolute", inset: 0 }}>
            <KonvaPlacement
              ref={konvaRef}
              wallUrl={state.wallPreviewUrl ?? ""}
              paintingUrl={state.croppedPaintingUrl ?? ""}
              containerWidth={containerWidth}
              hidePainting={calibPhase !== "off"}
              onTransformChange={(x, y, width, height, rotation, canvasWidth, canvasHeight) => {
                const quad = rectToQuad(x, y, width, height, rotation);
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

        {calibPhase !== "off" && containerWidth > 0 && (
          <CalibrationOverlay
            phase={calibPhase}
            containerWidth={containerWidth}
            stageHeight={stageHeight}
            croppedPaintingUrl={state.croppedPaintingUrl}
            onMeasureComplete={handleMeasureComplete}
            onDistanceConfirm={handleDistanceConfirm}
            onDimensionsApply={handleDimensionsApply}
            onCancel={handleCalibCancel}
          />
        )}
      </div>

      {/* Toast overlay */}
      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className="px-6 py-4 text-xs tracking-widest uppercase font-medium text-center"
            style={{
              backgroundColor: "rgba(249,249,246,0.85)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              color: "var(--on-surface)",
              boxShadow: "0 4px 60px rgba(46,52,48,0.06)",
            }}
          >
            {t("calibration.suggestedApplied")}
          </div>
        </div>
      )}

      {/* Two side-by-side action cards */}
      <div className="grid grid-cols-2 mb-6" style={{ gap: "1px", backgroundColor: "var(--outline-variant)", opacity: calibPhase !== "off" ? 0.4 : 1 }}>
        <button
          onClick={() => calibPhase === "off" && setCalibPhase("measure")}
          className="flex flex-col items-center justify-center py-5 gap-2"
          style={{ backgroundColor: "var(--surface-container-low)" }}
          disabled={calibPhase !== "off"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
            <path d="M2 2h4v20H2zM6 2h2v3H6zM6 8h2v3H6zM6 14h2v3H6zM6 19h2v3H6zM18 2h4v20h-4zM16 2h2v3h-2zM16 8h2v3h-2zM16 14h2v3h-2zM16 19h2v3h-2zM8 11h8v2H8z" />
          </svg>
          <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
            {t("setExactSize")}
          </span>
        </button>
        <button
          onClick={() => calibPhase === "off" && goNext()}
          className="flex flex-col items-center justify-center py-5 gap-2"
          style={{ backgroundColor: "var(--surface-container-low)" }}
          disabled={calibPhase !== "off"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
            <rect x="4" y="4" width="16" height="16" />
            <circle cx="4" cy="4" r="2" fill="currentColor" />
            <circle cx="20" cy="4" r="2" fill="currentColor" />
            <circle cx="20" cy="20" r="2" fill="currentColor" />
            <circle cx="4" cy="20" r="2" fill="currentColor" />
          </svg>
          <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
            {t("adjustCorners")}
          </span>
        </button>
      </div>

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
        onClick={goPrev}
        className="w-full py-3 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
        style={{ color: "var(--on-surface-variant)" }}
      >
        <span>←</span>
        <span>{t("previousButton")}</span>
      </button>
    </div>
  );
}
