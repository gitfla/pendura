import type { Quad } from "@/lib/types";
import { perspectiveWarp } from "./perspectiveWarp";
import { makeShadow, type ShadowConfig } from "./shadow";

export interface RenderPayload {
  quad: Quad;
  shadow?: ShadowConfig;
}

/**
 * Render pipeline: composite a painting onto a wall photo with perspective warp and shadow.
 *
 * 1. Load wall + painting, auto-rotate per EXIF, convert to raw RGBA
 * 2. Perspective-warp painting into the destination quad
 * 3. Generate drop shadow from the warp mask
 * 4. Composite: wall → shadow → warped painting
 * 5. Output PNG buffer
 */
export async function render(
  wallBytes: Buffer,
  paintingBytes: Buffer,
  payload: RenderPayload,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  // Load wall image — auto-rotate via EXIF, get actual dimensions
  const wallInfo = await sharp(wallBytes).rotate().ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const wallW = wallInfo.info.width;
  const wallH = wallInfo.info.height;

  // Load painting — auto-rotate, get raw RGBA pixels for warp
  const paintingRaw = await sharp(paintingBytes).rotate().ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const paintingW = paintingRaw.info.width;
  const paintingH = paintingRaw.info.height;

  // Perspective warp
  const { warped, mask } = perspectiveWarp(
    paintingRaw.data,
    paintingW,
    paintingH,
    payload.quad,
    wallW,
    wallH,
  );

  // Shadow
  const shadowRgba = await makeShadow(mask, wallW, wallH, payload.shadow);

  // Composite: wall → shadow → warped painting
  const result = await sharp(wallBytes)
    .rotate() // auto-rotate wall
    .ensureAlpha()
    .composite([
      {
        input: shadowRgba,
        raw: { width: wallW, height: wallH, channels: 4 },
        top: 0,
        left: 0,
      },
      {
        input: warped,
        raw: { width: wallW, height: wallH, channels: 4 },
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  return result;
}
