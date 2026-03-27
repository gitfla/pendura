import cv2
import numpy as np


def _fix_exif_rotation(img: np.ndarray, path: str) -> np.ndarray:
    """Rotate image to match EXIF orientation tag."""
    try:
        import piexif
        exif = piexif.load(path)
        orientation = exif.get("0th", {}).get(piexif.ImageIFD.Orientation, 1)
    except Exception:
        try:
            # fallback: read orientation via PIL if piexif not available
            from PIL import Image
            with Image.open(path) as pil_img:
                exif_data = pil_img._getexif()  # type: ignore[attr-defined]
                orientation = (exif_data or {}).get(274, 1)
        except Exception:
            return img

    if orientation == 3:
        img = cv2.rotate(img, cv2.ROTATE_180)
    elif orientation == 6:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif orientation == 8:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def load_rgba(path: str) -> np.ndarray:
    """Load an image, correct EXIF rotation, and convert to RGBA (H, W, 4)."""
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"Cannot load image: {path}")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    img = _fix_exif_rotation(img, path)
    return img
