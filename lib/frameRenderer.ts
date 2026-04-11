"use client";

import type { FrameStyle } from "./types";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Draw the 4 beveled trapezoid faces of a frame moulding.
 * Each face uses a linear gradient to simulate lighting from top-left.
 */
function drawFrameFaces(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: number, // frame thickness
  colors: {
    topLight: string; topDark: string;
    leftLight: string; leftDark: string;
    rightLight: string; rightDark: string;
    bottomLight: string; bottomDark: string;
  },
) {
  // Top face
  {
    const g = ctx.createLinearGradient(0, 0, 0, f);
    g.addColorStop(0, colors.topLight);
    g.addColorStop(1, colors.topDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w - f, f); ctx.lineTo(f, f);
    ctx.closePath();
    ctx.fill();
  }
  // Bottom face
  {
    const g = ctx.createLinearGradient(0, h - f, 0, h);
    g.addColorStop(0, colors.bottomLight);
    g.addColorStop(1, colors.bottomDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w - f, h - f); ctx.lineTo(f, h - f);
    ctx.closePath();
    ctx.fill();
  }
  // Left face
  {
    const g = ctx.createLinearGradient(0, 0, f, 0);
    g.addColorStop(0, colors.leftLight);
    g.addColorStop(1, colors.leftDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(f, f); ctx.lineTo(f, h - f); ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
  // Right face
  {
    const g = ctx.createLinearGradient(w - f, 0, w, 0);
    g.addColorStop(0, colors.rightLight);
    g.addColorStop(1, colors.rightDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w, 0); ctx.lineTo(w - f, f); ctx.lineTo(w - f, h - f); ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWhiteFrame(ctx: CanvasRenderingContext2D, w: number, h: number, f: number) {
  // Base fill
  ctx.fillStyle = "#ede9e3";
  ctx.fillRect(0, 0, w, h);

  drawFrameFaces(ctx, w, h, f, {
    topLight:    "#f8f5f0",
    topDark:     "#d4cfc8",
    leftLight:   "#f5f2ed",
    leftDark:    "#ccc8c0",
    rightLight:  "#c8c4bc",
    rightDark:   "#b8b4ac",
    bottomLight: "#c0bbb3",
    bottomDark:  "#a8a49c",
  });

  // Thin outer edge
  ctx.strokeStyle = "#b0aca4";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Thin inner shadow line at painting edge
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(f - 0.5, f - 0.5, w - 2 * f + 1, h - 2 * f + 1);
}

function drawBlackFrame(ctx: CanvasRenderingContext2D, w: number, h: number, f: number) {
  // Base fill
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, w, h);

  drawFrameFaces(ctx, w, h, f, {
    topLight:    "#2a2a2a",
    topDark:     "#0d0d0d",
    leftLight:   "#252525",
    leftDark:    "#0a0a0a",
    rightLight:  "#151515",
    rightDark:   "#080808",
    bottomLight: "#0a0a0a",
    bottomDark:  "#050505",
  });

  // Outer edge
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Gold inner liner — 4 filled strips flush against the painting opening (no stroke bleed)
  const linerW = 3;
  ctx.fillStyle = "#c8a96e";
  ctx.fillRect(f - linerW, f - linerW, w - 2 * (f - linerW), linerW); // top
  ctx.fillRect(f - linerW, h - f,       w - 2 * (f - linerW), linerW); // bottom
  ctx.fillRect(f - linerW, f - linerW, linerW, h - 2 * (f - linerW)); // left
  ctx.fillRect(w - f,      f - linerW, linerW, h - 2 * (f - linerW)); // right
}

function drawWoodFrame(ctx: CanvasRenderingContext2D, w: number, h: number, f: number) {
  // Base fill — warm mid-tone walnut
  ctx.fillStyle = "#8b5e3c";
  ctx.fillRect(0, 0, w, h);

  // Wood grain — subtle horizontal/diagonal strokes
  const grainColors = [
    { color: "rgba(164,112,58,0.35)", width: 1.5 },
    { color: "rgba(122,79,45,0.25)", width: 1 },
    { color: "rgba(196,134,74,0.2)", width: 2 },
    { color: "rgba(90,56,28,0.3)", width: 1 },
    { color: "rgba(180,120,60,0.15)", width: 2.5 },
  ];

  // Clip to frame region only (exclude painting opening)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(f, f, w - 2 * f, h - 2 * f); // painting opening cutout
  ctx.clip("evenodd");

  const seed = 42;
  for (let i = 0; i < 28; i++) {
    const grain = grainColors[i % grainColors.length];
    // Pseudo-random y position + slight angle
    const t = ((seed * (i + 1) * 2654435761) >>> 0) / 0xFFFFFFFF;
    const y = t * h;
    const angle = (((seed * (i + 7) * 2246822519) >>> 0) / 0xFFFFFFFF - 0.5) * 0.06;
    ctx.save();
    ctx.translate(0, y);
    ctx.rotate(angle);
    ctx.strokeStyle = grain.color;
    ctx.lineWidth = grain.width;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(w + 10, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Bevel faces in wood tones
  drawFrameFaces(ctx, w, h, f, {
    topLight:    "rgba(196,134,74,0.7)",
    topDark:     "rgba(100,65,30,0.6)",
    leftLight:   "rgba(180,120,60,0.65)",
    leftDark:    "rgba(90,58,28,0.6)",
    rightLight:  "rgba(80,50,22,0.55)",
    rightDark:   "rgba(60,38,16,0.6)",
    bottomLight: "rgba(70,44,20,0.6)",
    bottomDark:  "rgba(50,30,12,0.65)",
  });

  // Outer edge
  ctx.strokeStyle = "#3a2410";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Inner edge
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(f - 0.5, f - 0.5, w - 2 * f + 1, h - 2 * f + 1);
}

/**
 * Apply a frame around the cropped painting and return a new blob + object URL.
 * Returns null for style "none".
 * Always operates on the original croppedPaintingUrl — never on a previously framed image.
 */
export async function applyFrame(
  croppedPaintingUrl: string,
  style: FrameStyle,
): Promise<{ blob: Blob; url: string } | null> {
  if (style === "none") return null;

  const img = await loadImage(croppedPaintingUrl);
  const pw = img.naturalWidth;
  const ph = img.naturalHeight;

  // Frame width: 7% of shorter side, clamped [20, 120]
  const frameSize = Math.round(Math.max(20, Math.min(120, Math.min(pw, ph) * 0.07)));

  const fw = pw + 2 * frameSize;
  const fh = ph + 2 * frameSize;

  const canvas = document.createElement("canvas");
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext("2d")!;

  // Draw the frame
  if (style === "white") drawWhiteFrame(ctx, fw, fh, frameSize);
  else if (style === "black") drawBlackFrame(ctx, fw, fh, frameSize);
  else if (style === "wood") drawWoodFrame(ctx, fw, fh, frameSize);

  // Draw painting into the opening — preserves alpha
  ctx.drawImage(img, frameSize, frameSize, pw, ph);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png"),
  );

  return { blob, url: URL.createObjectURL(blob) };
}
