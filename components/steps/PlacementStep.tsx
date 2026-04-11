"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { rectToQuad, euclideanDistance } from "@/lib/geometry";
import { Point, PaintingDimensions, FrameStyle } from "@/lib/types";
import { applyFrame } from "@/lib/frameRenderer";
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

const STORAGE_KEY = "pendura_unit";
type CalibrationPhase = "off" | "measure" | "distance" | "dimensions";

export default function PlacementStep() {
  const t = useTranslations("placement");
  const { state, setState, goNext, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const konvaRef = useRef<KonvaPlacementHandle>(null);
  const distanceInputRef = useRef<HTMLInputElement>(null);
  const widthInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [photoHeight, setPhotoHeight] = useState(0);
  const [calibPhase, setCalibPhase] = useState<CalibrationPhase>("off");

  // Point picking
  const [pointA, setPointA] = useState<Point | null>(null);
  const [pointB, setPointB] = useState<Point | null>(null);

  // Distance input
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [pxPerUnit, setPxPerUnit] = useState(0);

  // Dimensions input
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");

  // Pending resize to apply once Konva remounts after calibration
  const [pendingResize, setPendingResize] = useState<{ w: number; h: number } | null>(null);

  const [toast, setToast] = useState(false);

  // Frame style
  const [frameStyle, setFrameStyle] = useState<FrameStyle>(state.frameStyle ?? "none");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "cm" || saved === "in") setUnit(saved);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Apply pending resize once Konva is back (calibPhase === "off" and konvaRef mounted)
  useEffect(() => {
    if (!pendingResize || calibPhase !== "off") return;
    // Konva may still be mounting — defer one tick
    const id = setTimeout(() => {
      konvaRef.current?.resizePainting(pendingResize.w, pendingResize.h);
      setPendingResize(null);
    }, 0);
    return () => clearTimeout(id);
  }, [pendingResize, calibPhase]);

  // Generate framed painting when frameStyle changes — always from original croppedPaintingUrl
  useEffect(() => {
    if (!state.croppedPaintingUrl) return;
    let cancelled = false;

    if (frameStyle === "none") {
      if (state.framedPaintingUrl) URL.revokeObjectURL(state.framedPaintingUrl);
      setState({ frameStyle: "none", framedPaintingBlob: null, framedPaintingUrl: null });
      return;
    }

    applyFrame(state.croppedPaintingUrl, frameStyle).then((result) => {
      if (cancelled || !result) return;
      if (state.framedPaintingUrl) URL.revokeObjectURL(state.framedPaintingUrl);
      setState({ frameStyle, framedPaintingBlob: result.blob, framedPaintingUrl: result.url });
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameStyle, state.croppedPaintingUrl]);

  const stageHeight = konvaRef.current?.getStageHeight() ?? Math.round(containerWidth * 0.75);
  // Use measured photo height when in calib phases (Konva not shown)
  const overlayHeight = calibPhase !== "off" ? photoHeight || Math.round(containerWidth * 0.75) : stageHeight;

  const handleUnitChange = (u: "cm" | "in") => {
    setUnit(u);
    localStorage.setItem(STORAGE_KEY, u);
  };

  const handlePhotoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (calibPhase !== "measure") return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * containerWidth;
    const y = ((e.clientY - rect.top) / rect.height) * overlayHeight;

    if (!pointA) {
      setPointA({ x, y });
    } else if (!pointB) {
      const b = { x, y };
      setPointB(b);
      setCalibPhase("distance");
    }
  };

  const handleDistanceConfirm = () => {
    const d = parseFloat(distance);
    if (!pointA || !pointB || !d || d <= 0) return;
    const pxDist = euclideanDistance(pointA, pointB);
    setPxPerUnit(pxDist / d);
    setCalibPhase("dimensions");
  };

  const handleDimensionsApply = () => {
    const w = parseFloat(dimWidth);
    const h = parseFloat(dimHeight);
    if (!w || !h || w <= 0 || h <= 0) return;

    let dimW = w;
    let dimH = h;
    // dims are always in `unit`, pxPerUnit is also in `unit` — no conversion needed

    const newW = dimW * pxPerUnit;
    const newH = dimH * pxPerUnit;

    // Konva is unmounted while in calib — store resize to apply after remount
    setPendingResize({ w: newW, h: newH });

    if (pointA && pointB) {
      setState({
        calibration: {
          pointA,
          pointB,
          realDistance: parseFloat(distance),
          unit,
          pxPerUnit,
        },
        paintingDimensions: { width: w, height: h, unit },
      });
    }

    handleCalibCancel();
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  };

  const handleCalibCancel = () => {
    setCalibPhase("off");
    setPointA(null);
    setPointB(null);
    setDistance("");
    setDimWidth("");
    setDimHeight("");
  };

  const distNum = parseFloat(distance);
  const canConfirm = pointA && pointB && distNum > 0;
  const dimW = parseFloat(dimWidth);
  const dimH = parseFloat(dimHeight);
  const canApply = dimW > 0 && dimH > 0;

  const inCalib = calibPhase !== "off";

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      {/* Title */}
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {inCalib ? t("calibrationTitle") : t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--on-surface-variant)", minHeight: "4rem" }}>
        {calibPhase === "measure" ? t("calibration.instruction") : inCalib ? "" : t("subtitle")}
      </p>

      {/* Photo / canvas area */}
      <div
        className="w-full mb-4"
        style={{ padding: 10, backgroundColor: "#fff", boxShadow: "0 4px 32px rgba(46,52,48,0.08)" }}
      >
      <div
        ref={containerRef}
        className="w-full relative overflow-hidden"
        style={{ cursor: calibPhase === "measure" ? "crosshair" : "default" }}
        onClick={handlePhotoClick}
      >
        {/* Dimensions phase: show painting photo */}
        {calibPhase === "dimensions" ? (
          state.croppedPaintingUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.croppedPaintingUrl}
              alt=""
              className="w-full block"
              style={{ pointerEvents: "none" }}
            />
          )
        ) : (
          <>
            {/* Wall photo — always shown during off/measure/distance */}
            {state.wallPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.wallPreviewUrl}
                alt=""
                className="w-full block"
                style={{ pointerEvents: "none" }}
                onLoad={(e) => setPhotoHeight((e.target as HTMLImageElement).offsetHeight)}
              />
            )}

            {/* Konva canvas — only when not in calib */}
            {containerWidth > 0 && !inCalib && (
              <div style={{ position: "absolute", inset: 0 }}>
                <KonvaPlacement
                  ref={konvaRef}
                  wallUrl={state.wallPreviewUrl ?? ""}
                  paintingUrl={state.framedPaintingUrl ?? state.croppedPaintingUrl ?? ""}
                  containerWidth={containerWidth}
                  hidePainting={false}
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

            {/* Calib SVG overlay — measure + distance phases */}
            {(calibPhase === "measure" || calibPhase === "distance") && containerWidth > 0 && (
              <CalibrationOverlay
                pointA={pointA}
                pointB={pointB}
                containerWidth={containerWidth}
                stageHeight={overlayHeight}
                labelA={t("calibration.pointA")}
                labelB={t("calibration.pointB")}
              />
            )}
          </>
        )}
      </div>
      </div>

      {/* ── Distance input block ── */}
      {calibPhase === "distance" && (
        <div className="mb-6" style={{ borderTop: "2px solid var(--outline-variant)" }}>
          {/* Header row: label + unit toggle */}
          <div className="flex items-center justify-between pt-4 mb-4">
            <span className="text-xs uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>
              {t("calibration.distanceMeasurement")}
            </span>
            <div className="flex gap-4">
              {(["cm", "in"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => handleUnitChange(u)}
                  className="text-xs uppercase tracking-widest pb-1"
                  style={{
                    color: unit === u ? "var(--on-surface)" : "var(--outline-variant)",
                    borderBottom: unit === u ? "1px solid var(--on-surface)" : "1px solid transparent",
                  }}
                >
                  {t(`calibration.${u}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Number display — tap to focus */}
          <div
            className="flex items-baseline gap-2 mb-1"
            onClick={() => distanceInputRef.current?.focus()}
            style={{ cursor: "text" }}
          >
            <span
              className="font-serif italic leading-none"
              style={{
                fontSize: "clamp(2.5rem, 14vw, 4rem)",
                color: distance ? "var(--on-surface)" : "var(--outline-variant)",
              }}
            >
              {distance || "0.00"}
            </span>
            <span className="font-serif italic text-xl" style={{ color: "var(--on-surface-variant)" }}>
              {t(`calibration.${unit}`)}
            </span>
            <input
              ref={distanceInputRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleDistanceConfirm(); }}
              className="absolute opacity-0 pointer-events-none"
              style={{ width: 1, height: 1 }}
              tabIndex={-1}
            />
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--outline-variant)" }}>
            {t("calibration.minHint", { unit: t(`calibration.${unit}`) })}
          </p>
        </div>
      )}

      {/* ── Dimensions input block ── */}
      {calibPhase === "dimensions" && (
        <div className="mb-6" style={{ borderTop: "2px solid var(--outline-variant)" }}>
          <div className="flex items-center justify-between pt-4 mb-4">
            <span className="text-xs uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>
              {t("calibration.paintingDimensions")}
            </span>
            <span className="text-xs uppercase tracking-widest" style={{ color: "var(--outline-variant)" }}>
              {t(`calibration.${unit}`)}
            </span>
          </div>

          <div className="flex gap-6 mb-4">
            {/* Width */}
            <div
              className="flex-1 flex flex-col gap-1"
              onClick={() => widthInputRef.current?.focus()}
              style={{ cursor: "text" }}
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>
                {t("calibration.widthLabel")}
              </span>
              <div className="flex items-baseline gap-1">
                <span
                  className="font-serif italic leading-none"
                  style={{
                    fontSize: "clamp(2rem, 10vw, 3rem)",
                    color: dimWidth ? "var(--on-surface)" : "var(--outline-variant)",
                  }}
                >
                  {dimWidth || "—"}
                </span>
              </div>
              <input
                ref={widthInputRef}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={dimWidth}
                onChange={(e) => setDimWidth(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") heightInputRef.current?.focus(); }}
                className="absolute opacity-0 pointer-events-none"
                style={{ width: 1, height: 1 }}
                tabIndex={-1}
              />
            </div>

            <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "var(--outline-variant)" }} />

            {/* Height */}
            <div
              className="flex-1 flex flex-col gap-1"
              onClick={() => heightInputRef.current?.focus()}
              style={{ cursor: "text" }}
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>
                {t("calibration.heightLabel")}
              </span>
              <div className="flex items-baseline gap-1">
                <span
                  className="font-serif italic leading-none"
                  style={{
                    fontSize: "clamp(2rem, 10vw, 3rem)",
                    color: dimHeight ? "var(--on-surface)" : "var(--outline-variant)",
                  }}
                >
                  {dimHeight || "—"}
                </span>
              </div>
              <input
                ref={heightInputRef}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={dimHeight}
                onChange={(e) => setDimHeight(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canApply) handleDimensionsApply(); }}
                className="absolute opacity-0 pointer-events-none"
                style={{ width: 1, height: 1 }}
                tabIndex={-1}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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

      {/* ── Normal mode buttons ── */}
      {!inCalib && (
        <>
          <div className="grid grid-cols-2 mb-6" style={{ gap: "1px", backgroundColor: "var(--outline-variant)" }}>
            <button
              onClick={() => setCalibPhase("measure")}
              className="flex flex-col items-center justify-center py-5 gap-2"
              style={{ backgroundColor: "var(--surface-container-low)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
                <path d="M2 2h4v20H2zM6 2h2v3H6zM6 8h2v3H6zM6 14h2v3H6zM6 19h2v3H6zM18 2h4v20h-4zM16 2h2v3h-2zM16 8h2v3h-2zM16 14h2v3h-2zM16 19h2v3h-2zM8 11h8v2H8z" />
              </svg>
              <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                {t("setExactSize")}
              </span>
            </button>
            <button
              onClick={goNext}
              className="flex flex-col items-center justify-center py-5 gap-2"
              style={{ backgroundColor: "var(--surface-container-low)" }}
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

          {/* Frame selector */}
          <div className="mb-6">
            <p className="text-[10px] tracking-widest uppercase mb-2 px-1" style={{ color: "var(--on-surface-variant)" }}>
              {t("frame.label")}
            </p>
            <div className="grid grid-cols-4" style={{ gap: "1px", backgroundColor: "var(--outline-variant)" }}>
              {(["none", "white", "black", "wood"] as FrameStyle[]).map((style) => {
                const isActive = frameStyle === style;
                const swatchStyle: React.CSSProperties = style === "none"
                  ? { background: "linear-gradient(135deg, #ccc 49%, #fff 49%)" }
                  : style === "white"
                  ? { backgroundColor: "#ede9e3", border: "1px solid #ccc" }
                  : style === "black"
                  ? { backgroundColor: "#111" }
                  : { background: "linear-gradient(135deg, #c4864a, #8b5e3c)" };
                return (
                  <button
                    key={style}
                    onClick={() => setFrameStyle(style)}
                    className="flex flex-col items-center justify-center py-4 gap-2"
                    style={{ backgroundColor: isActive ? "var(--surface-container-high)" : "var(--surface-container-low)" }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 1, ...swatchStyle }} />
                    <span className="text-[10px] tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                      {t(`frame.${style}` as "frame.none" | "frame.white" | "frame.black" | "frame.wood")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => goToStep("render")}
            className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 mb-3"
            style={{
              background: `linear-gradient(to right, var(--primary), var(--primary-dim))`,
              color: "var(--on-primary)",
            }}
          >
            <span>{t("continueButton")}</span>
            <span>→</span>
          </button>

          <button
            onClick={goPrev}
            className="w-full py-3 text-xs tracking-widest uppercase flex items-center gap-2 px-6"
            style={{ color: "var(--on-surface-variant)" }}
          >
            <span>←</span>
            <span>{t("previousButton")}</span>
          </button>
        </>
      )}

      {/* ── Calibration action buttons ── */}
      {inCalib && (
        <>
          {calibPhase === "distance" && (
            <button
              onClick={handleDistanceConfirm}
              disabled={!canConfirm}
              className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 mb-3"
              style={{
                background: canConfirm ? `linear-gradient(to right, var(--primary), var(--primary-dim))` : "var(--outline-variant)",
                color: canConfirm ? "var(--on-primary)" : "var(--on-surface-variant)",
                opacity: canConfirm ? 1 : 0.5,
              }}
            >
              <span>{t("calibration.confirm")}</span>
              <span>→</span>
            </button>
          )}

          {calibPhase === "dimensions" && (
            <button
              onClick={handleDimensionsApply}
              disabled={!canApply}
              className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 mb-3"
              style={{
                background: canApply ? `linear-gradient(to right, var(--primary), var(--primary-dim))` : "var(--outline-variant)",
                color: canApply ? "var(--on-primary)" : "var(--on-surface-variant)",
                opacity: canApply ? 1 : 0.5,
              }}
            >
              <span>{t("calibration.apply")}</span>
              <span>→</span>
            </button>
          )}

          <button
            onClick={handleCalibCancel}
            className="w-full py-3 text-xs tracking-widest uppercase flex items-center gap-2 px-6"
            style={{ color: "var(--on-surface-variant)" }}
          >
            <span>←</span>
            <span>{t("calibration.cancel")}</span>
          </button>
        </>
      )}
    </div>
  );
}
