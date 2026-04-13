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
  // Konva rotates around the node origin (x, y), not the center
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotate = (dx: number, dy: number): Point => ({
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
  });

  return {
    topLeft:     rotate(0,     0),
    topRight:    rotate(width, 0),
    bottomRight: rotate(width, height),
    bottomLeft:  rotate(0,     height),
  };
}

export function pointInQuad(p: Point, quad: Quad): boolean {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return true;
}

export function quadCentroid(quad: Quad): Point {
  return {
    x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
    y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4,
  };
}

export function scaleQuadFromCentroid(quad: Quad, factor: number): Quad {
  const c = quadCentroid(quad);
  const scale = (p: Point): Point => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  });
  return {
    topLeft: scale(quad.topLeft),
    topRight: scale(quad.topRight),
    bottomRight: scale(quad.bottomRight),
    bottomLeft: scale(quad.bottomLeft),
  };
}

export function rotateQuadAroundCentroid(quad: Quad, angleDeg: number): Quad {
  const c = quadCentroid(quad);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotate = (p: Point): Point => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  };
  return {
    topLeft: rotate(quad.topLeft),
    topRight: rotate(quad.topRight),
    bottomRight: rotate(quad.bottomRight),
    bottomLeft: rotate(quad.bottomLeft),
  };
}

/** Returns true if the quad is axis-aligned (a rectangle with no rotation/perspective). */
export function isAxisAligned(quad: Quad, epsilon = 1): boolean {
  return (
    Math.abs(quad.topLeft.y - quad.topRight.y) < epsilon &&
    Math.abs(quad.bottomLeft.y - quad.bottomRight.y) < epsilon &&
    Math.abs(quad.topLeft.x - quad.bottomLeft.x) < epsilon &&
    Math.abs(quad.topRight.x - quad.bottomRight.x) < epsilon
  );
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
