"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { euclideanDistance, computeHomography, screenPointToWallUV, projectArtworkOnWall } from "@/lib/geometry";
import { Point, Quad, FrameStyle, GeometryType, InteractionMode, WallPlane } from "@/lib/types";
import { applyFrame } from "@/lib/frameRenderer";
import dynamic from "next/dynamic";
import type { PlacementCanvasHandle, WallConstraint } from "@/components/editor/PlacementCanvas";
import CalibrationOverlay from "@/components/editor/CalibrationOverlay";
import WallPolygonOverlay, { type WallPolygonPoints } from "@/components/editor/WallPolygonOverlay";

const PlacementCanvas = dynamic(() => import("@/components/editor/PlacementCanvas"), {
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

type CalibrationPhase = "off" | "measure" | "distance" | "dimensions" | "wallDefine";

export default function PlacementStep() {
  const t = useTranslations("placement");
  const { state, setState, updatePlacement, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<PlacementCanvasHandle>(null);

  // initialRect for PlacementCanvas — baked at calibration apply time, stable ref
  const initialRectRef = useRef<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
  // Mutable ref for wall units during drag — avoids stale closure in onWallScale
  const wallUnitsRef = useRef<{ w: number; h: number; u: number; v: number } | null>(null);

  const distanceInputRef = useRef<HTMLInputElement>(null);
  const widthInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [photoHeight, setPhotoHeight] = useState(0);
  const [calibPhase, setCalibPhase] = useState<CalibrationPhase>("off");
  const [perspMode, setPerspMode] = useState(false);
  const [geometryType, setGeometryType] = useState<GeometryType>(
    state.placement?.geometryType ?? GeometryType.Rect
  );

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

  // Wall polygon definition
  const [wallPoints, setWallPoints] = useState<WallPolygonPoints | null>(null);
  const [wallPlacedCount, setWallPlacedCount] = useState(0);

  // Frame style
  const [frameStyle, setFrameStyle] = useState<FrameStyle>(state.frameStyle ?? "none");

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

  // ── Calibration ────────────────────────────────────────────────────────────

  const overlayHeight = photoHeight || Math.round(containerWidth * 0.75);

  const handleUnitChange = (u: "cm" | "in") => {
    setUnit(u);
    localStorage.setItem(STORAGE_KEY, u);
  };

  const handlePhotoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Wall define: tap to place corners one by one
    if (calibPhase === "wallDefine" && wallPlacedCount < 4) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * containerWidth;
      const y = ((e.clientY - rect.top) / rect.height) * overlayHeight;
      const next = wallPlacedCount + 1;
      setWallPlacedCount(next);
      // Build default spread if starting fresh, then fill in tapped corners in order
      if (next === 1) {
        setWallPoints({ tl: { x, y }, tr: { x: x + 60, y }, br: { x: x + 60, y: y + 40 }, bl: { x, y: y + 40 } });
      } else if (wallPoints) {
        const keys = ["tl", "tr", "br", "bl"] as const;
        setWallPoints({ ...wallPoints, [keys[wallPlacedCount]]: { x, y } });
      }
      return;
    }
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

    // Bake the new size (centered around current painting position) into initialRectRef.
    // PlacementCanvas will use this on next mount (after calib unmounts and remounts it).
    if (state.placement) {
      const q = state.placement.quad;
      const xs = [q.topLeft.x, q.topRight.x, q.bottomRight.x, q.bottomLeft.x];
      const ys = [q.topLeft.y, q.topRight.y, q.bottomRight.y, q.bottomLeft.y];
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      initialRectRef.current = { x: cx - newW / 2, y: cy - newH / 2, width: newW, height: newH };
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

  // ── Wall define ─────────────────────────────────────────────────────────────

  const handleWallDefineStart = () => {
    // Default polygon: inset rectangle covering ~60% of the canvas
    const margin = 0.2;
    setWallPoints({
      tl: { x: containerWidth * margin,            y: overlayHeight * margin },
      tr: { x: containerWidth * (1 - margin),      y: overlayHeight * margin },
      br: { x: containerWidth * (1 - margin),      y: overlayHeight * (1 - margin) },
      bl: { x: containerWidth * margin,            y: overlayHeight * (1 - margin) },
    });
    setWallPlacedCount(4);
    setCalibPhase("wallDefine");
  };

  const handleWallDefineConfirm = () => {
    if (!wallPoints) return;
    // Sort corners geometrically so the homography is correct regardless of how the user
    // dragged the handles. Strategy: centroid-relative angle sort, then assign TL/TR/BR/BL.
    const rawCorners = [wallPoints.tl, wallPoints.tr, wallPoints.br, wallPoints.bl];
    const cx = rawCorners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = rawCorners.reduce((s, p) => s + p.y, 0) / 4;
    // Sort by angle from centroid: top-left ≈ 225°, top-right ≈ 315°, bottom-right ≈ 45°, bottom-left ≈ 135°
    const sorted = [...rawCorners].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    // atan2 order (CCW from right): right, top-right, top, top-left, left, bottom-left, bottom, bottom-right
    // After sort ascending by angle: right-ish (~0°) first. We want TL, TR, BR, BL order.
    // Simpler: split into top-half and bottom-half by y relative to centroid.
    const top    = rawCorners.filter(p => p.y <= cy).sort((a, b) => a.x - b.x); // left→right
    const bottom = rawCorners.filter(p => p.y >  cy).sort((a, b) => a.x - b.x); // left→right
    // Fallback: if all 4 on same side of centroid (degenerate), use raw order
    const tl = top[0]    ?? sorted[0];
    const tr = top[1]    ?? sorted[1];
    const br = bottom[1] ?? sorted[2];
    const bl = bottom[0] ?? sorted[3];
    const polygon: [Point, Point, Point, Point] = [tl, tr, br, bl];
    // Validate homography is computable (non-degenerate polygon)
    try {
      const uvCorners: [Point, Point, Point, Point] = [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
      ];
      computeHomography(uvCorners, polygon);
    } catch {
      return; // degenerate polygon, don't save
    }
    const wallPlane: WallPlane = {
      id: crypto.randomUUID?.() ?? `wall-${Date.now()}`,
      polygon,
    };

    setState({ wallPlane });
    setCalibPhase("off");
    // Auto-attach immediately after wall is defined — pass wallPlane directly since state hasn't updated yet
    handleWallAttach(wallPlane);
  };

  const handleWallDefineCancel = () => {
    setWallPoints(null);
    setWallPlacedCount(0);
    setCalibPhase("off");
  };

  // ── Wall attach (4B) ────────────────────────────────────────────────────────

  const handleWallAttach = (wallPlaneOverride?: WallPlane) => {
    wallUnitsRef.current = null; // reset so onWallScale re-initialises from fresh state
    const wallPlane = wallPlaneOverride ?? state.wallPlane;
    const placement = state.placement;
    if (!wallPlane || !placement) return;

    // If already wall-attached, re-project using stored planeCenter + wall units (fully idempotent)
    if (geometryType === GeometryType.WallAttachedQuad && placement.widthWallUnits != null && placement.heightWallUnits != null && placement.planeCenter != null) {
      const { widthWallUnits, heightWallUnits, planeCenter } = placement;
      const newQuad = projectArtworkOnWall(wallPlane, planeCenter, widthWallUnits, heightWallUnits);
      setGeometryType(GeometryType.WallAttachedQuad);
      canvasRef.current?.setQuad(newQuad);
      return;
    }

    // First attach: use painting's canvas pixel dimensions for aspect ratio (not the screen quad,
    // which may be warped after corner editing). Fall back to 1:1 if unavailable.
    const { canvasWidth = 1, canvasHeight = 1 } = placement;
    const paintingAspect = canvasHeight > 0 ? canvasWidth / canvasHeight : 1;

    const widthWallUnits  = 0.25;
    const heightWallUnits = 0.25 / paintingAspect;

    // Always center on wall on first attach — painting is rarely over the wall already
    const clampedCenter = { u: 0.5, v: 0.5 };

    // Project artwork onto wall plane
    const newQuad = projectArtworkOnWall(wallPlane, clampedCenter, widthWallUnits, heightWallUnits);

    // Derive real dimensions if wall is already calibrated
    const cal = wallPlane.calibration;
    const realWidth  = cal ? widthWallUnits  * cal.cmPerWallUnit : undefined;
    const realHeight = cal ? heightWallUnits * cal.cmPerWallUnit : undefined;

    const newPlacement = {
      ...placement,
      quad: newQuad,
      geometryType: GeometryType.WallAttachedQuad,
      surfaceAttachment: wallPlane.id,
      planeCenter: clampedCenter,
      widthWallUnits,
      heightWallUnits,
      realWidth,
      realHeight,
    };

    setGeometryType(GeometryType.WallAttachedQuad);
    setState({ placement: newPlacement });
    canvasRef.current?.setQuad(newQuad);
  };

  const handleResetToRect = () => {
    const placement = state.placement;
    if (!placement) return;
    const q = placement.quad;
    const xs = [q.topLeft.x, q.topRight.x, q.bottomRight.x, q.bottomLeft.x];
    const ys = [q.topLeft.y, q.topRight.y, q.bottomRight.y, q.bottomLeft.y];
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rectQuad: Quad = {
      topLeft:     { x: minX, y: minY },
      topRight:    { x: maxX, y: minY },
      bottomRight: { x: maxX, y: maxY },
      bottomLeft:  { x: minX, y: maxY },
    };
    setGeometryType(GeometryType.Rect);
    updatePlacement({
      quad: rectQuad,
      geometryType: GeometryType.Rect,
      surfaceAttachment: null,
      planeCenter: undefined,
      widthWallUnits: undefined,
      heightWallUnits: undefined,
    });
    canvasRef.current?.setQuad(rectQuad);
  };

  const distNum = parseFloat(distance);
  const canConfirm = pointA && pointB && distNum > 0;
  const dimW = parseFloat(dimWidth);
  const dimH = parseFloat(dimHeight);
  const canApply = dimW > 0 && dimH > 0;

  const inCalib = calibPhase !== "off";
  const inWallDefine = calibPhase === "wallDefine";

  // ── Subtitle ───────────────────────────────────────────────────────────────

  const subtitle = inWallDefine
    ? t("wallDefine.instruction")
    : inCalib
    ? (calibPhase === "measure" ? t("calibration.instruction") : "")
    : perspMode
    ? t("perspSubtitle")
    : t("subtitle");

  const title = inWallDefine
    ? t("wallDefine.title")
    : inCalib
    ? t("calibrationTitle")
    : t("title");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {title}
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--on-surface-variant)", minHeight: "4rem" }}>
        {subtitle}
      </p>

      {/* Canvas area */}
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
          {/* Dimensions phase: show painting photo for reference */}
          {calibPhase === "dimensions" && state.croppedPaintingUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.croppedPaintingUrl} alt="" className="w-full block" style={{ pointerEvents: "none" }} />
          )}

          {/* PlacementCanvas — hidden during calibration */}
          {calibPhase !== "dimensions" && (
            <div style={{ display: inCalib ? "none" : "block" }}>
              {/* Wall image drives container height and calibration overlay positioning */}
              {state.wallPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.wallPreviewUrl}
                  alt=""
                  className="w-full block"
                  style={{ pointerEvents: "none", visibility: inCalib ? "visible" : "hidden", position: inCalib ? "relative" : "absolute" }}
                  onLoad={(e) => setPhotoHeight((e.target as HTMLImageElement).offsetHeight)}
                />
              )}
              {containerWidth > 0 && (
                <div style={{ position: inCalib ? "absolute" : "relative", inset: inCalib ? 0 : "auto" }}>
                  <PlacementCanvas
                    ref={canvasRef}
                    wallUrl={state.wallPreviewUrl ?? ""}
                    paintingUrl={state.framedPaintingUrl ?? state.croppedPaintingUrl ?? ""}
                    containerWidth={containerWidth}
                    initialRect={initialRectRef.current}
                    wallConstraint={(() => {
                      const p = state.placement;
                      if (
                        geometryType === GeometryType.WallAttachedQuad &&
                        state.wallPlane &&
                        p?.widthWallUnits != null &&
                        p?.heightWallUnits != null
                      ) {
                        return {
                          wallPlane: state.wallPlane,
                          widthWallUnits: p.widthWallUnits,
                          heightWallUnits: p.heightWallUnits,
                        } satisfies WallConstraint;
                      }
                      return undefined;
                    })()}
                    onTransformChange={(quad: Quad, canvasWidth: number, canvasHeight: number) => {
                      // Use updatePlacement (functional updater) to avoid stale-closure overwriting
                      // wall-plane fields (widthWallUnits, heightWallUnits, etc.) set by handleWallAttach.
                      // When wall-attached, also update planeCenter from the new quad centroid.
                      if (geometryType === GeometryType.WallAttachedQuad && state.wallPlane) {
                        const cx = (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4;
                        const cy = (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4;
                        updatePlacement({
                          quad, canvasWidth, canvasHeight, geometryType,
                          planeCenter: screenPointToWallUV(state.wallPlane, { x: cx, y: cy }),
                        });
                      } else {
                        updatePlacement({ quad, canvasWidth, canvasHeight, geometryType });
                      }
                    }}
                    onWallDetach={() => {
                      wallUnitsRef.current = null;
                      setGeometryType(GeometryType.FreeQuad);
                      updatePlacement({ geometryType: GeometryType.FreeQuad, surfaceAttachment: null, planeCenter: undefined, widthWallUnits: undefined, heightWallUnits: undefined });
                    }}
                    onWallScale={(factor, axis) => {
                      const wallPlane = state.wallPlane;
                      if (!wallPlane) return;
                      // Initialise ref from state on first call of a drag gesture
                      const p = state.placement;
                      if (!wallUnitsRef.current) {
                        if (!p?.widthWallUnits || !p?.heightWallUnits || !p?.planeCenter) return;
                        wallUnitsRef.current = { w: p.widthWallUnits, h: p.heightWallUnits, u: p.planeCenter.u, v: p.planeCenter.v };
                      }
                      const cur = wallUnitsRef.current;
                      const newW = axis === "height" ? cur.w : cur.w * factor;
                      const newH = axis === "width"  ? cur.h : cur.h * factor;
                      const halfW = newW / 2;
                      const halfH = newH / 2;
                      const clampedU = Math.max(halfW, Math.min(1 - halfW, cur.u));
                      const clampedV = Math.max(halfH, Math.min(1 - halfH, cur.v));
                      wallUnitsRef.current = { w: newW, h: newH, u: clampedU, v: clampedV };
                      const planeCenter = { u: clampedU, v: clampedV };
                      const newQuad = projectArtworkOnWall(wallPlane, planeCenter, newW, newH);
                      canvasRef.current?.setQuad(newQuad);
                      updatePlacement({ quad: newQuad, widthWallUnits: newW, heightWallUnits: newH, planeCenter });
                    }}
                    onModeChange={(m) => {
                      const isPersp = m === InteractionMode.Perspective;
                      setPerspMode(isPersp);
                      if (!isPersp && geometryType === GeometryType.Rect) {
                        setGeometryType(GeometryType.FreeQuad);
                        if (state.placement) {
                          setState({
                            placement: { ...state.placement, geometryType: GeometryType.FreeQuad },
                          });
                        }
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Wall define overlay */}
          {inWallDefine && containerWidth > 0 && (
            <>
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
              <WallPolygonOverlay
                points={wallPlacedCount >= 4 ? wallPoints : null}
                placedCount={wallPlacedCount}
                containerWidth={containerWidth}
                stageHeight={overlayHeight}
                onChange={setWallPoints}
              />
            </>
          )}

          {/* Calibration measure/distance overlay */}
          {(calibPhase === "measure" || calibPhase === "distance") && (
            <>
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
              {containerWidth > 0 && (
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

      {/* ── Normal mode buttons ── */}
      {!inCalib && (
        <>
          <div className="grid grid-cols-2 mb-6" style={{ gap: "1px", backgroundColor: "var(--outline-variant)" }}>
            {/* Set Exact Size — disabled in perspective mode or freeQuad */}
            <button
              onClick={() => {
                if (perspMode || geometryType === GeometryType.FreeQuad) return;
                initialRectRef.current = undefined;
                setCalibPhase("measure");
              }}
              className="flex flex-col items-center justify-center py-5 gap-2"
              style={{
                backgroundColor: "var(--surface-container-low)",
                opacity: perspMode || geometryType === GeometryType.FreeQuad ? 0.4 : 1,
                cursor: perspMode || geometryType === GeometryType.FreeQuad ? "default" : "pointer",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
                <path d="M2 2h4v20H2zM6 2h2v3H6zM6 8h2v3H6zM6 14h2v3H6zM6 19h2v3H6zM18 2h4v20h-4zM16 2h2v3h-2zM16 8h2v3h-2zM16 14h2v3h-2zM16 19h2v3h-2zM8 11h8v2H8z" />
              </svg>
              <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                {t("setExactSize")}
              </span>
            </button>

            {/* Adjust Corners / Done toggle */}
            <button
              onClick={() => {
                if (perspMode) {
                  canvasRef.current?.exitPerspectiveMode();
                } else {
                  canvasRef.current?.enterPerspectiveMode();
                }
              }}
              className="flex flex-col items-center justify-center py-5 gap-2 relative"
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
              {geometryType === GeometryType.WallAttachedQuad && (
                <span
                  className="absolute top-2 right-2 text-[9px] tracking-widest uppercase"
                  style={{ color: "var(--on-surface-variant)", opacity: 0.6 }}
                >
                  {t("wallAttached")}
                </span>
              )}
            </button>
          </div>

          {/* Match wall / Attach to wall — only shown in corner edit mode */}
          {perspMode && (
            <div className="mb-6" style={{ borderTop: "1px solid var(--outline-variant)" }}>
              {/* Define / redefine wall polygon */}
              <button
                onClick={handleWallDefineStart}
                className="w-full flex flex-col items-center justify-center py-4 gap-2"
                style={{ backgroundColor: state.wallPlane ? "var(--surface-container-high)" : "var(--surface-container-low)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
                  <polygon points="3,18 8,6 16,8 21,18" />
                </svg>
                <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                  {state.wallPlane ? t("wallDefine.redefine") : t("wallDefine.matchWall")}
                </span>
              </button>

              {/* Attach artwork to defined wall — only when wall exists */}
              {state.wallPlane && (
                <button
                  onClick={() => handleWallAttach()}
                  className="w-full flex flex-col items-center justify-center py-4 gap-2"
                  style={{ backgroundColor: "var(--surface-container-low)", borderTop: "1px solid var(--outline-variant)" }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
                    <rect x="4" y="4" width="16" height="16" />
                    <path d="M4 4 L8 8 M20 4 L16 8 M20 20 L16 16 M4 20 L8 16" />
                  </svg>
                  <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
                    {t("wallDefine.reattachToWall")}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Reset to rectangle — shown when quad is warped or wall-attached */}
          {geometryType !== GeometryType.Rect && !perspMode && (
            <button
              onClick={handleResetToRect}
              className="w-full flex items-center justify-center gap-2 py-3 mb-4 text-xs tracking-widest uppercase"
              style={{ color: "var(--on-surface-variant)", borderTop: "1px solid var(--outline-variant)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="1" />
              </svg>
              {t("resetToRect")}
            </button>
          )}

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
            style={{ background: `linear-gradient(to right, var(--primary), var(--primary-dim))`, color: "var(--on-primary)" }}
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

      {/* ── Wall define action buttons ── */}
      {inWallDefine && (
        <>
          <button
            onClick={handleWallDefineConfirm}
            disabled={!wallPoints}
            className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 mb-3"
            style={{
              background: wallPoints ? `linear-gradient(to right, var(--primary), var(--primary-dim))` : "var(--outline-variant)",
              color: wallPoints ? "var(--on-primary)" : "var(--on-surface-variant)",
            }}
          >
            <span>{t("wallDefine.confirm")}</span>
            <span>→</span>
          </button>
          <button
            onClick={handleWallDefineCancel}
            className="w-full py-3 text-xs tracking-widest uppercase flex items-center gap-2 px-6"
            style={{ color: "var(--on-surface-variant)" }}
          >
            <span>←</span>
            <span>{t("wallDefine.cancel")}</span>
          </button>
        </>
      )}

      {/* ── Calibration action buttons ── */}
      {inCalib && !inWallDefine && (
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
