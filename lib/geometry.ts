import { Point, Quad, WallPlane } from "./types";

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

// ── Homography ──────────────────────────────────────────────────────────────
//
// A homography is a 3×3 projective transformation matrix stored row-major as a
// flat 9-element array: [h00,h01,h02, h10,h11,h12, h20,h21,h22].
//
// computeHomography uses the Direct Linear Transform (DLT): for each of the 4
// point correspondences src[i] → dst[i] we write 2 linear equations, giving an
// 8×8 system (h[8]=1 fixed, moved to RHS). We solve with Gaussian elimination.
//
// The two equations per point come from setting h[8]=1 and isolating h[0..7]:
//   h[0]*sx + h[1]*sy + h[2]                 - h[6]*dx*sx - h[7]*dx*sy = dx
//                       h[3]*sx + h[4]*sy + h[5] - h[6]*dy*sx - h[7]*dy*sy = dy

type H = [number,number,number, number,number,number, number,number,number];

/** Compute the homography that maps each src[i] to dst[i]. */
export function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [Point, Point, Point, Point],
): H {
  // 8×9 augmented matrix [A | b] where b is the RHS (dx or dy per row)
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1,  0,  0, 0, -dx * sx, -dx * sy, dx]);
    A.push([ 0,  0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }

  // Gaussian elimination with partial pivoting on 8×9 augmented matrix
  const n = 8;
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = A[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      for (let k = col; k <= n; k++) {
        A[row][k] -= factor * A[col][k];
      }
    }
  }

  // Back-substitution
  const h = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    h[row] = A[row][n] / A[row][row];
    for (let k = row - 1; k >= 0; k--) {
      A[k][n] -= A[k][row] * h[row];
    }
  }

  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Apply a homography matrix to a point. */
export function applyHomography(H: H, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/** Invert a 3×3 homography matrix using the analytic cofactor formula. */
export function invertHomography(H: H): H {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);

  const inv: H = [
     (e * i - f * h) / det, -(b * i - c * h) / det,  (b * f - c * e) / det,
    -(d * i - f * g) / det,  (a * i - c * g) / det, -(a * f - c * d) / det,
     (d * h - e * g) / det, -(a * h - b * g) / det,  (a * e - b * d) / det,
  ];
  return inv;
}

// ── Wall-plane helpers ──────────────────────────────────────────────────────
//
// Wall-plane UV coordinates use the unit square [0,1]² where the four corners
// of the wall polygon map to (0,0) TL, (1,0) TR, (1,1) BR, (0,1) BL.

const WALL_UV_CORNERS: [Point, Point, Point, Point] = [
  { x: 0, y: 0 }, // TL
  { x: 1, y: 0 }, // TR
  { x: 1, y: 1 }, // BR
  { x: 0, y: 1 }, // BL
];

function wallHomography(wallPlane: WallPlane): H {
  return computeHomography(WALL_UV_CORNERS, wallPlane.polygon);
}

function wallHomographyInverse(wallPlane: WallPlane): H {
  return invertHomography(wallHomography(wallPlane));
}

/** Convert a canvas-space point to wall-plane UV [0,1]². */
export function screenPointToWallUV(
  wallPlane: WallPlane,
  canvasPoint: Point,
): { u: number; v: number } {
  const p = applyHomography(wallHomographyInverse(wallPlane), canvasPoint);
  return { u: p.x, v: p.y };
}

/** Convert a wall-plane UV coordinate to a canvas-space point. */
export function wallUVToScreenPoint(
  wallPlane: WallPlane,
  uv: { u: number; v: number },
): Point {
  return applyHomography(wallHomography(wallPlane), { x: uv.u, y: uv.v });
}

/**
 * Project an artwork rectangle onto the wall plane and return its canvas quad.
 *
 * @param planeCenter  Center of the artwork in wall-plane UV [0,1]²
 * @param widthWallUnits  Artwork width in wall-plane UV units
 * @param heightWallUnits Artwork height in wall-plane UV units
 */
export function projectArtworkOnWall(
  wallPlane: WallPlane,
  planeCenter: { u: number; v: number },
  widthWallUnits: number,
  heightWallUnits: number,
): Quad {
  const { u, v } = planeCenter;
  const hw = widthWallUnits / 2;
  const hh = heightWallUnits / 2;

  const H = wallHomography(wallPlane);
  const project = (pu: number, pv: number) =>
    applyHomography(H, { x: pu, y: pv });

  return {
    topLeft:     project(u - hw, v - hh),
    topRight:    project(u + hw, v - hh),
    bottomRight: project(u + hw, v + hh),
    bottomLeft:  project(u - hw, v + hh),
  };
}
