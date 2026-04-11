"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { rectToQuad, euclideanDistance, isQuadConvex, pointInQuad } from "@/lib/geometry";
import { Point, Quad, FrameStyle } from "@/lib/types";
import { applyFrame } from "@/lib/frameRenderer";
import { clientPerspectiveWarp } from "@/lib/clientWarp";
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
const HANDLE_SIZE = 12;
const HIT_RADIUS = 24;

type CalibrationPhase = "off" | "measure" | "distance" | "dimensions";
type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
type DragState =
  | { type: "corner"; key: HandleKey; offsetX: number; offsetY: number }
  | { type: "move"; lastX: number; lastY: number };

export default function PlacementStep() {
  const t = useTranslations("placement");
  const { state, setState, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const konvaRef = useRef<KonvaPlacementHandle>(null);
  const perspCanvasRef = useRef<HTMLCanvasElement>(null);
  // Stable initial rect for KonvaPlacement — captured once when Konva mounts, never updated from live state
  const initialRectRef = useRef<{ x: number; y: number; width: number; height: number; rotation: number } | undefined>(undefined);
  const distanceInputRef = useRef<HTMLInputElement>(null);
  const widthInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [photoHeight, setPhotoHeight] = useState(0);
  const [calibPhase, setCalibPhase] = useState<CalibrationPhase>("off");

  // Point picking for calibration
  const [pointA, setPointA] = useState<Point | null>(null);
  const [pointB, setPointB] = useState<Point | null>(null);

  // Distance input
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [pxPerUnit, setPxPerUnit] = useState(0);

  // Dimensions input
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");


  const [toast, setToast] = useState(false);

  // Frame style
  const [frameStyle, setFrameStyle] = useState<FrameStyle>(state.frameStyle ?? "none");

  // Perspective mode
  const [perspMode, setPerspMode] = useState(false);
  const [displayQuad, setDisplayQuad] = useState<Quad | null>(null);
  const [wallImg, setWallImg] = useState<HTMLImageElement | null>(null);
  const [paintingImg, setPaintingImg] = useState<HTMLImageElement | null>(null);
  const [paintingData, setPaintingData] = useState<ImageData | null>(null);
  const draggingRef = useRef<DragState | null>(null);
  const rafRef = useRef<number>(0);

  const stageHeight = wallImg && containerWidth > 0
    ? Math.round((wallImg.naturalHeight / wallImg.naturalWidth) * containerWidth)
    : Math.round(containerWidth * 0.75);

  // ── Setup ──────────────────────────────────────────────────────────────────

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


  // Generate framed painting when frameStyle changes
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

  // ── Perspective mode: load images ─────────────────────────────────────────

  useEffect(() => {
    if (!state.wallPreviewUrl) return;
    const img = new Image();
    img.onload = () => setWallImg(img);
    img.src = state.wallPreviewUrl;
  }, [state.wallPreviewUrl]);

  useEffect(() => {
    const src = state.framedPaintingUrl ?? state.croppedPaintingUrl;
    if (!src) return;
    const img = new Image();
    img.onload = () => setPaintingImg(img);
    img.src = src;
  }, [state.framedPaintingUrl, state.croppedPaintingUrl]);

  // Extract painting ImageData once for warp reuse
  useEffect(() => {
    if (!paintingImg) return;
    const oc = document.createElement("canvas");
    oc.width = paintingImg.naturalWidth;
    oc.height = paintingImg.naturalHeight;
    oc.getContext("2d")!.drawImage(paintingImg, 0, 0);
    setPaintingData(oc.getContext("2d")!.getImageData(0, 0, oc.width, oc.height));
  }, [paintingImg]);

  // Init displayQuad when entering perspective mode
  useEffect(() => {
    if (!perspMode || !state.placement) return;
    setDisplayQuad(state.placement.quad);
  }, [perspMode, state.placement]);

  // Draw perspective canvas
  useEffect(() => {
    if (!perspMode) return;
    const canvas = perspCanvasRef.current;
    if (!canvas || !wallImg || !containerWidth) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = stageHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${stageHeight}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, containerWidth, stageHeight);
    ctx.drawImage(wallImg, 0, 0, containerWidth, stageHeight);

    if (!displayQuad) return;
    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = displayQuad;

    if (paintingData) {
      const { imageData, x, y } = clientPerspectiveWarp(paintingData, displayQuad, containerWidth, stageHeight);
      const oc = document.createElement("canvas");
      oc.width = imageData.width;
      oc.height = imageData.height;
      oc.getContext("2d")!.putImageData(imageData, 0, 0);
      ctx.drawImage(oc, x, y);
    }

    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.strokeStyle = "rgba(160,165,160,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [perspMode, wallImg, paintingData, displayQuad, containerWidth, stageHeight]);

  // ── Perspective pointer events ─────────────────────────────────────────────

  const getPointerPos = (e: React.PointerEvent): Point => {
    const rect = perspCanvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTestCorner = (pos: Point): HandleKey | null => {
    if (!displayQuad) return null;
    for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]) {
      const p = displayQuad[key];
      if (Math.abs(pos.x - p.x) <= HIT_RADIUS && Math.abs(pos.y - p.y) <= HIT_RADIUS) return key;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!displayQuad) return;
    const pos = getPointerPos(e);
    const cornerKey = hitTestCorner(pos);
    if (cornerKey) {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = {
        type: "corner",
        key: cornerKey,
        offsetX: pos.x - displayQuad[cornerKey].x,
        offsetY: pos.y - displayQuad[cornerKey].y,
      };
    } else if (pointInQuad(pos, displayQuad)) {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = { type: "move", lastX: pos.x, lastY: pos.y };
    }
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !displayQuad) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    const drag = draggingRef.current;

    let newQuad: Quad;
    if (drag.type === "corner") {
      newQuad = {
        ...displayQuad,
        [drag.key]: {
          x: Math.max(0, Math.min(containerWidth, pos.x - drag.offsetX)),
          y: Math.max(0, Math.min(stageHeight, pos.y - drag.offsetY)),
        },
      };
    } else {
      const dx = pos.x - drag.lastX;
      const dy = pos.y - drag.lastY;
      newQuad = {
        topLeft:     { x: displayQuad.topLeft.x + dx,     y: displayQuad.topLeft.y + dy },
        topRight:    { x: displayQuad.topRight.x + dx,    y: displayQuad.topRight.y + dy },
        bottomRight: { x: displayQuad.bottomRight.x + dx, y: displayQuad.bottomRight.y + dy },
        bottomLeft:  { x: displayQuad.bottomLeft.x + dx,  y: displayQuad.bottomLeft.y + dy },
      };
      draggingRef.current = { type: "move", lastX: pos.x, lastY: pos.y };
    }

    if (isQuadConvex(newQuad)) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setDisplayQuad(newQuad));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayQuad, containerWidth, stageHeight]);

  const onPointerUp = () => {
    if (!displayQuad) return;
    cancelAnimationFrame(rafRef.current);
    draggingRef.current = null;
    setState({
      placement: {
        mode: "perspective",
        quad: displayQuad,
        rotationDeg: state.placement?.rotationDeg ?? 0,
        canvasWidth: containerWidth,
        canvasHeight: stageHeight,
      },
    });
  };

  const handleResetToRect = () => {
    setPerspMode(false);
  };

  // ── Calibration ────────────────────────────────────────────────────────────

  const konvaStageHeight = konvaRef.current?.getStageHeight() ?? Math.round(containerWidth * 0.75);
  const overlayHeight = calibPhase !== "off" ? photoHeight || Math.round(containerWidth * 0.75) : konvaStageHeight;

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
      setPointB({ x, y });
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

    const newW = w * pxPerUnit;
    const newH = h * pxPerUnit;

    // Compute center of current painting from saved placement quad
    if (state.placement) {
      const q = state.placement.quad;
      const xs = [q.topLeft.x, q.topRight.x, q.bottomRight.x, q.bottomLeft.x];
      const ys = [q.topLeft.y, q.topRight.y, q.bottomRight.y, q.bottomLeft.y];
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      initialRectRef.current = {
        x: cx - newW / 2,
        y: cy - newH / 2,
        width: newW,
        height: newH,
        rotation: 0,
      };
    } else {
      // No placement yet — KonvaPlacement will center at default, just set the size
      initialRectRef.current = undefined;
    }

    if (pointA && pointB) {
      setState({
        calibration: { pointA, pointB, realDistance: parseFloat(distance), unit, pxPerUnit },
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

  // ── Subtitle logic ─────────────────────────────────────────────────────────

  const subtitle = inCalib
    ? (calibPhase === "measure" ? t("calibration.instruction") : "")
    : perspMode
    ? t("perspSubtitle")
    : t("subtitle");

  const title = inCalib ? t("calibrationTitle") : t("title");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {title}
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--on-surface-variant)", minHeight: "4rem" }}>
        {subtitle}
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
          {calibPhase === "dimensions" && state.croppedPaintingUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.croppedPaintingUrl} alt="" className="w-full block" style={{ pointerEvents: "none" }} />
          )}

          {/* ── Rectangle / Konva mode — always mounted, hidden when not active ── */}
          <div style={{ display: calibPhase === "dimensions" ? "none" : perspMode ? "none" : "block" }}>
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

            {containerWidth > 0 && !inCalib && (
              <div style={{ position: "absolute", inset: 0 }}>
                <KonvaPlacement
                  ref={konvaRef}
                  wallUrl={state.wallPreviewUrl ?? ""}
                  paintingUrl={state.framedPaintingUrl ?? state.croppedPaintingUrl ?? ""}
                  containerWidth={containerWidth}
                  hidePainting={false}
                  initialRect={initialRectRef.current}
                  onTransformChange={(x, y, width, height, rotation, canvasWidth, canvasHeight) => {
                    const quad = rectToQuad(x, y, width, height, rotation);
                    setState({
                      placement: { mode: "basic", quad, rotationDeg: rotation, canvasWidth, canvasHeight },
                    });
                  }}
                />
              </div>
            )}

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
          </div>

          {/* ── Perspective warp canvas — always mounted, hidden when not active ── */}
          <div style={{ display: calibPhase !== "off" || !perspMode ? "none" : "block", position: "relative" }}>
            {state.wallPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.wallPreviewUrl} alt="" className="w-full block" style={{ pointerEvents: "none" }} />
            )}
            <canvas
              ref={perspCanvasRef}
              className="block"
              style={{ cursor: "crosshair", position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {/* Corner handle indicators */}
            {displayQuad && perspMode && (["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]).map((key) => {
              const p = displayQuad[key];
              return (
                <div
                  key={key}
                  className="absolute pointer-events-none"
                  style={{
                    left: p.x - HANDLE_SIZE / 2,
                    top: p.y - HANDLE_SIZE / 2,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    backgroundColor: "rgba(160,165,160,0.9)",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Distance input block ── */}
      {calibPhase === "distance" && (
        <div className="mb-6" style={{ borderTop: "2px solid var(--outline-variant)" }}>
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

          <div className="flex items-baseline gap-2 mb-1" onClick={() => distanceInputRef.current?.focus()} style={{ cursor: "text" }}>
            <span
              className="font-serif italic leading-none"
              style={{ fontSize: "clamp(2.5rem, 14vw, 4rem)", color: distance ? "var(--on-surface)" : "var(--outline-variant)" }}
            >
              {distance || "0.00"}
            </span>
            <span className="font-serif italic text-xl" style={{ color: "var(--on-surface-variant)" }}>
              {t(`calibration.${unit}`)}
            </span>
            <input
              ref={distanceInputRef}
              type="number" inputMode="decimal" min="0" step="any"
              value={distance} onChange={(e) => setDistance(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleDistanceConfirm(); }}
              className="absolute opacity-0 pointer-events-none" style={{ width: 1, height: 1 }} tabIndex={-1}
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
            <div className="flex-1 flex flex-col gap-1" onClick={() => widthInputRef.current?.focus()} style={{ cursor: "text" }}>
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>{t("calibration.widthLabel")}</span>
              <div className="flex items-baseline gap-1">
                <span className="font-serif italic leading-none" style={{ fontSize: "clamp(2rem, 10vw, 3rem)", color: dimWidth ? "var(--on-surface)" : "var(--outline-variant)" }}>
                  {dimWidth || "—"}
                </span>
              </div>
              <input
                ref={widthInputRef} type="number" inputMode="decimal" min="0" step="any"
                value={dimWidth} onChange={(e) => setDimWidth(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") heightInputRef.current?.focus(); }}
                className="absolute opacity-0 pointer-events-none" style={{ width: 1, height: 1 }} tabIndex={-1}
              />
            </div>

            <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "var(--outline-variant)" }} />

            <div className="flex-1 flex flex-col gap-1" onClick={() => heightInputRef.current?.focus()} style={{ cursor: "text" }}>
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>{t("calibration.heightLabel")}</span>
              <div className="flex items-baseline gap-1">
                <span className="font-serif italic leading-none" style={{ fontSize: "clamp(2rem, 10vw, 3rem)", color: dimHeight ? "var(--on-surface)" : "var(--outline-variant)" }}>
                  {dimHeight || "—"}
                </span>
              </div>
              <input
                ref={heightInputRef} type="number" inputMode="decimal" min="0" step="any"
                value={dimHeight} onChange={(e) => setDimHeight(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canApply) handleDimensionsApply(); }}
                className="absolute opacity-0 pointer-events-none" style={{ width: 1, height: 1 }} tabIndex={-1}
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

      {/* ── Normal mode buttons (always visible when not in calib) ── */}
      {!inCalib && (
        <>
          <div className="grid grid-cols-2 mb-6" style={{ gap: "1px", backgroundColor: "var(--outline-variant)" }}>
            {/* Set Exact Size — disabled in persp mode */}
            <button
              onClick={() => {
                if (perspMode) return;
                initialRectRef.current = undefined; // reset so next remount re-captures from current placement
                setCalibPhase("measure");
              }}
              className="flex flex-col items-center justify-center py-5 gap-2"
              style={{
                backgroundColor: "var(--surface-container-low)",
                opacity: perspMode ? 0.4 : 1,
                cursor: perspMode ? "default" : "pointer",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
                <path d="M2 2h4v20H2zM6 2h2v3H6zM6 8h2v3H6zM6 14h2v3H6zM6 19h2v3H6zM18 2h4v20h-4zM16 2h2v3h-2zM16 8h2v3h-2zM16 14h2v3h-2zM16 19h2v3h-2zM8 11h8v2H8z" />
              </svg>
              <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                {t("setExactSize")}
              </span>
            </button>

            {/* Adjust Corners / Reset to Rectangle toggle */}
            <button
              onClick={() => {
                if (perspMode) {
                  handleResetToRect();
                } else {
                  setPerspMode(true);
                  if (state.placement) setDisplayQuad(state.placement.quad);
                }
              }}
              className="flex flex-col items-center justify-center py-5 gap-2"
              style={{ backgroundColor: perspMode ? "var(--surface-container-high)" : "var(--surface-container-low)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
                <rect x="4" y="4" width="16" height="16" />
                <circle cx="4" cy="4" r="2" fill="currentColor" />
                <circle cx="20" cy="4" r="2" fill="currentColor" />
                <circle cx="20" cy="20" r="2" fill="currentColor" />
                <circle cx="4" cy="20" r="2" fill="currentColor" />
              </svg>
              <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                {perspMode ? t("resetToRect") : t("adjustCorners")}
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
