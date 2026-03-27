import cv2
import numpy as np
from typing import Tuple


def warp_painting(
    painting: np.ndarray,
    dst_pts: list,
    canvas_w: int,
    canvas_h: int,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Perspective-warp the painting into the destination quad.

    Returns:
        warped: RGBA image (canvas_h, canvas_w, 4)
        mask:   single-channel alpha mask (canvas_h, canvas_w)
    """
    ph, pw = painting.shape[:2]

    src_pts = np.float32([
        [0, 0],
        [pw, 0],
        [pw, ph],
        [0, ph],
    ])
    dst = np.float32(dst_pts)

    M = cv2.getPerspectiveTransform(src_pts, dst)

    warped = cv2.warpPerspective(
        painting,
        M,
        (canvas_w, canvas_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )

    # Build mask from warped alpha channel
    mask = warped[:, :, 3].copy()

    return warped, mask
