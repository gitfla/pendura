import { MAX_IMAGE_DIMENSION, WARN_IMAGE_SIZE_BYTES } from "./constants";

const NEEDS_CONVERSION_TYPES = ["image/heic", "image/heif", ""];

export async function compressImageIfNeeded(file: File): Promise<File> {
  const needsConversion = NEEDS_CONVERSION_TYPES.includes(file.type);
  if (!needsConversion && file.size <= WARN_IMAGE_SIZE_BYTES) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback: return original, let downstream handle error
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.88
      );
    };
    img.src = url;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function cropImageToBlob(
  image: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number
): Promise<Blob> {
  const scaleX = naturalWidth / displayWidth;
  const scaleY = naturalHeight / displayHeight;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropWidth * scaleX);
  canvas.height = Math.round(cropHeight * scaleY);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    cropX * scaleX,
    cropY * scaleY,
    cropWidth * scaleX,
    cropHeight * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create crop blob"));
    }, "image/png");
  });
}
