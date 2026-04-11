import PerspT from "perspective-transform";
import type { Quad } from "@/lib/types";
import { warpPixels } from "@/lib/warpCore";

export interface WarpResult {
  warped: Buffer; // RGBA raw pixels
  mask: Buffer;   // single-channel alpha
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
  const srcPts: number[] = [0, 0, paintingW, 0, paintingW, paintingH, 0, paintingH];
  const dstPts: number[] = [
    quad.topLeft.x,     quad.topLeft.y,
    quad.topRight.x,    quad.topRight.y,
    quad.bottomRight.x, quad.bottomRight.y,
    quad.bottomLeft.x,  quad.bottomLeft.y,
  ];

  // Inverse mapping: destination pixel → source painting pixel
  const perspT = PerspT(dstPts, srcPts);

  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(canvasW - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(canvasH - 1, Math.ceil(Math.max(...ys)));

  // Server output is full canvas size (for compositing with Sharp)
  const warped = Buffer.alloc(canvasW * canvasH * 4);
  const mask = Buffer.alloc(canvasW * canvasH);

  // Temporary bbox buffer for warpCore (which uses bbox-relative indexing)
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const bboxBuf = new Uint8Array(bboxW * bboxH * 4);

  warpPixels(
    paintingRgba,
    paintingW,
    paintingH,
    perspT,
    bboxBuf,
    bboxW,
    minX,
    minY,
    maxX,
    maxY,
  );

  // Copy bbox buffer into full-canvas warped buffer and build mask
  for (let row = 0; row < bboxH; row++) {
    const canvasY = minY + row;
    for (let col = 0; col < bboxW; col++) {
      const canvasX = minX + col;
      const bboxIdx = (row * bboxW + col) * 4;
      const canvasIdx = (canvasY * canvasW + canvasX) * 4;
      warped[canvasIdx]     = bboxBuf[bboxIdx];
      warped[canvasIdx + 1] = bboxBuf[bboxIdx + 1];
      warped[canvasIdx + 2] = bboxBuf[bboxIdx + 2];
      warped[canvasIdx + 3] = bboxBuf[bboxIdx + 3];
      mask[canvasY * canvasW + canvasX] = bboxBuf[bboxIdx + 3];
    }
  }

  return { warped, mask };
}
