"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { Quad, Point } from "@/lib/types";
import { isQuadConvex, rectToQuad } from "@/lib/geometry";
import { clientPerspectiveWarp } from "@/lib/clientWarp";

type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

const HANDLE_SIZE = 12;
const HIT_RADIUS = 24;

export default function PerspectiveStep() {
  const t = useTranslations("perspective");
  const { state, setState, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [wallImg, setWallImg] = useState<HTMLImageElement | null>(null);
  const [paintingImg, setPaintingImg] = useState<HTMLImageElement | null>(null);
  const [paintingData, setPaintingData] = useState<ImageData | null>(null);

  // Display quad (in canvas coordinates)
  const [displayQuad, setDisplayQuad] = useState<Quad | null>(null);
  const draggingRef = useRef<{ key: HandleKey; offsetX: number; offsetY: number } | null>(null);
  const rafRef = useRef<number>(0);

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
    const src = state.framedPaintingUrl ?? state.croppedPaintingUrl;
    if (!src) return;
    const img = new Image();
    img.onload = () => setPaintingImg(img);
    img.src = src;
  }, [state.framedPaintingUrl, state.croppedPaintingUrl]);

  // Extract painting ImageData once when painting loads — reused on every drag frame
  useEffect(() => {
    if (!paintingImg) return;
    const oc = document.createElement("canvas");
    oc.width = paintingImg.naturalWidth;
    oc.height = paintingImg.naturalHeight;
    oc.getContext("2d")!.drawImage(paintingImg, 0, 0);
    setPaintingData(oc.getContext("2d")!.getImageData(0, 0, oc.width, oc.height));
  }, [paintingImg]);

  // Init display quad from placement state
  useEffect(() => {
    if (!state.placement || !containerWidth || !wallImg) return;
    setDisplayQuad(state.placement.quad);
  }, [state.placement, containerWidth, wallImg]);

  // Draw on canvas — true perspective warp
  useEffect(() => {
    const canvas = canvasRef.current;
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

    // True perspective warp — bbox-sized ImageData drawn via offscreen canvas
    // so ctx.scale(dpr) applies correctly (putImageData ignores transforms)
    if (paintingData) {
      const { imageData, x, y } = clientPerspectiveWarp(
        paintingData,
        displayQuad,
        containerWidth,
        stageHeight,
      );
      const oc = document.createElement("canvas");
      oc.width = imageData.width;
      oc.height = imageData.height;
      oc.getContext("2d")!.putImageData(imageData, 0, 0);
      ctx.drawImage(oc, x, y);
    }

    // Draw quad outline on top
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.strokeStyle = "rgba(160,165,160,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [wallImg, paintingData, displayQuad, containerWidth, stageHeight]);

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
    e.preventDefault();
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
      // RAF throttle: skip frames if warp hasn't finished yet
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setDisplayQuad(newQuad);
      });
    }
  }, [displayQuad, containerWidth, stageHeight]);

  const onPointerUp = () => {
    if (!displayQuad) return;
    cancelAnimationFrame(rafRef.current);
    draggingRef.current = null;
    setState({
      placement: {
        quad: displayQuad,
        canvasWidth: containerWidth,
        canvasHeight: stageHeight,
      },
    });
  };

  const handleReset = () => {
    if (!state.placement || !wallImg) return;
    const q = state.placement.quad;
    const xs = [q.topLeft.x, q.topRight.x, q.bottomRight.x, q.bottomLeft.x];
    const ys = [q.topLeft.y, q.topRight.y, q.bottomRight.y, q.bottomLeft.y];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const rectQuad = rectToQuad(minX, minY, maxX - minX, maxY - minY, 0);
    setDisplayQuad(rectQuad);
    setState({
      placement: {
        ...state.placement,
        quad: rectQuad,
      },
    });
  };

  const handleContinue = () => {
    goToStep("render");
  };

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      <div
        ref={containerRef}
        className="w-full mb-6 relative"
        style={{ padding: 10, backgroundColor: "#fff", boxShadow: "0 4px 32px rgba(46,52,48,0.08)", touchAction: "none" }}
      >
        {state.wallPreviewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.wallPreviewUrl}
            alt=""
            className="w-full block"
            style={{ pointerEvents: "none" }}
          />
        )}
        <canvas
          ref={canvasRef}
          className="block"
          style={{ cursor: "crosshair", position: "absolute", inset: 10, width: "calc(100% - 20px)", height: "calc(100% - 20px)" }}
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
                  left: p.x - HANDLE_SIZE / 2 + 10,
                  top: p.y - HANDLE_SIZE / 2 + 10,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  backgroundColor: "rgba(160,165,160,0.9)",
                }}
              />
            );
          })}
      </div>

      <button
        onClick={handleContinue}
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
        onClick={() => goPrev()}
        className="w-full py-3 text-xs tracking-widest uppercase flex items-center gap-2 px-6"
        style={{ color: "var(--on-surface-variant)" }}
      >
        <span>←</span>
        <span>{t("resetButton")}</span>
      </button>
    </div>
  );
}
