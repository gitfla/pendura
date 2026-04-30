"use client";

import { useTranslations } from "next-intl";
import { CATALOG } from "@/lib/catalog";

type Props = {
  userPaintingUrl?: string | null;
  selectedId: string | null; // null = user's own painting
  onSelect: (id: string | null) => void;
};

const ITEM_H = 72;
const MAX_ITEM_W = 140; // cap very wide paintings

export default function ArtworkTray({ userPaintingUrl, selectedId, onSelect }: Props) {
  const t = useTranslations("placement");

  return (
    <div
      className="w-full overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
        backgroundColor: "var(--surface-container-low)",
      }}
    >
      <div className="flex gap-2 p-2" style={{ width: "max-content" }}>
        {/* User's own painting — pinned first if available; aspect unknown so use square */}
        {userPaintingUrl && (
          <button
            onClick={() => onSelect(null)}
            style={{ scrollSnapAlign: "start", flexShrink: 0 }}
            className="flex flex-col items-center gap-1"
          >
            <div
              style={{
                width: ITEM_H,
                height: ITEM_H,
                borderRadius: 2,
                overflow: "hidden",
                border: selectedId === null
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
                transform: selectedId === null ? "scale(1.08)" : "scale(1)",
                transition: "transform 0.15s ease, border-color 0.15s ease",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userPaintingUrl}
                alt={t("tray.yourWork")}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <span
              className="text-[9px] tracking-widest uppercase"
              style={{
                color: selectedId === null ? "var(--primary)" : "var(--on-surface-variant)",
                maxWidth: ITEM_H,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t("tray.yourWork")}
            </span>
          </button>
        )}

        {/* Catalog items — width proportional to real-world aspect ratio */}
        {CATALOG.map((artwork) => {
          const isSelected = selectedId === artwork.id;
          const itemW = Math.min(Math.round(ITEM_H * artwork.aspectRatio), MAX_ITEM_W);
          return (
            <button
              key={artwork.id}
              onClick={() => onSelect(artwork.id)}
              style={{ scrollSnapAlign: "start", flexShrink: 0 }}
              className="flex flex-col items-center gap-1"
            >
              <div
                style={{
                  width: itemW,
                  height: ITEM_H,
                  borderRadius: 2,
                  overflow: "hidden",
                  border: isSelected
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                  transform: isSelected ? "scale(1.08)" : "scale(1)",
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artwork.imageUrl}
                  alt={artwork.title}
                  style={{ width: "100%", height: "100%", objectFit: "fill" }}
                />
              </div>
              <span
                className="text-[9px] tracking-widest uppercase"
                style={{
                  color: isSelected ? "var(--primary)" : "var(--on-surface-variant)",
                  maxWidth: itemW,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {artwork.artist}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
