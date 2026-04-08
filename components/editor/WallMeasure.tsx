"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Point } from "@/lib/types";
import { euclideanDistance } from "@/lib/geometry";

type Props = {
  wallUrl: string;
  containerWidth: number;
  onComplete: (pointA: Point, pointB: Point, realDistance: number, unit: "cm" | "in", pxPerUnit: number) => void;
  onCancel: () => void;
};

const DOT_RADIUS = 8;
const LABEL_OFFSET = 14;

export default function WallMeasure({ wallUrl, containerWidth, onComplete, onCancel }: Props) {
  const t = useTranslations("placement.calibration");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [stageHeight, setStageHeight] = useState(Math.round(containerWidth * 0.75));
  const [pointA, setPointA] = useState<Point | null>(null);
  const [pointB, setPointB] = useState<Point | null>(null);
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");

  // Load wall image to get aspect ratio
  useEffect(() => {
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setStageHeight(Math.round((img.naturalHeight / img.naturalWidth) * containerWidth));
      setImgLoaded(true);
    };
    img.src = wallUrl;
  }, [wallUrl, containerWidth]);

  // Draw overlay — re-run when image loads, points change, or stageHeight changes
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw wall image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Dim overlay
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawDot = (p: Point, label: string) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.strokeStyle = "#5a7a5a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#5a7a5a";
      ctx.fill();

      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(label, p.x, p.y - LABEL_OFFSET);
    };

    if (pointA) drawDot(pointA, t("pointA"));

    if (pointA && pointB) {
      drawDot(pointB, t("pointB"));
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pointA.x, pointA.y);
      ctx.lineTo(pointB.x, pointB.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [pointA, pointB, imgLoaded, t]);

  useEffect(() => { draw(); }, [draw, stageHeight]);

  // Click uses CSS-relative coords (not canvas pixel coords) so they match Konva's coordinate space
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Map click to canvas pixel coords for drawing
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    console.log("[WallMeasure] click", {
      clientX: e.clientX, clientY: e.clientY,
      rectW: rect.width, rectH: rect.height,
      canvasW: canvas.width, canvasH: canvas.height,
      scaleX, scaleY,
      canvasX, canvasY,
    });

    if (!pointA) {
      setPointA({ x: canvasX, y: canvasY });
    } else if (!pointB) {
      setPointB({ x: canvasX, y: canvasY });
    }
  };

  const distNum = parseFloat(distance);
  const canProceed = pointA && pointB && distNum > 0;

  const handleApply = () => {
    if (!pointA || !pointB || !distNum) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Points are in canvas pixel coords — convert to CSS/display coords to match Konva's coordinate space
    const displayWidth = containerWidth;
    const displayScaleX = displayWidth / canvas.width;
    const displayScaleY = stageHeight / canvas.height;

    const displayA: Point = { x: pointA.x * displayScaleX, y: pointA.y * displayScaleY };
    const displayB: Point = { x: pointB.x * displayScaleX, y: pointB.y * displayScaleY };

    const pxDist = euclideanDistance(displayA, displayB);
    const pxPerUnit = pxDist / distNum;

    console.log("[WallMeasure] apply", {
      pointA, pointB,
      displayA, displayB,
      canvasSize: { w: canvas.width, h: canvas.height },
      displaySize: { w: displayWidth, h: stageHeight },
      displayScaleX, displayScaleY,
      pxDist,
      realDistance: distNum, unit,
      pxPerUnit,
    });

    onComplete(displayA, displayB, distNum, unit, pxPerUnit);
  };

  const handleReset = () => {
    setPointA(null);
    setPointB(null);
  };

  return (
    <div>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--on-surface)" }}>
        {t("measureTitle")}
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--on-surface-variant)" }}>
        {t("measureHint")}
      </p>

      <canvas
        ref={canvasRef}
        width={containerWidth}
        height={stageHeight}
        className="w-full cursor-crosshair rounded"
        style={{ display: "block", maxWidth: "100%" }}
        onClick={handleClick}
      />

      {pointA && pointB && (
        <button
          onClick={handleReset}
          className="text-xs underline mt-2"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Reset points
        </button>
      )}

      {pointA && pointB && (
        <div className="mt-4 flex items-end gap-2">
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
              className="w-full px-3 py-2 text-base rounded border"
              style={{
                borderColor: "var(--outline-variant)",
                backgroundColor: "var(--surface-container-low)",
                color: "var(--on-surface)",
              }}
              autoFocus
            />
          </div>
          <div className="shrink-0 flex rounded overflow-hidden border" style={{ borderColor: "var(--outline-variant)" }}>
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
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 text-xs tracking-widest uppercase"
          style={{ color: "var(--on-surface-variant)" }}
        >
          {t("cancel")}
        </button>
        <button
          onClick={handleApply}
          disabled={!canProceed}
          className="flex-1 py-3 text-xs tracking-widest uppercase font-medium rounded"
          style={{
            backgroundColor: canProceed ? "var(--primary)" : "var(--outline-variant)",
            color: canProceed ? "var(--on-primary)" : "var(--on-surface-variant)",
            opacity: canProceed ? 1 : 0.5,
          }}
        >
          {t("next")}
        </button>
      </div>
    </div>
  );
}
