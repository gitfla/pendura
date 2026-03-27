"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { cropImageToBlob } from "@/lib/image";

type CropBox = { x: number; y: number; w: number; h: number };
type Handle =
  | "tl" | "tc" | "tr"
  | "ml" | "mr"
  | "bl" | "bc" | "br"
  | "move";

const MIN_SIZE = 40;

export default function CropStep() {
  const t = useTranslations("crop");
  const { state, setState, goNext, goPrev } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropBox>({ x: 16, y: 16, w: 0, h: 0 });
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startCrop: CropBox;
  } | null>(null);

  // Init crop box once image is loaded
  useEffect(() => {
    if (!imgLoaded || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = imgRef.current?.offsetHeight ?? rect.height;
    setDisplaySize({ w, h });
    const pad = 24;
    setCrop({ x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 });
  }, [imgLoaded]);

  const clampCrop = useCallback((c: CropBox, dw: number, dh: number): CropBox => {
    let { x, y, w, h } = c;
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
    x = Math.max(0, Math.min(x, dw - w));
    y = Math.max(0, Math.min(y, dh - h));
    if (x + w > dw) w = dw - x;
    if (y + h > dh) h = dh - y;
    return { x, y, w, h };
  }, []);

  const onPointerDown = (e: React.PointerEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { handle, startX, startY, startCrop } = dragRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let { x, y, w, h } = startCrop;
      const { w: dw, h: dh } = displaySize;

      switch (handle) {
        case "move":
          x += dx; y += dy; break;
        case "tl":
          x += dx; y += dy; w -= dx; h -= dy; break;
        case "tc":
          y += dy; h -= dy; break;
        case "tr":
          y += dy; w += dx; h -= dy; break;
        case "ml":
          x += dx; w -= dx; break;
        case "mr":
          w += dx; break;
        case "bl":
          x += dx; w -= dx; h += dy; break;
        case "bc":
          h += dy; break;
        case "br":
          w += dx; h += dy; break;
      }

      setCrop(clampCrop({ x, y, w, h }, dw, dh));
    },
    [displaySize, clampCrop]
  );

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = async () => {
    if (!imgRef.current || !state.paintingPreviewUrl) return;
    const img = imgRef.current;
    const blob = await cropImageToBlob(
      img,
      crop.x, crop.y, crop.w, crop.h,
      img.naturalWidth, img.naturalHeight,
      displaySize.w, displaySize.h
    );
    if (state.croppedPaintingUrl) URL.revokeObjectURL(state.croppedPaintingUrl);
    const url = URL.createObjectURL(blob);
    setState({
      croppedPaintingBlob: blob,
      croppedPaintingUrl: url,
      cropRect: { x: crop.x, y: crop.y, width: crop.w, height: crop.h },
    });
    goNext();
  };

  const HANDLE_SIZE = 12;
  const hs = HANDLE_SIZE / 2;

  const handles: { id: Handle; cx: number; cy: number }[] = imgLoaded
    ? [
        { id: "tl", cx: crop.x, cy: crop.y },
        { id: "tc", cx: crop.x + crop.w / 2, cy: crop.y },
        { id: "tr", cx: crop.x + crop.w, cy: crop.y },
        { id: "ml", cx: crop.x, cy: crop.y + crop.h / 2 },
        { id: "mr", cx: crop.x + crop.w, cy: crop.y + crop.h / 2 },
        { id: "bl", cx: crop.x, cy: crop.y + crop.h },
        { id: "bc", cx: crop.x + crop.w / 2, cy: crop.y + crop.h },
        { id: "br", cx: crop.x + crop.w, cy: crop.y + crop.h },
      ]
    : [];

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "var(--on-surface-variant)" }}>
        {t("step")}
      </p>
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-2" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>
      <p className="text-xs mb-6" style={{ color: "var(--outline-variant)" }}>
        {t("instruction")}
      </p>

      {/* Crop canvas */}
      <div
        ref={containerRef}
        className="relative w-full mb-8 select-none"
        style={{ touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={state.paintingPreviewUrl ?? ""}
          alt="Painting to crop"
          className="w-full block"
          onLoad={() => setImgLoaded(true)}
          draggable={false}
        />

        {imgLoaded && (
          <div className="absolute inset-0">
            {/* Dark overlay outside crop */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ position: "absolute", top: 0, left: 0 }}
              width={displaySize.w}
              height={displaySize.h}
            >
              <defs>
                <mask id="crop-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="black" />
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="rgba(0,0,0,0.45)"
                mask="url(#crop-mask)"
              />
              {/* Crop border */}
              <rect
                x={crop.x}
                y={crop.y}
                width={crop.w}
                height={crop.h}
                fill="none"
                stroke="white"
                strokeWidth="1.5"
              />
              {/* Rule of thirds grid */}
              <line x1={crop.x + crop.w / 3} y1={crop.y} x2={crop.x + crop.w / 3} y2={crop.y + crop.h} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <line x1={crop.x + (crop.w * 2) / 3} y1={crop.y} x2={crop.x + (crop.w * 2) / 3} y2={crop.y + crop.h} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <line x1={crop.x} y1={crop.y + crop.h / 3} x2={crop.x + crop.w} y2={crop.y + crop.h / 3} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <line x1={crop.x} y1={crop.y + (crop.h * 2) / 3} x2={crop.x + crop.w} y2={crop.y + (crop.h * 2) / 3} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            </svg>

            {/* Move handle — invisible overlay on crop area */}
            <div
              className="absolute cursor-move"
              style={{
                left: crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
              }}
              onPointerDown={(e) => onPointerDown(e, "move")}
            />

            {/* Corner/edge handles */}
            {handles.map(({ id, cx, cy }) => (
              <div
                key={id}
                className="absolute"
                style={{
                  left: cx - hs,
                  top: cy - hs,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  backgroundColor: "white",
                  border: "1.5px solid var(--primary)",
                  cursor: getCursor(id),
                  touchAction: "none",
                }}
                onPointerDown={(e) => onPointerDown(e, id)}
              />
            ))}
          </div>
        )}
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
        onClick={handleConfirm}
        disabled={!imgLoaded}
        className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 disabled:opacity-40"
        style={{
          background: `linear-gradient(to right, var(--primary), var(--primary-dim))`,
          color: "var(--on-primary)",
        }}
      >
        <span>{t("confirmButton")}</span>
        <span>→</span>
      </button>
    </div>
  );
}

function getCursor(handle: Handle): string {
  switch (handle) {
    case "tl": case "br": return "nwse-resize";
    case "tr": case "bl": return "nesw-resize";
    case "tc": case "bc": return "ns-resize";
    case "ml": case "mr": return "ew-resize";
    case "move": return "move";
  }
}
