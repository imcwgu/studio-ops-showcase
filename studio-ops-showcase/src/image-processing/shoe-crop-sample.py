"""
shoe-crop-sample.py
-------------------------------------------------------------------------------
Illustrative excerpt from a Python image-processing service that standardizes
catalog crops for footwear. This is a sanitized public version: production
folder paths, model weights, and category-specific tuning constants have been
replaced or generalized.

The full production pipeline:
  1. Watches a sync folder for new TIFFs
  2. Classifies the shoe orientation (left/right/pair, side/top/three-quarter)
  3. Detects the shoe boundary using a category-specific segmentation model
  4. Computes a target crop based on orientation and category rules
  5. Writes the cropped output and a metadata sidecar

This file shows the segmentation-and-crop logic in isolation, using the
classical OpenCV route. The production version uses a small trained model
for the boundary detection step; the rest of the pipeline is the same.

Stack: Python 3.11, OpenCV 4.x, NumPy, Pillow.
-------------------------------------------------------------------------------
"""

import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


logger = logging.getLogger(__name__)


# =====================================================================
# Configuration
# =====================================================================

INPUT_DIR = Path("/path/to/working/folder/raw")
OUTPUT_DIR = Path("/path/to/working/folder/cropped")

# Category-specific crop padding (fraction of the shoe's bounding box).
# These values were tuned by reviewing ~200 production crops and asking the
# studio's senior retoucher which ones looked correctly composed.
CATEGORY_PADDING = {
    "sneaker": {"top": 0.12, "bottom": 0.10, "left": 0.08, "right": 0.08},
    "boot":    {"top": 0.08, "bottom": 0.08, "left": 0.10, "right": 0.10},
    "sandal":  {"top": 0.15, "bottom": 0.12, "left": 0.12, "right": 0.12},
    "default": {"top": 0.10, "bottom": 0.10, "left": 0.10, "right": 0.10},
}

# Output canvas. Catalog convention is square at 2000 px.
OUTPUT_SIZE = (2000, 2000)


# =====================================================================
# Data structures
# =====================================================================

@dataclass
class ShoeBoundary:
    """Tight bounding box around the shoe in image coordinates."""
    x: int
    y: int
    w: int
    h: int

    def expanded(self, padding: dict, image_w: int, image_h: int) -> "ShoeBoundary":
        """Return a new boundary expanded by category-specific padding."""
        pad_top = int(self.h * padding["top"])
        pad_bottom = int(self.h * padding["bottom"])
        pad_left = int(self.w * padding["left"])
        pad_right = int(self.w * padding["right"])

        new_x = max(0, self.x - pad_left)
        new_y = max(0, self.y - pad_top)
        new_w = min(image_w - new_x, self.w + pad_left + pad_right)
        new_h = min(image_h - new_y, self.h + pad_top + pad_bottom)

        return ShoeBoundary(new_x, new_y, new_w, new_h)


# =====================================================================
# Shoe boundary detection
# =====================================================================
# In production, this step uses a small trained segmentation model. The
# classical approach below works for ~85% of catalog images (white seamless
# background, single shoe). Items with shadow, multiple shoes, or coloured
# backgrounds need the trained model.

def detect_shoe_boundary_classical(bgr_image: np.ndarray) -> ShoeBoundary | None:
    """
    Find the shoe boundary using background subtraction.
    Assumes a light, near-uniform background.
    """
    gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)

    # Threshold to separate foreground from light background.
    # OTSU adapts to the actual lighting of the shot.
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Clean up speckle and small holes.
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # Find the largest connected component that is plausibly the shoe.
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)

    # Reject if the largest contour is implausibly small or large.
    image_area = bgr_image.shape[0] * bgr_image.shape[1]
    if area < image_area * 0.02 or area > image_area * 0.85:
        return None

    x, y, w, h = cv2.boundingRect(largest)
    return ShoeBoundary(x, y, w, h)


# =====================================================================
# Crop and canvas placement
# =====================================================================

def crop_and_center(bgr_image: np.ndarray, boundary: ShoeBoundary,
                    output_size: tuple[int, int]) -> np.ndarray:
    """
    Crop to the boundary, then place on a centered white canvas at output_size.
    Aspect ratio is preserved; the shoe is fitted into the canvas with margin.
    """
    cropped = bgr_image[boundary.y:boundary.y + boundary.h,
                        boundary.x:boundary.x + boundary.w]

    out_w, out_h = output_size
    canvas = np.full((out_h, out_w, 3), 255, dtype=np.uint8)  # white background

    # Scale to fit, preserving aspect.
    src_h, src_w = cropped.shape[:2]
    scale = min(out_w / src_w, out_h / src_h) * 0.92  # 0.92 leaves a small margin
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    # Center on canvas.
    x_offset = (out_w - new_w) // 2
    y_offset = (out_h - new_h) // 2
    canvas[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized

    return canvas


# =====================================================================
# Pipeline entry point
# =====================================================================

def process_image(input_path: Path, category: str, output_path: Path) -> bool:
    """
    Run the full crop pipeline for a single image.
    Returns True on success, False if the image needs manual review.
    """
    bgr = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
    if bgr is None:
        logger.error(f"Could not read image: {input_path}")
        return False

    boundary = detect_shoe_boundary_classical(bgr)
    if boundary is None:
        logger.warning(f"Could not detect shoe boundary: {input_path.name} "
                       f"— flag for manual review")
        return False

    padding = CATEGORY_PADDING.get(category, CATEGORY_PADDING["default"])
    expanded = boundary.expanded(padding, bgr.shape[1], bgr.shape[0])
    output = crop_and_center(bgr, expanded, OUTPUT_SIZE)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    logger.info(f"Wrote {output_path.name} (category={category})")
    return True


if __name__ == "__main__":
    # Minimal CLI for ad-hoc runs. Production uses a folder-watch loop.
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--category", default="default",
                        choices=list(CATEGORY_PADDING.keys()))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    success = process_image(args.input, args.category, args.output)
    raise SystemExit(0 if success else 1)
