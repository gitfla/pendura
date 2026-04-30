"use client";

import { useRef } from "react";
import { Point } from "@/lib/types";

export type WallCornerKey = "tl" | "tr" | "br" | "bl";
export const WALL_CORNER_KEYS: WallCornerKey[] = ["tl", "tr", "br", "bl"];

export type WallPolygonPoints = {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
};

type Props = {
  points: WallPolygonPoints | null; // null = not yet fully defined
  placedCount: number;              // 0–4 during initial tap-to-place
  containerWidth: number;
  stageHeight: number;
  onChange: (points: WallPolygonPoints) => void;
};

const HANDLE_R = 10;
const HIT_R = 24;

export default function WallPolygonOverlay({
  points,
  placedCount,
  containerWidth,
  stageHeight,
  onChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<WallCornerKey | null>(null);

  const pctX = (x: number) => `${(x / containerWidth) * 100}%`;
  const pctY = (y: number) => `${(y / stageHeight) * 100}%`;

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent, key: WallCornerKey) => {
    if (!points) return;
    e.stopPropagation();
    e.preventDefault();
    // Capture on the SVG element — SVG child elements don't support setPointerCapture reliably
    svgRef.current?.setPointerCapture(e.pointerId);
    draggingRef.current = key;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !points) return;
    e.preventDefault();
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(containerWidth,  ((e.clientX - rect.left)  / rect.width)  * containerWidth));
    const y = Math.max(0, Math.min(stageHeight,     ((e.clientY - rect.top)   / rect.height) * stageHeight));
    onChange({ ...points, [draggingRef.current]: { x, y } });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      svgRef.current?.releasePointerCapture(e.pointerId);
      draggingRef.current = null;
    }
  };

  // ── Polygon path ───────────────────────────────────────────────────────────

  const polygonPoints = points
    ? `${(points.tl.x / containerWidth) * 100},${(points.tl.y / stageHeight) * 100} ` +
      `${(points.tr.x / containerWidth) * 100},${(points.tr.y / stageHeight) * 100} ` +
      `${(points.br.x / containerWidth) * 100},${(points.br.y / stageHeight) * 100} ` +
      `${(points.bl.x / containerWidth) * 100},${(points.bl.y / stageHeight) * 100}`
    : null;

  // Partial lines during tap-to-place (before all 4 points set)
  const partialCorners = points
    ? ([
        { key: "tl", p: points.tl },
        { key: "tr", p: points.tr },
        { key: "br", p: points.br },
        { key: "bl", p: points.bl },
      ] as { key: WallCornerKey; p: Point }[]).slice(0, placedCount)
    : [];

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ pointerEvents: points ? "auto" : "none", touchAction: "none" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Dim layer */}
      <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.35)" />

      {/* Polygon fill + outline when fully defined */}
      {polygonPoints && (
        <>
          <polygon
            points={polygonPoints}
            fill="rgba(90,122,90,0.18)"
            stroke="rgba(90,122,90,0.85)"
            strokeWidth="0.4"
            strokeDasharray="2 1.5"
          />
        </>
      )}

      {/* Partial lines during tap-to-place */}
      {!points && partialCorners.length >= 2 &&
        partialCorners.slice(0, -1).map((c, i) => {
          const next = partialCorners[i + 1];
          return (
            <line
              key={i}
              x1={`${(c.p.x / containerWidth) * 100}`}
              y1={`${(c.p.y / stageHeight) * 100}`}
              x2={`${(next.p.x / containerWidth) * 100}`}
              y2={`${(next.p.y / stageHeight) * 100}`}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="0.4"
              strokeDasharray="2 1.5"
            />
          );
        })
      }

      {/* Corner handles — draggable when fully defined */}
      {points &&
        (["tl", "tr", "br", "bl"] as WallCornerKey[]).map((key) => {
          const p = points[key];
          const cx = `${(p.x / containerWidth) * 100}`;
          const cy = `${(p.y / stageHeight) * 100}`;
          return (
            <g
              key={key}
              style={{ cursor: "move" }}
              onPointerDown={(e) => onPointerDown(e, key)}
            >
              {/* Hit area */}
              <circle cx={cx} cy={cy} r={`${(HIT_R / containerWidth) * 100}`} fill="transparent" />
              {/* Visual handle */}
              <circle
                cx={cx} cy={cy}
                r={`${(HANDLE_R / containerWidth) * 100}`}
                fill="rgba(255,255,255,0.92)"
                stroke="rgba(90,122,90,0.9)"
                strokeWidth="0.4"
              />
              <circle cx={cx} cy={cy} r={`${(3 / containerWidth) * 100}`} fill="rgba(90,122,90,0.9)" />
            </g>
          );
        })
      }

      {/* Dots during tap-to-place */}
      {!points &&
        partialCorners.map(({ key, p }) => (
          <g key={key}>
            <circle
              cx={`${(p.x / containerWidth) * 100}`}
              cy={`${(p.y / stageHeight) * 100}`}
              r={`${(HANDLE_R / containerWidth) * 100}`}
              fill="rgba(255,255,255,0.92)"
              stroke="rgba(90,122,90,0.9)"
              strokeWidth="0.4"
            />
            <circle
              cx={`${(p.x / containerWidth) * 100}`}
              cy={`${(p.y / stageHeight) * 100}`}
              r={`${(3 / containerWidth) * 100}`}
              fill="rgba(90,122,90,0.9)"
            />
          </g>
        ))
      }
    </svg>
  );
}
