"use client";

import { Point } from "@/lib/types";

type Props = {
  pointA: Point | null;
  pointB: Point | null;
  containerWidth: number;
  stageHeight: number;
  labelA: string;
  labelB: string;
};

const DOT_R = 8;

export default function CalibrationOverlay({
  pointA,
  pointB,
  containerWidth,
  stageHeight,
  labelA,
  labelB,
}: Props) {
  const pctX = (p: Point) => `${(p.x / containerWidth) * 100}%`;
  const pctY = (p: Point) => `${(p.y / stageHeight) * 100}%`;

  return (
    <>
      {/* Dim layer */}
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />

      {/* SVG dots + line */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        {pointA && (
          <>
            <circle cx={pctX(pointA)} cy={pctY(pointA)} r={DOT_R} fill="rgba(255,255,255,0.9)" stroke="#5a7a5a" strokeWidth={2} />
            <circle cx={pctX(pointA)} cy={pctY(pointA)} r={3} fill="#5a7a5a" />
            <text x={pctX(pointA)} y={pctY(pointA)} dy={-14} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold" style={{ fontFamily: "system-ui, sans-serif" }}>
              {labelA}
            </text>
          </>
        )}
        {pointA && pointB && (
          <>
            <line
              x1={pctX(pointA)} y1={pctY(pointA)}
              x2={pctX(pointB)} y2={pctY(pointB)}
              stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeDasharray="6 4"
            />
            <circle cx={pctX(pointB)} cy={pctY(pointB)} r={DOT_R} fill="rgba(255,255,255,0.9)" stroke="#5a7a5a" strokeWidth={2} />
            <circle cx={pctX(pointB)} cy={pctY(pointB)} r={3} fill="#5a7a5a" />
            <text x={pctX(pointB)} y={pctY(pointB)} dy={-14} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold" style={{ fontFamily: "system-ui, sans-serif" }}>
              {labelB}
            </text>
          </>
        )}
      </svg>
    </>
  );
}
