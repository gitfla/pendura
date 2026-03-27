"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { rectToQuad } from "@/lib/geometry";
import dynamic from "next/dynamic";

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

export default function PlacementStep() {
  const t = useTranslations("placement");
  const { state, setState, goNext, goPrev, goToStep } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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

      <div ref={containerRef} className="w-full mb-6">
        {containerWidth > 0 && (
          <KonvaPlacement
            wallUrl={state.wallPreviewUrl ?? ""}
            paintingUrl={state.croppedPaintingUrl ?? ""}
            containerWidth={containerWidth}
            onTransformChange={(x, y, width, height, rotation, canvasWidth, canvasHeight) => {
              const quad = rectToQuad(x, y, width, height, rotation);
              console.log("[Placement] quad in canvas coords", quad, "canvas:", canvasWidth, canvasHeight);
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
        )}
      </div>

      {/* Thumbnail pair */}
      <div className="flex items-center gap-3 mb-8">
        {state.wallPreviewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.wallPreviewUrl} alt="Wall" className="w-16 h-16 object-cover" />
        )}
        <span style={{ color: "var(--outline-variant)" }}>+</span>
        {state.croppedPaintingUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.croppedPaintingUrl} alt="Painting" className="w-16 h-16 object-cover" />
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
        onClick={goNext}
        className="w-full py-3 text-xs tracking-widest uppercase mb-3 flex items-center justify-center gap-2"
        style={{
          border: "1px solid var(--primary)",
          color: "var(--primary)",
        }}
      >
        {t("adjustCornersButton")}
      </button>

      <button
        onClick={() => goToStep("render")}
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
