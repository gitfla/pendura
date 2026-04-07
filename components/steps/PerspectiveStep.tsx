"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { Quad, Point } from "@/lib/types";
import { isQuadConvex, rectToQuad } from "@/lib/geometry";

type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

const HANDLE_SIZE = 24;
const HIT_RADIUS = 24;



export default function PerspectiveStep() {
  const t = useTranslations("perspective");
  const { state, setState, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [wallImg, setWallImg] = useState<HTMLImageElement | null>(null);
  const [paintingImg, setPaintingImg] = useState<HTMLImageElement | null>(null);

  // Display quad (in canvas coordinates)
  const [displayQuad, setDisplayQuad] = useState<Quad | null>(null);
  const draggingRef = useRef<{ key: HandleKey; offsetX: number; offsetY: number } | null>(null);

  const stageHeight = wallImg && containerWidth > 0
    ? Math.round((wallImg.naturalHeight / wallImg.naturalWidth) * containerWidth)
    : Math.round(containerWidth * 0.75);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!state.wallPreviewUrl) return;
    const img = new Image();
    img.onload = () => setWallImg(img);
    img.src = state.wallPreviewUrl;
  }, [state.wallPreviewUrl]);

  useEffect(() => {
    if (!state.croppedPaintingUrl) return;
    const img = new Image();
    img.onload = () => setPaintingImg(img);
    img.src = state.croppedPaintingUrl;
  }, [state.croppedPaintingUrl]);

  // Init display quad from placement state
  // Quad is stored in canvas display coords — use directly
  useEffect(() => {
    if (!state.placement || !containerWidth || !wallImg) return;
    setDisplayQuad(state.placement.quad);
  }, [state.placement, containerWidth, wallImg]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wallImg || !containerWidth) return;
    canvas.width = containerWidth;
    canvas.height = stageHeight;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, containerWidth, stageHeight);
    ctx.drawImage(wallImg, 0, 0, containerWidth, stageHeight);

    if (!displayQuad) return;

    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = displayQuad;

    // Draw painting preview (simple polygon overlay)
    if (paintingImg) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.clip();
      // Approximate: draw painting image in bounding box (true warp is done server-side)
      const minX = Math.min(tl.x, tr.x, br.x, bl.x);
      const minY = Math.min(tl.y, tr.y, br.y, bl.y);
      const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
      const maxY = Math.max(tl.y, tr.y, br.y, bl.y);
      ctx.drawImage(paintingImg, minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
    }

    // Draw quad outline
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [wallImg, paintingImg, displayQuad, containerWidth, stageHeight]);

  const getPointerPos = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (pos: Point): HandleKey | null => {
    if (!displayQuad) return null;
    for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]) {
      const p = displayQuad[key];
      if (Math.abs(pos.x - p.x) <= HIT_RADIUS && Math.abs(pos.y - p.y) <= HIT_RADIUS) {
        return key;
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    const key = hitTest(pos);
    if (!key || !displayQuad) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = {
      key,
      offsetX: pos.x - displayQuad[key].x,
      offsetY: pos.y - displayQuad[key].y,
    };
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !displayQuad) return;
    const pos = getPointerPos(e);
    const { key, offsetX, offsetY } = draggingRef.current;
    const newQuad = {
      ...displayQuad,
      [key]: {
        x: Math.max(0, Math.min(containerWidth, pos.x - offsetX)),
        y: Math.max(0, Math.min(stageHeight, pos.y - offsetY)),
      },
    };
    if (isQuadConvex(newQuad)) {
      setDisplayQuad(newQuad);
    }
  }, [displayQuad, containerWidth, stageHeight]);

  const onPointerUp = () => {
    if (!displayQuad) return;
    draggingRef.current = null;
    // Store quad in canvas display coords (RenderStep scales to natural coords)
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

  const handleReset = () => {
    if (!state.placement || !wallImg) return;
    // Reconstruct the original rectangle from the quad's bounding box + stored rotation
    const q = state.placement.quad;
    const xs = [q.topLeft.x, q.topRight.x, q.bottomRight.x, q.bottomLeft.x];
    const ys = [q.topLeft.y, q.topRight.y, q.bottomRight.y, q.bottomLeft.y];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const rectQuad = rectToQuad(minX, minY, maxX - minX, maxY - minY, state.placement.rotationDeg);
    setDisplayQuad(rectQuad);
    setState({
      placement: {
        ...state.placement,
        mode: "perspective",
        quad: rectQuad,
      },
    });
  };

  const handleContinue = () => {
    goToStep("render");
  };

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "var(--on-surface-variant)" }}>
        {t("step")}
      </p>
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      <div ref={containerRef} className="w-full mb-6 relative" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          className="w-full block"
          style={{ cursor: "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {/* Corner handle indicators */}
        {displayQuad &&
          (["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]).map((key) => {
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
                  border: "2px solid white",
                  backgroundColor: "var(--primary)",
                  opacity: 0.85,
                }}
              />
            );
          })}
      </div>

      <button
        onClick={goPrev}
        className="w-full py-3 text-xs tracking-widest uppercase mb-3 flex items-center justify-center gap-2"
        style={{ color: "var(--on-surface-variant)" }}
      >
        <span>←</span>
        <span>{t("previousButton")}</span>
      </button>

      <button
        onClick={handleReset}
        className="w-full py-3 text-xs tracking-widest uppercase mb-3 flex items-center justify-center gap-2"
        style={{ border: "1px solid var(--outline-variant)", color: "var(--on-surface-variant)" }}
      >
        {t("resetButton")}
      </button>

      <button
        onClick={handleContinue}
        className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6"
        style={{
          background: `linear-gradient(to right, var(--primary), var(--primary-dim))`,
          color: "var(--on-primary)",
        }}
      >
        <span>{t("continueButton")}</span>
        <span>→</span>
      </button>
    </div>
  );
}
