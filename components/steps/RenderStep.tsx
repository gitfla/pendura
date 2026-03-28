"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { SHADOW_DEFAULTS } from "@/lib/constants";

function getImageNaturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

export default function RenderStep() {
  const t = useTranslations("render");
  const { state, goPrev, reset } = useProject();
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRender = async () => {
    if (!state.wallImage || !state.croppedPaintingBlob || !state.placement) return;

    setLoading(true);
    setError(null);
    setResultUrl(null);

    try {
      const wallNaturalSize = await getImageNaturalSize(state.wallPreviewUrl!);
      const scaleX = wallNaturalSize.width / state.placement.canvasWidth;
      const scaleY = wallNaturalSize.height / state.placement.canvasHeight;

      const rawQuad = state.placement.quad;
      const scaledQuad = {
        topLeft:     { x: rawQuad.topLeft.x     * scaleX, y: rawQuad.topLeft.y     * scaleY },
        topRight:    { x: rawQuad.topRight.x    * scaleX, y: rawQuad.topRight.y    * scaleY },
        bottomRight: { x: rawQuad.bottomRight.x * scaleX, y: rawQuad.bottomRight.y * scaleY },
        bottomLeft:  { x: rawQuad.bottomLeft.x  * scaleX, y: rawQuad.bottomLeft.y  * scaleY },
      };

      const formData = new FormData();
      formData.append("wallImage", state.wallImage);
      formData.append("paintingImage", state.croppedPaintingBlob, "painting.png");
      formData.append("quad", JSON.stringify(scaledQuad));
      formData.append("shadow", JSON.stringify(SHADOW_DEFAULTS));
      formData.append("format", "png");

      const res = await fetch("/api/render", { method: "POST", body: formData });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Render failed");
      }

      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger on mount
  useEffect(() => {
    handleRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "pendura-render.png";
    a.click();
  };

  if (loading) {
    return (
      <div className="px-6 py-8 max-w-lg mx-auto w-full flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="mb-6 text-4xl" style={{ color: "var(--outline-variant)" }}>⧖</div>
        <p className="text-xs tracking-widest uppercase text-center" style={{ color: "var(--on-surface-variant)" }}>
          {t("loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "var(--on-surface-variant)" }}>
        {t("step")}
      </p>
      <h1 className="font-serif text-4xl leading-tight mb-3" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      {resultUrl && (
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Final render" className="w-full" />
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 text-sm" style={{ backgroundColor: "var(--surface-container)", color: "#c0392b" }}>
          {error}
        </div>
      )}

      <button
        onClick={goPrev}
        className="w-full py-3 text-xs tracking-widest uppercase mb-3 flex items-center justify-center gap-2"
        style={{ color: "var(--on-surface-variant)" }}
      >
        <span>←</span>
        <span>{t("previousButton")}</span>
      </button>

      {resultUrl && (
        <>
          <button
            onClick={handleDownload}
            className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6 mb-3"
            style={{ background: `linear-gradient(to right, var(--primary), var(--primary-dim))`, color: "var(--on-primary)" }}
          >
            <span>{t("downloadButton")}</span>
            <span>↓</span>
          </button>
          <button
            onClick={reset}
            className="w-full py-3 text-xs tracking-widest uppercase"
            style={{ color: "var(--outline-variant)" }}
          >
            {t("startOverButton")}
          </button>
        </>
      )}

      {error && (
        <button
          onClick={handleRender}
          disabled={loading}
          className="w-full py-4 text-xs tracking-widest uppercase font-medium flex items-center justify-between px-6"
          style={{ background: `linear-gradient(to right, var(--primary), var(--primary-dim))`, color: "var(--on-primary)" }}
        >
          <span>{t("renderButton")}</span>
          <span>→</span>
        </button>
      )}
    </div>
  );
}
