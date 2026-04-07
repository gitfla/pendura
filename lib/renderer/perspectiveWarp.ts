import PerspT from "perspective-transform";
import type { Quad } from "@/lib/types";

export interface WarpResult {
  warped: Buffer; // RGBA raw pixels
  mask: Buffer; // single-channel alpha
}

/**
 * Perspective-warp a painting into the destination quad on a canvas of the given size.
 *
 * Uses inverse mapping: for each pixel inside the destination quad's bounding box,
 * map back to source painting coordinates and bilinear-interpolate.
 */
export function perspectiveWarp(
  paintingRgba: Buffer,
  paintingW: number,
  paintingH: number,
  quad: Quad,
  canvasW: number,
  canvasH: number,
): WarpResult {
  // Source corners: full painting rectangle
  // perspective-transform expects flat arrays: [x0,y0, x1,y1, x2,y2, x3,y3]
  const srcPts: number[] = [
    0, 0,
    paintingW, 0,
    paintingW, paintingH,
    0, paintingH,
  ];

  const dstPts: number[] = [
    quad.topLeft.x, quad.topLeft.y,
    quad.topRight.x, quad.topRight.y,
    quad.bottomRight.x, quad.bottomRight.y,
    quad.bottomLeft.x, quad.bottomLeft.y,
  ];

  // Compute the perspective transform (dst → src for inverse mapping)
  const perspT = PerspT(dstPts, srcPts);

  // Bounding box of destination quad
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(canvasW - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(canvasH - 1, Math.ceil(Math.max(...ys)));

  // Allocate output buffers
  const warpedSize = canvasW * canvasH * 4;
  const warped = Buffer.alloc(warpedSize);
  const mask = Buffer.alloc(canvasW * canvasH);

  const srcStride = paintingW * 4;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Map destination pixel back to source painting coords
      const [sx, sy] = perspT.transform(x, y);

      // Check bounds (with a small margin for interpolation)
      if (sx < 0 || sy < 0 || sx >= paintingW - 1 || sy >= paintingH - 1) {
        continue;
      }

      // Bilinear interpolation
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = sx - x0;
      const fy = sy - y0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = y0 * srcStride + x0 * 4;
      const i10 = y0 * srcStride + x1 * 4;
      const i01 = y1 * srcStride + x0 * 4;
      const i11 = y1 * srcStride + x1 * 4;

      const dstIdx = (y * canvasW + x) * 4;

      for (let c = 0; c < 4; c++) {
        warped[dstIdx + c] = Math.round(
          paintingRgba[i00 + c] * w00 +
          paintingRgba[i10 + c] * w10 +
          paintingRgba[i01 + c] * w01 +
          paintingRgba[i11 + c] * w11,
        );
      }

      mask[y * canvasW + x] = warped[dstIdx + 3]; // alpha channel
    }
  }

  return { warped, mask };
}
