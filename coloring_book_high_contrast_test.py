from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance

from coloring_book_no_ai import make_coloring_page, save_output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Test coloring-book conversion with max-like brightness/contrast and minimum saturation."
    )
    parser.add_argument(
        "--input",
        default="background_removed/cat1.png",
        help="Input image path. Default: background_removed/cat1.png.",
    )
    parser.add_argument(
        "--output-dir",
        default="output2",
        help="Directory for test outputs. Default: output2.",
    )
    parser.add_argument(
        "--brightness",
        type=float,
        default=2.0,
        help="Brightness factor. 1.0 is original; 2.0 is a strong maximum-style test.",
    )
    parser.add_argument(
        "--contrast",
        type=float,
        default=2.0,
        help="Contrast factor. 1.0 is original; 2.0 is a strong maximum-style test.",
    )
    parser.add_argument(
        "--saturation",
        type=float,
        default=0.0,
        help="Saturation factor. 0.0 removes all color.",
    )
    return parser.parse_args()


def apply_test_adjustments(
    image: Image.Image,
    brightness: float,
    contrast: float,
    saturation: float,
) -> Image.Image:
    adjusted = ImageEnhance.Color(image.convert("RGB")).enhance(saturation)
    adjusted = ImageEnhance.Brightness(adjusted).enhance(brightness)
    adjusted = ImageEnhance.Contrast(adjusted).enhance(contrast)
    return adjusted


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as source:
        adjusted = apply_test_adjustments(
            source,
            brightness=args.brightness,
            contrast=args.contrast,
            saturation=args.saturation,
        )

    adjusted_path = output_dir / "cat1_01_brightness_2_contrast_2_saturation_0.png"
    final_png_path = output_dir / "cat1_02_coloring_page.png"
    final_pdf_path = output_dir / "cat1_03_coloring_page_a4.pdf"

    adjusted.save(adjusted_path)

    coloring_page = make_coloring_page(adjusted)
    save_output(coloring_page, final_png_path, dpi=300)
    save_output(coloring_page, final_pdf_path, dpi=300)

    print(f"Saved: {adjusted_path}")
    print(f"Saved: {final_png_path}")
    print(f"Saved: {final_pdf_path}")


if __name__ == "__main__":
    main()
