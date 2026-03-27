"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { validateImageFile } from "@/lib/validation";
import { compressImageIfNeeded, readFileAsDataUrl } from "@/lib/image";

export default function WallUploadStep() {
  const t = useTranslations("wall");
  const { setState, goNext } = useProject();
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
      setState({ wallImage: compressed, wallPreviewUrl: dataUrl });
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
      <p className="text-xs tracking-widest uppercase mb-6" style={{ color: "var(--on-surface-variant)" }}>
        {t("step")}
      </p>
      <h1 className="font-serif text-4xl leading-tight mb-4" style={{ color: "var(--on-surface)" }}>
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--on-surface-variant)" }}>
        {t("subtitle")}
      </p>

      <div
        className="mb-8 relative flex flex-col items-center justify-center"
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
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="3" x2="9" y2="9" />
            </svg>
            <p className="mt-3 text-xs tracking-widest uppercase" style={{ color: "var(--on-surface-variant)" }}>
              {t("selectButton")}
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "#c0392b" }}>{error}</p>
      )}
    </div>
  );
}
