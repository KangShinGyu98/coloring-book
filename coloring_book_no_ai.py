from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageOps


SUPPORTED_INPUTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SUPPORTED_OUTPUTS = {".png", ".jpg", ".jpeg", ".pdf"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert an image into a printable coloring-book page without AI."
    )
    parser.add_argument("input", help="Input image path.")
    parser.add_argument(
        "-o",
        "--output",
        help="Output file path. Supports PNG, JPG, or PDF. Defaults to outputs/<name>_coloring.png.",
    )
    parser.add_argument(
        "--style",
        default="outline",
        choices=("outline", "detail"),
        help="Conversion style. outline is cleaner; detail keeps more photo texture. Default: outline.",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=25,
        help="Edge threshold from 0 to 255. Lower values create more lines. Default: 25.",
    )
    parser.add_argument(
        "--blur",
        type=float,
        default=5.0,
        help="Preprocessing blur radius. Higher values reduce tiny noise. Default: 5.0.",
    )
    parser.add_argument(
        "--levels",
        type=int,
        default=4,
        help="Brightness levels before edge detection. Lower values create simpler coloring areas. Default: 4.",
    )
    parser.add_argument(
        "--line-width",
        type=int,
        default=2,
        choices=(1, 2, 3),
        help="Line thickness. Default: 2.",
    )
    parser.add_argument(
        "--paper",
        default="a4",
        choices=("a4",),
        help="PDF paper size. Default: a4.",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="PDF output DPI. Default: 300.",
    )
    return parser.parse_args()


def default_output_path(input_path: Path) -> Path:
    return Path("outputs") / f"{input_path.stem}_coloring.png"


def validate_paths(input_path: Path, output_path: Path) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    if input_path.suffix.lower() not in SUPPORTED_INPUTS:
        raise ValueError(f"Unsupported input format: {input_path.suffix}")
    if output_path.suffix.lower() not in SUPPORTED_OUTPUTS:
        raise ValueError(f"Unsupported output format: {output_path.suffix}")


def make_coloring_page(
    image: Image.Image,
    style: str = "outline",
    threshold: int = 25,
    blur: float = 5.0,
    levels: int = 4,
    line_width: int = 2,
) -> Image.Image:
    threshold = max(0, min(255, threshold))

    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)

    if style == "detail":
        line_art = detail_line_art(gray, threshold=threshold, blur=blur)
    else:
        line_art = outline_line_art(
            gray,
            threshold=threshold,
            blur=blur,
            levels=levels,
        )

    line_art = remove_tiny_speckles(line_art)

    if line_width > 1:
        line_art = line_art.filter(ImageFilter.MinFilter(size=(line_width * 2) - 1))

    return line_art.convert("RGB")


def detail_line_art(gray: Image.Image, threshold: int, blur: float) -> Image.Image:
    smoothed = gray.filter(ImageFilter.GaussianBlur(radius=max(0.0, blur)))
    edges = ImageChops.difference(gray, smoothed)
    edges = ImageOps.autocontrast(edges)
    return threshold_to_line_art(edges, threshold)


def outline_line_art(
    gray: Image.Image,
    threshold: int,
    blur: float,
    levels: int,
) -> Image.Image:
    smoothed = gray.filter(ImageFilter.GaussianBlur(radius=max(0.0, blur)))
    gray_array = np.asarray(smoothed, dtype=np.uint8)
    quantized = quantize(gray_array, levels=max(2, min(16, levels)))
    edge_array = sobel_magnitude(quantized)
    return threshold_to_line_art(Image.fromarray(edge_array), threshold)


def threshold_to_line_art(image: Image.Image, threshold: int) -> Image.Image:
    edge_array = np.asarray(image, dtype=np.uint8)
    line_array = np.where(edge_array >= threshold, 0, 255).astype(np.uint8)
    return Image.fromarray(line_array)


def quantize(array: np.ndarray, levels: int) -> np.ndarray:
    step = max(1, 256 // levels)
    return ((array // step) * step).astype(np.uint8)


def sobel_magnitude(array: np.ndarray) -> np.ndarray:
    padded = np.pad(array.astype(np.float32), 1, mode="edge")
    gx = (
        -padded[:-2, :-2]
        + padded[:-2, 2:]
        - (2 * padded[1:-1, :-2])
        + (2 * padded[1:-1, 2:])
        - padded[2:, :-2]
        + padded[2:, 2:]
    )
    gy = (
        -padded[:-2, :-2]
        - (2 * padded[:-2, 1:-1])
        - padded[:-2, 2:]
        + padded[2:, :-2]
        + (2 * padded[2:, 1:-1])
        + padded[2:, 2:]
    )
    magnitude = np.hypot(gx, gy)
    max_value = magnitude.max()
    if max_value == 0:
        return np.zeros_like(array, dtype=np.uint8)
    return np.clip((magnitude / max_value) * 255, 0, 255).astype(np.uint8)


def remove_tiny_speckles(image: Image.Image) -> Image.Image:
    # Median filtering removes isolated dots while preserving most outlines.
    return image.filter(ImageFilter.MedianFilter(size=3))


def fit_to_a4_pdf(image: Image.Image, dpi: int = 300) -> Image.Image:
    width_px = int(8.27 * dpi)
    height_px = int(11.69 * dpi)
    margin_px = int(0.35 * dpi)

    page = Image.new("RGB", (width_px, height_px), "white")
    max_width = width_px - (margin_px * 2)
    max_height = height_px - (margin_px * 2)

    fitted = ImageOps.contain(image, (max_width, max_height))
    x = (width_px - fitted.width) // 2
    y = (height_px - fitted.height) // 2
    page.paste(fitted, (x, y))
    return page


def save_output(image: Image.Image, output_path: Path, dpi: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    suffix = output_path.suffix.lower()
    if suffix == ".pdf":
        page = fit_to_a4_pdf(image, dpi=dpi)
        page.save(output_path, "PDF", resolution=dpi)
        return

    if suffix in {".jpg", ".jpeg"}:
        image.save(output_path, quality=95)
        return

    image.save(output_path)


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else default_output_path(input_path)

    validate_paths(input_path, output_path)

    with Image.open(input_path) as source:
        coloring_page = make_coloring_page(
            source,
            style=args.style,
            threshold=args.threshold,
            blur=args.blur,
            levels=args.levels,
            line_width=args.line_width,
        )

    save_output(coloring_page, output_path, dpi=args.dpi)
    print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
