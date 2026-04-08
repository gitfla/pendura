"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { cropImageToBlob } from "@/lib/image";
import { perspectiveCropToBlob } from "@/lib/perspectiveCrop";
import { isQuadConvex } from "@/lib/geometry";
import type { Quad, Point } from "@/lib/types";

type CropBox = { x: number; y: number; w: number; h: number };
type Handle = "tl" | "tc" | "tr" | "ml" | "mr" | "bl" | "bc" | "br" | "move";
type CropMode = "rectangle" | "perspective";
type CornerKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

const MIN_SIZE = 40;
const CORNER_HANDLE_SIZE = 24;
// Hit radius for pointer interactions — larger than visual handle for easier grabbing
const RECT_HIT_RADIUS = 20;
const CORNER_HIT_RADIUS = 24;

function getCursor(handle: Handle): string {
  switch (handle) {
    case "tl": case "br": return "nwse-resize";
    case "tr": case "bl": return "nesw-resize";
    case "tc": case "bc": return "ns-resize";
    case "ml": case "mr": return "ew-resize";
    case "move": return "move";
  }
}

function bakeRotation(img: HTMLImageElement, deg: number): Promise<HTMLImageElement> {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const newW = Math.round(w * cos + h * sin);
  const newH = Math.round(w * sin + h * cos);
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob!);
      const rotated = new Image();
      rotated.onload = () => resolve(rotated);
      rotated.src = url;
    }, "image/jpeg", 0.92);
  });
}

