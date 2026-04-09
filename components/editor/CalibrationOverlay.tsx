"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Point, PaintingDimensions } from "@/lib/types";
import { euclideanDistance } from "@/lib/geometry";

type CalibPhase = "measure" | "distance" | "dimensions";

type Props = {
  phase: CalibPhase;
  containerWidth: number;
  stageHeight: number;
  croppedPaintingUrl: string | null;
  onMeasureComplete: (pointA: Point, pointB: Point) => void;
  onDistanceConfirm: (
    pointA: Point,
    pointB: Point,
    realDistance: number,
    unit: "cm" | "in",
    pxPerUnit: number,
  ) => void;
  onDimensionsApply: (dims: PaintingDimensions) => void;
  onCancel: () => void;
};

const DOT_R = 8;

export default function CalibrationOverlay({
  phase,
  containerWidth,
  stageHeight,
  croppedPaintingUrl,
  onMeasureComplete,
  onDistanceConfirm,
  onDimensionsApply,
  onCancel,
}: Props) {
  const t = useTranslations("placement.calibration");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Point picking state
  const [pointA, setPointA] = useState<Point | null>(null);
  const [pointB, setPointB] = useState<Point | null>(null);

  // Distance modal state
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");

  // Dimensions modal state
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== "measure") return;
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * containerWidth;
    const y = ((e.clientY - rect.top) / rect.height) * stageHeight;

    if (!pointA) {
      setPointA({ x, y });
    } else if (!pointB) {
      const b = { x, y };
      setPointB(b);
      onMeasureComplete(pointA, b);
    }
  };

  const handleDistanceConfirm = () => {
    const d = parseFloat(distance);
    if (!pointA || !pointB || !d || d <= 0) return;
    const pxDist = euclideanDistance(pointA, pointB);
    const pxPerUnit = pxDist / d;
    onDistanceConfirm(pointA, pointB, d, unit, pxPerUnit);
  };

  const handleDimensionsApply = () => {
    const w = parseFloat(dimWidth);
    const h = parseFloat(dimHeight);
    if (!w || !h || w <= 0 || h <= 0) return;
    onDimensionsApply({ width: w, height: h, unit });
  };

  // Convert point to SVG percentage coordinates
  const pctX = (p: Point) => `${(p.x / containerWidth) * 100}%`;
  const pctY = (p: Point) => `${(p.y / stageHeight) * 100}%`;

  const distNum = parseFloat(distance);
  const canConfirmDistance = pointA && pointB && distNum > 0;
  const dimW = parseFloat(dimWidth);
  const dimH = parseFloat(dimHeight);
  const canApplyDims = dimW > 0 && dimH > 0;

  const showModal = phase === "distance" || phase === "dimensions";

  return (
    <>
      {/* Overlay on the canvas area */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ cursor: phase === "measure" ? "crosshair" : "default" }}
        onClick={handleOverlayClick}
      >
        {/* Dim layer */}
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.25)" }} />

        {/* SVG dots + line */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {pointA && (
            <>
              <circle cx={pctX(pointA)} cy={pctY(pointA)} r={DOT_R} fill="rgba(255,255,255,0.9)" stroke="#5a7a5a" strokeWidth={2} />
              <circle cx={pctX(pointA)} cy={pctY(pointA)} r={3} fill="#5a7a5a" />
              <text x={pctX(pointA)} y={pctY(pointA)} dy={-14} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold" style={{ fontFamily: "system-ui, sans-serif" }}>
                {t("pointA")}
              </text>
            </>
          )}
          {pointA && pointB && (
            <>
              <line
                x1={pctX(pointA)} y1={pctY(pointA)}
                x2={pctX(pointB)} y2={pctY(pointB)}
                stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeDasharray="6 4"
              />
              <circle cx={pctX(pointB)} cy={pctY(pointB)} r={DOT_R} fill="rgba(255,255,255,0.9)" stroke="#5a7a5a" strokeWidth={2} />
              <circle cx={pctX(pointB)} cy={pctY(pointB)} r={3} fill="#5a7a5a" />
              <text x={pctX(pointB)} y={pctY(pointB)} dy={-14} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold" style={{ fontFamily: "system-ui, sans-serif" }}>
                {t("pointB")}
              </text>
            </>
          )}
        </svg>

        {/* Floating instruction chip during measure phase */}
        {phase === "measure" && !pointB && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto"
            style={{ padding: "10px 14px", backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>
              {t("instruction")}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-xs uppercase tracking-widest ml-4 shrink-0"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>

      {/* Modal — rendered via portal to escape overflow:hidden */}
      {showModal && createPortal(
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }} />

          {/* Modal card */}
          <div
            className="relative w-[calc(100%-48px)] max-w-sm p-5"
            style={{
              backgroundColor: "color-mix(in srgb, var(--surface) 85%, transparent)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 8px 60px rgba(46,52,48,0.06)",
            }}
          >
            {phase === "distance" && (
              <>
                <p className="text-sm font-medium mb-4" style={{ color: "var(--on-surface)" }}>
                  {t("distanceTitle")}
                </p>
                <div className="flex items-end gap-2 mb-4">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs block mb-1" style={{ color: "var(--on-surface-variant)" }}>
                      {t("distanceLabel")}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      className="w-full px-3 py-2 text-base"
                      style={{
                        backgroundColor: "var(--surface-container-high)",
                        color: "var(--on-surface)",
                        border: "none",
                        borderBottom: "2px solid var(--outline-variant)",
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="shrink-0 flex overflow-hidden" style={{ border: "1px solid var(--outline-variant)" }}>
                    <button
                      onClick={() => setUnit("cm")}
                      className="px-3 py-2 text-xs font-medium"
                      style={{
                        backgroundColor: unit === "cm" ? "var(--primary)" : "var(--surface-container-low)",
                        color: unit === "cm" ? "var(--on-primary)" : "var(--on-surface-variant)",
                      }}
                    >
                      {t("cm")}
                    </button>
                    <button
                      onClick={() => setUnit("in")}
                      className="px-3 py-2 text-xs font-medium"
                      style={{
                        backgroundColor: unit === "in" ? "var(--primary)" : "var(--surface-container-low)",
                        color: unit === "in" ? "var(--on-primary)" : "var(--on-surface-variant)",
                      }}
                    >
                      {t("in")}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-xs tracking-widest uppercase"
                    style={{ color: "var(--on-surface-variant)" }}
                  >
                    {t("cancel")}
                  </button>
                  <button
                    onClick={handleDistanceConfirm}
                    disabled={!canConfirmDistance}
                    className="flex-1 py-3 text-xs tracking-widest uppercase font-medium"
                    style={{
                      backgroundColor: canConfirmDistance ? "var(--primary)" : "var(--outline-variant)",
                      color: canConfirmDistance ? "var(--on-primary)" : "var(--on-surface-variant)",
                      opacity: canConfirmDistance ? 1 : 0.5,
                    }}
                  >
                    {t("confirm")}
                  </button>
                </div>
              </>
            )}

            {phase === "dimensions" && (
              <>
                <p className="text-sm font-medium mb-3" style={{ color: "var(--on-surface)" }}>
                  {t("sizeTitle")}
                </p>

                {croppedPaintingUrl && (
                  <div className="flex justify-center mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={croppedPaintingUrl}
                      alt=""
                      style={{ maxHeight: 120, maxWidth: "100%", objectFit: "contain" }}
                    />
                  </div>
                )}

                <div className="flex gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs block mb-1" style={{ color: "var(--on-surface-variant)" }}>
                      {t("widthLabel")} ({t(unit)})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={dimWidth}
                      onChange={(e) => setDimWidth(e.target.value)}
                      className="w-full px-3 py-2 text-base"
                      style={{
                        backgroundColor: "var(--surface-container-high)",
                        color: "var(--on-surface)",
                        border: "none",
                        borderBottom: "2px solid var(--outline-variant)",
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-xs block mb-1" style={{ color: "var(--on-surface-variant)" }}>
                      {t("heightLabel")} ({t(unit)})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={dimHeight}
                      onChange={(e) => setDimHeight(e.target.value)}
                      className="w-full px-3 py-2 text-base"
                      style={{
                        backgroundColor: "var(--surface-container-high)",
                        color: "var(--on-surface)",
                        border: "none",
                        borderBottom: "2px solid var(--outline-variant)",
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-xs tracking-widest uppercase"
                    style={{ color: "var(--on-surface-variant)" }}
                  >
                    {t("cancel")}
                  </button>
                  <button
                    onClick={handleDimensionsApply}
                    disabled={!canApplyDims}
                    className="flex-1 py-3 text-xs tracking-widest uppercase font-medium"
                    style={{
                      backgroundColor: canApplyDims ? "var(--primary)" : "var(--outline-variant)",
                      color: canApplyDims ? "var(--on-primary)" : "var(--on-surface-variant)",
                      opacity: canApplyDims ? 1 : 0.5,
                    }}
                  >
                    {t("apply")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
