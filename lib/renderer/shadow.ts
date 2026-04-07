import { SHADOW_DEFAULTS } from "@/lib/constants";

export interface ShadowConfig {
  blur?: number;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Generate a soft drop shadow from the painting alpha mask.
 * Returns an RGBA buffer (same canvas dimensions) representing the shadow.
 */
export async function makeShadow(
  mask: Buffer,
  width: number,
  height: number,
  cfg: ShadowConfig = {},
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  const blur = cfg.blur ?? SHADOW_DEFAULTS.blur;
  const opacity = cfg.opacity ?? SHADOW_DEFAULTS.opacity;
  const offsetX = cfg.offsetX ?? SHADOW_DEFAULTS.offsetX;
  const offsetY = cfg.offsetY ?? SHADOW_DEFAULTS.offsetY;

  // Shift mask by offset
  const shifted = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    const srcY = y - offsetY;
    if (srcY < 0 || srcY >= height) continue;
    for (let x = 0; x < width; x++) {
      const srcX = x - offsetX;
      if (srcX < 0 || srcX >= width) continue;
      shifted[y * width + x] = mask[srcY * width + srcX];
    }
  }

  // Gaussian blur via sharp
  const sigma = Math.max(0.3, blur / 3);
  const blurred = await sharp(shifted, { raw: { width, height, channels: 1 } })
    .blur(sigma)
    .raw()
    .toBuffer();

  // Build RGBA shadow: dark color (30, 35, 32) with blurred alpha scaled by opacity
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 0] = 30;
    rgba[i * 4 + 1] = 35;
    rgba[i * 4 + 2] = 32;
    rgba[i * 4 + 3] = Math.round(blurred[i] * opacity);
  }

  return rgba;
}
