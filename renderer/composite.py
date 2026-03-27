import numpy as np


def alpha_composite(base: np.ndarray, overlay: np.ndarray) -> np.ndarray:
    """Alpha-composite overlay on top of base. Both are RGBA float32 [0,1]."""
    a_o = overlay[:, :, 3:4]
    a_b = base[:, :, 3:4]

    a_out = a_o + a_b * (1 - a_o)
    # Avoid divide-by-zero
    safe = np.where(a_out > 0, a_out, 1)
    rgb_out = (overlay[:, :, :3] * a_o + base[:, :, :3] * a_b * (1 - a_o)) / safe

    result = np.concatenate([rgb_out, a_out], axis=2)
    return result.clip(0, 1)


def composite_layers(
    wall: np.ndarray,
    warped_painting: np.ndarray,
    mask: np.ndarray,
    shadow: np.ndarray,
) -> np.ndarray:
    """
    Composite: wall → shadow → warped painting.
    All inputs are RGBA uint8 (H, W, 4).
    Returns RGBA uint8.
    """
    def to_float(img: np.ndarray) -> np.ndarray:
        return img.astype(np.float32) / 255.0

    def to_uint8(img: np.ndarray) -> np.ndarray:
        return (img * 255).clip(0, 255).astype(np.uint8)

    wall_f = to_float(wall)
    shadow_f = to_float(shadow)
    painting_f = to_float(warped_painting)

    # Ensure wall is fully opaque
    wall_f[:, :, 3] = 1.0

    result = alpha_composite(wall_f, shadow_f)
    result = alpha_composite(result, painting_f)

    return to_uint8(result)
