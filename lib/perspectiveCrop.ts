import PerspT from "perspective-transform";
import type { Quad } from "@/lib/types";

function edgeLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Perspective-crop: given an image and a quad (in display coords),
 * de-warp the quad region into a clean rectangle and return as PNG Blob.
 */
export function perspectiveCropToBlob(
  image: HTMLImageElement,
  quad: Quad,
  displayWidth: number,
  displayHeight: number,
): Promise<{ blob: Blob; aspectRatio: number }> {
  const scaleX = image.naturalWidth / displayWidth;
  const scaleY = image.naturalHeight / displayHeight;

  // Scale quad from display coords to natural image coords
  const natQuad: Quad = {
    topLeft:     { x: quad.topLeft.x * scaleX,     y: quad.topLeft.y * scaleY },
    topRight:    { x: quad.topRight.x * scaleX,     y: quad.topRight.y * scaleY },
    bottomRight: { x: quad.bottomRight.x * scaleX,  y: quad.bottomRight.y * scaleY },
    bottomLeft:  { x: quad.bottomLeft.x * scaleX,   y: quad.bottomLeft.y * scaleY },
  };

  // Output size: average of opposite edge lengths to preserve resolution
  const outW = Math.round(
    (edgeLength(natQuad.topLeft, natQuad.topRight) +
      edgeLength(natQuad.bottomLeft, natQuad.bottomRight)) / 2,
  );
  const outH = Math.round(
    (edgeLength(natQuad.topLeft, natQuad.bottomLeft) +
      edgeLength(natQuad.topRight, natQuad.bottomRight)) / 2,
  );

  // Read source image pixels
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = image.naturalWidth;
  srcCanvas.height = image.naturalHeight;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(image, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
  const src = srcData.data;
  const srcStride = image.naturalWidth * 4;

  // Output canvas
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const dstCtx = dstCanvas.getContext("2d")!;
  const dstImageData = dstCtx.createImageData(outW, outH);
  const dst = dstImageData.data;

  // Inverse mapping: output rect → source quad
  // PerspT(dst, src) maps dst coords → src coords
  const dstPts = [
    0, 0,
    outW, 0,
    outW, outH,
    0, outH,
  ];
  const srcPts = [
    natQuad.topLeft.x, natQuad.topLeft.y,
    natQuad.topRight.x, natQuad.topRight.y,
    natQuad.bottomRight.x, natQuad.bottomRight.y,
    natQuad.bottomLeft.x, natQuad.bottomLeft.y,
  ];
  const perspT = PerspT(dstPts, srcPts);

  const maxSrcX = image.naturalWidth - 1;
  const maxSrcY = image.naturalHeight - 1;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = perspT.transform(x, y);

      if (sx < 0 || sy < 0 || sx >= maxSrcX || sy >= maxSrcY) continue;

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

      const dstIdx = (y * outW + x) * 4;

      for (let c = 0; c < 4; c++) {
        dst[dstIdx + c] = Math.round(
          src[i00 + c] * w00 +
          src[i10 + c] * w10 +
          src[i01 + c] * w01 +
          src[i11 + c] * w11,
        );
      }
    }
  }

  dstCtx.putImageData(dstImageData, 0, 0);

  const aspectRatio = outW / outH;
  return new Promise((resolve, reject) => {
    dstCanvas.toBlob((blob) => {
      if (blob) resolve({ blob, aspectRatio });
      else reject(new Error("Failed to create perspective crop blob"));
    }, "image/png");
  });
}
