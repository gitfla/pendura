#!/usr/bin/env python3
"""
Pendura renderer — main entry point.
Usage: python3 main.py <wall_path> <painting_path> <output_path> <payload_json>
"""

import sys
import json
import cv2

from utils import load_rgba
from warp import warp_painting
from shadow import make_shadow
from composite import composite_layers


def main():
    if len(sys.argv) < 5:
        print("Usage: main.py <wall> <painting> <output> <payload_json>", file=sys.stderr)
        sys.exit(1)

    wall_path, painting_path, output_path, payload_json = sys.argv[1:5]

    payload = json.loads(payload_json)
    quad = payload["quad"]
    shadow_cfg = payload.get("shadow") or {}

    wall = load_rgba(wall_path)
    painting = load_rgba(painting_path)

    h, w = wall.shape[:2]
    print(f"[renderer] wall size: {w}x{h}", file=sys.stderr)
    print(f"[renderer] painting size: {painting.shape[1]}x{painting.shape[0]}", file=sys.stderr)
    print(f"[renderer] quad received: {quad}", file=sys.stderr)

    # Convert quad from dict to numpy array (in wall image pixel coordinates)
    dst_pts = [
        [quad["topLeft"]["x"], quad["topLeft"]["y"]],
        [quad["topRight"]["x"], quad["topRight"]["y"]],
        [quad["bottomRight"]["x"], quad["bottomRight"]["y"]],
        [quad["bottomLeft"]["x"], quad["bottomLeft"]["y"]],
    ]

    warped, mask = warp_painting(painting, dst_pts, w, h)
    shadow = make_shadow(mask, shadow_cfg)
    result = composite_layers(wall, warped, mask, shadow)

    cv2.imwrite(output_path, cv2.cvtColor(result, cv2.COLOR_RGBA2BGRA))
    print(f"Rendered to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