export default function CropStep() {
  const t = useTranslations("crop");
  const { state, setState, goNext, goPrev } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // Mode toggle
  const [cropMode, setCropMode] = useState<CropMode>("rectangle");

  // Rectangle mode state
  const [crop, setCrop] = useState<CropBox>({ x: 24, y: 24, w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; startCrop: CropBox } | null>(null);

  // Perspective mode state
  const [perspQuad, setPerspQuad] = useState<Quad | null>(null);
  const cornerDragRef = useRef<{ key: CornerKey; offsetX: number; offsetY: number } | null>(null);

  const initCropBox = useCallback(() => {
    if (!imgRef.current) return;
    const w = imgRef.current.offsetWidth;
    const h = imgRef.current.offsetHeight;
    setDisplaySize({ w, h });
    const pad = 24;
    setCrop({ x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 });
  }, []);

  const initPerspQuad = useCallback(() => {
    if (!imgRef.current) return;
    const w = imgRef.current.offsetWidth;
    const h = imgRef.current.offsetHeight;
    const pad = 24;
    setPerspQuad({
      topLeft:     { x: pad, y: pad },
      topRight:    { x: w - pad, y: pad },
      bottomRight: { x: w - pad, y: h - pad },
      bottomLeft:  { x: pad, y: h - pad },
    });
  }, []);

  useEffect(() => {
    if (imgLoaded) {
      initCropBox();
      initPerspQuad();
    }
  }, [imgLoaded, initCropBox, initPerspQuad]);

  const clamp = useCallback((c: CropBox, dw: number, dh: number): CropBox => {
    let { x, y, w, h } = c;
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
    x = Math.max(0, Math.min(x, dw - w));
    y = Math.max(0, Math.min(y, dh - h));
    if (x + w > dw) w = dw - x;
    if (y + h > dh) h = dh - y;
    return { x, y, w, h };
  }, []);

  // --- Rectangle mode handlers ---
  const onRectPointerDown = (e: React.PointerEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  };

  const onRectPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { handle, startX, startY, startCrop } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let { x, y, w, h } = startCrop;
    switch (handle) {
      case "move": x += dx; y += dy; break;
      case "tl": x += dx; y += dy; w -= dx; h -= dy; break;
      case "tc": y += dy; h -= dy; break;
      case "tr": y += dy; w += dx; h -= dy; break;
      case "ml": x += dx; w -= dx; break;
      case "mr": w += dx; break;
      case "bl": x += dx; w -= dx; h += dy; break;
      case "bc": h += dy; break;
      case "br": w += dx; h += dy; break;
    }
    setCrop(clamp({ x, y, w, h }, displaySize.w, displaySize.h));
  }, [displaySize, clamp]);

  const onRectPointerUp = () => { dragRef.current = null; };

  // --- Perspective mode handlers ---
  const getPointerPos = (e: React.PointerEvent): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTestCorner = (pos: Point): CornerKey | null => {
    if (!perspQuad) return null;
    for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as CornerKey[]) {
      const p = perspQuad[key];
      if (Math.abs(pos.x - p.x) <= CORNER_HIT_RADIUS && Math.abs(pos.y - p.y) <= CORNER_HIT_RADIUS) {
        return key;
      }
    }
    return null;
  };

  const onPerspPointerDown = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    const key = hitTestCorner(pos);
    if (!key || !perspQuad) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    cornerDragRef.current = {
      key,
      offsetX: pos.x - perspQuad[key].x,
      offsetY: pos.y - perspQuad[key].y,
    };
  };

  const onPerspPointerMove = useCallback((e: React.PointerEvent) => {
    if (!cornerDragRef.current || !perspQuad) return;
    const pos = getPointerPos(e);
    const { key, offsetX, offsetY } = cornerDragRef.current;
    const newQuad = {
      ...perspQuad,
      [key]: {
        x: Math.max(0, Math.min(displaySize.w, pos.x - offsetX)),
        y: Math.max(0, Math.min(displaySize.h, pos.y - offsetY)),
      },
    };
    if (isQuadConvex(newQuad)) {
      setPerspQuad(newQuad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspQuad, displaySize]);

  const onPerspPointerUp = () => { cornerDragRef.current = null; };

  // --- Mode switching ---
  const switchMode = (mode: CropMode) => {
    if (mode === cropMode) return;
    if (mode === "perspective") {
      setRotation(0);
      if (!perspQuad) initPerspQuad();
    }
    setCropMode(mode);
  };

  // --- Confirm ---
  const handleConfirm = async () => {
    if (!imgRef.current) return;

    let blob: Blob;

    if (cropMode === "perspective" && perspQuad) {
      blob = await perspectiveCropToBlob(
        imgRef.current,
        perspQuad,
        displaySize.w,
        displaySize.h,
      );
    } else {
      let sourceImg = imgRef.current;
      let tempUrl: string | null = null;

      if (rotation !== 0) {
        sourceImg = await bakeRotation(imgRef.current, rotation);
        tempUrl = sourceImg.src;
      }

      blob = await cropImageToBlob(
        sourceImg,
        crop.x, crop.y, crop.w, crop.h,
        sourceImg.naturalWidth, sourceImg.naturalHeight,
        displaySize.w, displaySize.h,
      );

      if (tempUrl) URL.revokeObjectURL(tempUrl);
    }

    if (state.croppedPaintingUrl) URL.revokeObjectURL(state.croppedPaintingUrl);

    const url = URL.createObjectURL(blob);
    setState({ croppedPaintingBlob: blob, croppedPaintingUrl: url, cropRect: { x: crop.x, y: crop.y, width: crop.w, height: crop.h } });
    goNext();
  };

  // --- Rectangle handles ---
  const HANDLE_SIZE = 12;
  const hs = HANDLE_SIZE / 2;
  const handles: { id: Handle; cx: number; cy: number }[] = imgLoaded ? [
    { id: "tl", cx: crop.x,              cy: crop.y },
    { id: "tc", cx: crop.x + crop.w / 2, cy: crop.y },
    { id: "tr", cx: crop.x + crop.w,     cy: crop.y },
    { id: "ml", cx: crop.x,              cy: crop.y + crop.h / 2 },
    { id: "mr", cx: crop.x + crop.w,     cy: crop.y + crop.h / 2 },
    { id: "bl", cx: crop.x,              cy: crop.y + crop.h },
    { id: "bc", cx: crop.x + crop.w / 2, cy: crop.y + crop.h },
    { id: "br", cx: crop.x + crop.w,     cy: crop.y + crop.h },
  ] : [];

  const isRect = cropMode === "rectangle";
  const isPersp = cropMode === "perspective";

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-2" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      {/* Crop canvas */}
      <div
        ref={containerRef}
        className="relative w-full mb-4 select-none overflow-hidden"
        style={{ touchAction: "none", backgroundColor: "var(--surface-container)" }}
        onPointerMove={isRect ? onRectPointerMove : onPerspPointerMove}
        onPointerUp={isRect ? onRectPointerUp : onPerspPointerUp}
        onPointerDown={isPersp ? onPerspPointerDown : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={state.paintingPreviewUrl ?? ""}
          alt="Painting to crop"
          className="w-full block"
          style={{
            transform: isRect ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
          onLoad={() => setImgLoaded(true)}
          draggable={false}
        />

        {imgLoaded && isRect && (
          <div className="absolute inset-0">
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              width={displaySize.w}
              height={displaySize.h}
            >
              <defs>
                <mask id="crop-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#crop-mask)" />
              <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke="white" strokeWidth="1.5" />
              <line x1={crop.x + crop.w / 3} y1={crop.y} x2={crop.x + crop.w / 3} y2={crop.y + crop.h} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1={crop.x + (crop.w * 2) / 3} y1={crop.y} x2={crop.x + (crop.w * 2) / 3} y2={crop.y + crop.h} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1={crop.x} y1={crop.y + crop.h / 3} x2={crop.x + crop.w} y2={crop.y + crop.h / 3} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1={crop.x} y1={crop.y + (crop.h * 2) / 3} x2={crop.x + crop.w} y2={crop.y + (crop.h * 2) / 3} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
            </svg>

            <div
              className="absolute cursor-move"
              style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
              onPointerDown={(e) => onRectPointerDown(e, "move")}
            />

            {handles.map(({ id, cx, cy }) => (
              <div
                key={id}
                className="absolute flex items-center justify-center"
                style={{
                  left: cx - RECT_HIT_RADIUS, top: cy - RECT_HIT_RADIUS,
                  width: RECT_HIT_RADIUS * 2, height: RECT_HIT_RADIUS * 2,
                  cursor: getCursor(id),
                  touchAction: "none",
                }}
                onPointerDown={(e) => onRectPointerDown(e, id)}
              >
                <div style={{
                  width: HANDLE_SIZE, height: HANDLE_SIZE,
                  backgroundColor: "white",
                  border: "1.5px solid var(--primary)",
                  pointerEvents: "none",
                }} />
              </div>
            ))}
          </div>
        )}

        {imgLoaded && isPersp && perspQuad && (
          <div className="absolute inset-0">
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              width={displaySize.w}
              height={displaySize.h}
            >
              <defs>
                <mask id="persp-crop-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <polygon
                    points={`${perspQuad.topLeft.x},${perspQuad.topLeft.y} ${perspQuad.topRight.x},${perspQuad.topRight.y} ${perspQuad.bottomRight.x},${perspQuad.bottomRight.y} ${perspQuad.bottomLeft.x},${perspQuad.bottomLeft.y}`}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#persp-crop-mask)" />
              <polygon
                points={`${perspQuad.topLeft.x},${perspQuad.topLeft.y} ${perspQuad.topRight.x},${perspQuad.topRight.y} ${perspQuad.bottomRight.x},${perspQuad.bottomRight.y} ${perspQuad.bottomLeft.x},${perspQuad.bottomLeft.y}`}
                fill="none"
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>

            {/* Corner handles */}
            {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as CornerKey[]).map((key) => {
              const p = perspQuad[key];
              return (
                <div
                  key={key}
                  className="absolute pointer-events-none"
                  style={{
                    left: p.x - CORNER_HANDLE_SIZE / 2,
                    top: p.y - CORNER_HANDLE_SIZE / 2,
                    width: CORNER_HANDLE_SIZE,
                    height: CORNER_HANDLE_SIZE,
                    border: "2px solid white",
                    backgroundColor: "var(--primary)",
                    opacity: 0.85,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex mb-4 rounded overflow-hidden" style={{ border: "1px solid var(--outline-variant)" }}>
        <button
          onClick={() => switchMode("rectangle")}
          className="flex-1 py-2 text-xs tracking-widest uppercase font-medium transition-colors"
          style={{
            backgroundColor: isRect ? "var(--primary)" : "transparent",
            color: isRect ? "var(--on-primary)" : "var(--on-surface-variant)",
          }}
        >
          {t("modeRectangle")}
        </button>
        <button
          onClick={() => switchMode("perspective")}
          className="flex-1 py-2 text-xs tracking-widest uppercase font-medium transition-colors"
          style={{
            backgroundColor: isPersp ? "var(--primary)" : "transparent",
            color: isPersp ? "var(--on-primary)" : "var(--on-surface-variant)",
          }}
        >
          {t("modePerspective")}
        </button>
      </div>

      {/* Rotation slider — rectangle mode only */}
      {isRect && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-xs tracking-widest uppercase shrink-0" style={{ color: "var(--on-surface-variant)" }}>
            {t("rotateLabel")}
          </span>
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: "var(--primary)" }}
          />
          <span className="text-xs font-mono w-10 text-right shrink-0" style={{ color: "var(--on-surface-variant)" }}>
            {rotation}°
          </span>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={!imgLoaded}
        className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-center mb-3 disabled:opacity-40"
        style={{ background: `linear-gradient(to right, var(--primary), var(--primary-dim))`, color: "var(--on-primary)" }}
      >
        {t("confirmButton")}
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
