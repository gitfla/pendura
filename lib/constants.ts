export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const WARN_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGE_DIMENSION = 4096;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "", // iOS Safari sometimes reports empty type for camera photos
];

export const SHADOW_DEFAULTS = {
  blur: 18,
  opacity: 0.18,
  offsetX: 8,
  offsetY: 10,
};
