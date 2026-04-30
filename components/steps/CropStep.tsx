"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { perspectiveCropToBlob } from "@/lib/perspectiveCrop";
import { rectToQuad, isQuadConvex } from "@/lib/geometry";
import type { Quad, Point } from "@/lib/types";
import dynamic from "next/dynamic";

const KonvaCrop = dynamic(() => import("@/components/editor/KonvaCrop"), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center" style={{ aspectRatio: "4/3", backgroundColor: "var(--surface-container-low)" }}>
      <span className="text-xs tracking-widest uppercase" style={{ color: "var(--outline-variant)" }}>
        Loading editor...
      </span>
    </div>
  ),
});

type CropMode = "rectangle" | "perspective";

export type KonvaCropHandle = {
  getCropQuad: () => Quad | null;
  getDisplaySize: () => { w: number; h: number };
  snapshotRect: () => void;
};

export default function CropStep() {
  const t = useTranslations("crop");
  const { state, setState, goNextWithCheckpoint, updateCheckpointImage, goPrev } = useProject();
  const t2 = useTranslations("checkpoint");
  const konvaCropRef = useRef<KonvaCropHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [cropMode, setCropMode] = useState<CropMode>("rectangle");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [paintingImg, setPaintingImg] = useState<HTMLImageElement | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      // Only update on width change — ignore height-only changes (mobile address bar show/hide)
      setContainerWidth((prev) => (w !== prev ? w : prev));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load painting image for crop extraction
  useEffect(() => {
    if (!state.paintingPreviewUrl) return;
    const img = new Image();
    img.onload = () => {
      setPaintingImg(img);
      setImgLoaded(true);
    };
    img.src = state.paintingPreviewUrl;
  }, [state.paintingPreviewUrl]);

  const handleConfirm = async () => {
    if (!konvaCropRef.current || !paintingImg) return;

    const quad = konvaCropRef.current.getCropQuad();
    if (!quad) return;

    const { w: displayWidth, h: displayHeight } = konvaCropRef.current.getDisplaySize();

    // Show checkpoint immediately — computation runs behind it
    goNextWithCheckpoint(t2("cropDone"));
    setProcessing(true);

    // Yield to browser so checkpoint screen renders before heavy computation
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const { blob, aspectRatio } = await perspectiveCropToBlob(
      paintingImg,
      quad,
      displayWidth,
      displayHeight,
    );

    if (state.croppedPaintingUrl) URL.revokeObjectURL(state.croppedPaintingUrl);
    // Re-crop invalidates any existing user painting snapshot
    if (state.userCroppedPaintingUrl) URL.revokeObjectURL(state.userCroppedPaintingUrl);
    const url = URL.createObjectURL(blob);
    setState({
      croppedPaintingBlob: blob,
      croppedPaintingUrl: url,
      userCroppedPaintingUrl: null,
      userCroppedPaintingBlob: null,
      userCroppedPaintingAspect: aspectRatio,
      selectedArtworkId: null,
    });
    // Update checkpoint to show the cropped result
    updateCheckpointImage(url);
    setProcessing(false);
  };

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

      {/* Konva crop canvas */}
      <div className="w-full mb-4" style={{ padding: 10, backgroundColor: "#fff", boxShadow: "0 4px 32px rgba(46,52,48,0.08)" }}>
      <div ref={containerRef} className="w-full">
        {containerWidth > 0 && state.paintingPreviewUrl && (
          <KonvaCrop
            ref={konvaCropRef}
            paintingUrl={state.paintingPreviewUrl}
            containerWidth={containerWidth}
            mode={cropMode}
          />
        )}
      </div>
      </div>

      {/* Mode toggle — side-by-side cards matching PlacementStep */}
      <div className="grid grid-cols-2 mb-6" style={{ gap: "1px", backgroundColor: "var(--outline-variant)" }}>
        <button
          onClick={() => setCropMode("rectangle")}
          className="flex flex-col items-center justify-center py-4 gap-2"
          style={{
            backgroundColor: isRect ? "var(--surface-container-high)" : "var(--surface-container-low)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
            <rect x="2" y="4" width="16" height="12" />
          </svg>
          <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
            {t("modeRectangle")}
          </span>
        </button>
        <button
          onClick={() => { konvaCropRef.current?.snapshotRect(); setCropMode("perspective"); }}
          className="flex flex-col items-center justify-center py-4 gap-2"
          style={{
            backgroundColor: isPersp ? "var(--surface-container-high)" : "var(--surface-container-low)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--on-surface-variant)" }}>
            <polygon points="4,3 17,2 18,18 2,16" />
            <circle cx="4" cy="3" r="1.5" fill="currentColor" />
            <circle cx="17" cy="2" r="1.5" fill="currentColor" />
            <circle cx="18" cy="18" r="1.5" fill="currentColor" />
            <circle cx="2" cy="16" r="1.5" fill="currentColor" />
          </svg>
          <span className="text-xs tracking-widest uppercase font-medium" style={{ color: "var(--on-surface-variant)" }}>
            {t("modePerspective")}
          </span>
        </button>
      </div>

      <button
        onClick={handleConfirm}
        disabled={!imgLoaded || processing}
        className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 mb-3 disabled:opacity-40"
        style={{ background: `linear-gradient(to right, var(--primary), var(--primary-dim))`, color: "var(--on-primary)" }}
      >
        <span>{processing ? t("processing") : t("confirmButton")}</span>
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
    </div>
  );
}
