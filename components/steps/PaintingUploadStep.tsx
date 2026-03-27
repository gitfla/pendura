"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { validateImageFile } from "@/lib/validation";
import { compressImageIfNeeded, readFileAsDataUrl } from "@/lib/image";

export default function PaintingUploadStep() {
  const t = useTranslations("painting");
  const { state, setState, goNext, goPrev } = useProject();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(`${validationError}: type="${file.type}"`);
      return;
    }
    setLoading(true);
    try {
      const compressed = await compressImageIfNeeded(file);
      const dataUrl = await readFileAsDataUrl(compressed);
      setState({ paintingImage: compressed, paintingPreviewUrl: dataUrl });
      goNext();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="px-6 py-8 max-w-lg mx-auto w-full">
      <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "var(--on-surface-variant)" }}>
        {t("step")}
      </p>

      {state.wallPreviewUrl && (
        <div className="flex items-center gap-3 mb-6 p-3" style={{ backgroundColor: "var(--surface-container-low)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.wallPreviewUrl} alt="Wall confirmed" className="w-12 h-12 object-cover" />
          <div>
            <p className="text-[10px] tracking-widest uppercase mb-0.5" style={{ color: "var(--on-surface-variant)" }}>
              Source Context
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--on-surface)" }}>
              {t("confirmed")}
            </p>
          </div>
          <div className="ml-auto w-5 h-5 flex items-center justify-center" style={{ backgroundColor: "var(--primary)", color: "white" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="2 6 5 9 10 3" />
            </svg>
          </div>
        </div>
      )}

      <h1 className="font-serif text-4xl leading-tight mb-4" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      <div
        className="mb-6 relative flex flex-col items-center justify-center"
        style={{
          backgroundColor: "var(--surface-container-low)",
          border: "1.5px dashed var(--outline-variant)",
          minHeight: "200px",
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleInputChange}
          disabled={loading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        {loading ? (
          <p className="text-xs tracking-widest uppercase" style={{ color: "var(--on-surface-variant)" }}>
            ...
          </p>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square" style={{ color: "var(--outline-variant)" }}>
              <rect x="3" y="3" width="18" height="18" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <p className="mt-3 text-xs tracking-widest uppercase" style={{ color: "var(--on-surface-variant)" }}>
              {t("selectButton")}
            </p>
          </>
        )}
      </div>

      <div className="mb-8 p-4" style={{ backgroundColor: "var(--surface-container)" }}>
        <p className="text-[10px] tracking-widest uppercase mb-4" style={{ color: "var(--on-surface-variant)" }}>
          {t("notes.title")}
        </p>
        {[
          { num: "01", key: "planar" },
          { num: "02", key: "exposure" },
          { num: "03", key: "edge" },
        ].map(({ num, key }) => (
          <div key={key} className="mb-4 last:mb-0 flex gap-4">
            <span className="text-xs font-serif" style={{ color: "var(--outline-variant)", minWidth: "20px" }}>{num}</span>
            <p className="text-xs leading-relaxed" style={{ color: "var(--on-surface-variant)" }}>
              {t(`notes.${key}` as "notes.planar" | "notes.exposure" | "notes.edge")}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "#c0392b" }}>{error}</p>
      )}

      <button
        onClick={goPrev}
        className="w-full py-3 text-xs tracking-widest uppercase mb-3 flex items-center justify-center gap-2"
        style={{ color: "var(--on-surface-variant)" }}
      >
        <span>←</span>
        <span>{t("previousButton")}</span>
      </button>

    </div>
  );
}
