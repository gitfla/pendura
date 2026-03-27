import cv2
import numpy as np


def make_shadow(mask: np.ndarray, cfg: dict) -> np.ndarray:
    """
    Generate a soft drop shadow from the painting mask.

    Returns an RGBA image (same size as mask) representing the shadow.
    """
    blur = int(cfg.get("blur", 18))
    opacity = float(cfg.get("opacity", 0.18))
    offset_x = int(cfg.get("offsetX", 8))
    offset_y = int(cfg.get("offsetY", 10))

    h, w = mask.shape

    # Shift mask by offset
    shifted = np.zeros_like(mask)
    y_start = max(0, offset_y)
    y_end = min(h, h + offset_y)
    x_start = max(0, offset_x)
    x_end = min(w, w + offset_x)

    src_y_start = max(0, -offset_y)
    src_y_end = src_y_start + (y_end - y_start)
    src_x_start = max(0, -offset_x)
    src_x_end = src_x_start + (x_end - x_start)

    shifted[y_start:y_end, x_start:x_end] = mask[src_y_start:src_y_end, src_x_start:src_x_end]

    # Gaussian blur for softness
    kernel_size = blur * 2 + 1
    blurred = cv2.GaussianBlur(shifted.astype(np.float32), (kernel_size, kernel_size), blur / 3)

    # Scale by opacity
    shadow_alpha = (blurred * opacity).clip(0, 255).astype(np.uint8)

    # Build RGBA shadow (dark color)
    shadow = np.zeros((h, w, 4), dtype=np.uint8)
    shadow[:, :, 0] = 30   # R
    shadow[:, :, 1] = 35   # G
    shadow[:, :, 2] = 32   # B
    shadow[:, :, 3] = shadow_alpha

    return shadow
