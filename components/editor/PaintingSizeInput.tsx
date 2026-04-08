"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PaintingDimensions } from "@/lib/types";

type Props = {
  unit: "cm" | "in";
  onApply: (dims: PaintingDimensions) => void;
  onCancel: () => void;
};

export default function PaintingSizeInput({ unit, onApply, onCancel }: Props) {
  const t = useTranslations("placement.calibration");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const wNum = parseFloat(width);
  const hNum = parseFloat(height);
  const canApply = wNum > 0 && hNum > 0;

  return (
    <div>
      <p className="text-sm font-medium mb-3" style={{ color: "var(--on-surface)" }}>
        {t("sizeTitle")}
      </p>

      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs block mb-1" style={{ color: "var(--on-surface-variant)" }}>
            {t("widthLabel")} ({t(unit)})
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            className="w-full px-3 py-2 text-base rounded border"
            style={{
              borderColor: "var(--outline-variant)",
              backgroundColor: "var(--surface-container-low)",
              color: "var(--on-surface)",
            }}
            autoFocus
          />
        </div>
        <div className="flex-1">
          <label className="text-xs block mb-1" style={{ color: "var(--on-surface-variant)" }}>
            {t("heightLabel")} ({t(unit)})
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full px-3 py-2 text-base rounded border"
            style={{
              borderColor: "var(--outline-variant)",
              backgroundColor: "var(--surface-container-low)",
              color: "var(--on-surface)",
            }}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 text-xs tracking-widest uppercase"
          style={{ color: "var(--on-surface-variant)" }}
        >
          {t("cancel")}
        </button>
        <button
          onClick={() => canApply && onApply({ width: wNum, height: hNum, unit })}
          disabled={!canApply}
          className="flex-1 py-3 text-xs tracking-widest uppercase font-medium rounded"
          style={{
            backgroundColor: canApply ? "var(--primary)" : "var(--outline-variant)",
            color: canApply ? "var(--on-primary)" : "var(--on-surface-variant)",
            opacity: canApply ? 1 : 0.5,
          }}
        >
          {t("apply")}
        </button>
      </div>
    </div>
  );
}
