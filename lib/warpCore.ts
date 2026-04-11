/**
 * Shared perspective warp pixel loop — no browser or Node.js dependencies.
 * Used by both the server-side renderer (perspectiveWarp.ts) and the
 * browser-side preview (clientWarp.ts).
 *
 * Performs inverse mapping: for each destination pixel inside the bounding
 * box [minX..maxX, minY..maxY], maps back to source painting coordinates via
 * the perspective transform, then bilinear-interpolates from the source pixels.
 *
 * @param src         Raw RGBA pixels of the source painting (flat array)
 * @param srcW        Source painting width in pixels
 * @param srcH        Source painting height in pixels
 * @param perspT      Perspective transform object with a .transform(x, y) method
 *                    (result of PerspT(dstPts, srcPts) — inverse mapping)
 * @param outBuf      Output RGBA buffer (flat array), must be bboxW * bboxH * 4 bytes
 * @param bboxW       Width of the bounding box (maxX - minX + 1)
 * @param minX        Left edge of destination bounding box (canvas coords)
 * @param minY        Top edge of destination bounding box (canvas coords)
 * @param maxX        Right edge of destination bounding box (canvas coords)
 * @param maxY        Bottom edge of destination bounding box (canvas coords)
 */
export function warpPixels(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  perspT: { transform: (x: number, y: number) => [number, number] },
  outBuf: Uint8Array | Uint8ClampedArray,
  bboxW: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const srcStride = srcW * 4;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const [sx, sy] = perspT.transform(x, y);

      // Skip pixels outside the source image (with margin for interpolation)
      if (sx < 0 || sy < 0 || sx >= srcW - 1 || sy >= srcH - 1) continue;

      // Bilinear interpolation
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = y0 * srcStride + x0 * 4;
      const i10 = y0 * srcStride + (x0 + 1) * 4;
      const i01 = (y0 + 1) * srcStride + x0 * 4;
      const i11 = (y0 + 1) * srcStride + (x0 + 1) * 4;

      // Output index is relative to the bounding box top-left, not the full canvas
      const outIdx = ((y - minY) * bboxW + (x - minX)) * 4;

      for (let c = 0; c < 4; c++) {
        outBuf[outIdx + c] = Math.round(
          src[i00 + c] * w00 +
          src[i10 + c] * w10 +
          src[i01 + c] * w01 +
          src[i11 + c] * w11,
        );
      }
    }
  }
}
