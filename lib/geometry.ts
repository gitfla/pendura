import { Point, Quad } from "./types";

export function euclideanDistance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function rectToQuad(
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDeg: number
): Quad {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (rotationDeg * Math.PI) / 180;

  const rotate = (px: number, py: number): Point => {
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  };

  return {
    topLeft: rotate(x, y),
    topRight: rotate(x + width, y),
    bottomRight: rotate(x + width, y + height),
    bottomLeft: rotate(x, y + height),
  };
}

export function isQuadConvex(quad: Quad): boolean {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return true;
}
