"use client";

import PerspT from "perspective-transform";
import { warpPixels } from "./warpCore";
import type { Quad } from "./types";

/**
 * Browser-side perspective warp. Warps a painting ImageData into the
 * destination quad and returns a bounding-box-sized ImageData + its
 * canvas offset (for use with ctx.putImageData(imageData, x, y)).
 *
 * Allocates only the bounding-box region, not the full canvas, to
 * minimize memory churn during interactive dragging on mobile.
 */
export function clientPerspectiveWarp(
  paintingData: ImageData,
  quad: Quad,
  canvasW: number,
  canvasH: number,
): { imageData: ImageData; x: number; y: number } {
  const { width: pw, height: ph } = paintingData;

  const srcPts = [0, 0, pw, 0, pw, ph, 0, ph];
  const dstPts = [
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

  const bboxW = Math.max(1, maxX - minX + 1);
  const bboxH = Math.max(1, maxY - minY + 1);

  // Guard: if the quad is entirely off-canvas, skip warp
  if (minX > maxX || minY > maxY) {
    return { imageData: new ImageData(1, 1), x: 0, y: 0 };
  }

  // Allocate only bounding-box-sized buffer — not full canvas
  const out = new ImageData(bboxW, bboxH);

  warpPixels(
    paintingData.data,
    pw,
    ph,
    perspT,
    out.data,
    bboxW,
    minX,
    minY,
    maxX,
    maxY,
  );

  return { imageData: out, x: minX, y: minY };
}
