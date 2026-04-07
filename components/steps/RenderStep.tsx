"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { SHADOW_DEFAULTS } from "@/lib/constants";

const MAX_UPLOAD_DIM = 2048;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Downscale an image blob so its longest side is at most maxDim. Returns { blob, scale }. */
async function downscaleBlob(
  source: Blob,
  maxDim: number,
): Promise<{ blob: Blob; scale: number }> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w <= maxDim && h <= maxDim) return { blob: source, scale: 1 };

    const ratio = maxDim / Math.max(w, h);
    const nw = Math.round(w * ratio);
    const nh = Math.round(h * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, nw, nh);

    const outBlob = await new Promise<Blob>((res, rej) => {
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.85);
    });
    return { blob: outBlob, scale: ratio };
  } finally {
    URL.revokeObjectURL(url);
  }
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
      const wallImg = await loadImage(state.wallPreviewUrl!);
      const scaleX = wallImg.naturalWidth / state.placement.canvasWidth;
      const scaleY = wallImg.naturalHeight / state.placement.canvasHeight;

      // Downscale images to fit within Vercel's payload limit
      const { blob: wallBlob, scale: wallScale } = await downscaleBlob(state.wallImage, MAX_UPLOAD_DIM);
      const { blob: paintingBlob } = await downscaleBlob(state.croppedPaintingBlob, MAX_UPLOAD_DIM);

      // Scale quad: display → natural coords → downscaled coords
      const q = state.placement.quad;
      const sx = scaleX * wallScale;
      const sy = scaleY * wallScale;
      const scaledQuad = {
        topLeft:     { x: q.topLeft.x     * sx, y: q.topLeft.y     * sy },
        topRight:    { x: q.topRight.x    * sx, y: q.topRight.y    * sy },
        bottomRight: { x: q.bottomRight.x * sx, y: q.bottomRight.y * sy },
        bottomLeft:  { x: q.bottomLeft.x  * sx, y: q.bottomLeft.y  * sy },
      };

      const formData = new FormData();
      formData.append("wallImage", wallBlob, "wall.jpg");
      formData.append("paintingImage", paintingBlob, "painting.jpg");
      formData.append("quad", JSON.stringify(scaledQuad));
      formData.append("shadow", JSON.stringify(SHADOW_DEFAULTS));

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
