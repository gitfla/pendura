import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from "./constants";

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "invalidType";
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "tooLarge";
  }
  return null;
}
