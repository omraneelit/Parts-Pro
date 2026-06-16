"""Regenerate Parts Pro app icons / splash / favicon from the brand logo.
Run once: python scripts/gen_assets.py
"""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\DYNABOOK\Downloads\file_000000008c2871f493603e05550e9e4b.png")
OUT = Path(__file__).resolve().parent.parent / "assets" / "images"

logo = Image.open(SRC).convert("RGBA")


def fitted(canvas_size: int, scale: float) -> Image.Image:
    """Logo scaled to `scale` of the canvas, centered, preserving aspect."""
    target = int(canvas_size * scale)
    img = logo.copy()
    img.thumbnail((target, target), Image.LANCZOS)
    x = (canvas_size - img.width) // 2
    y = (canvas_size - img.height) // 2
    return img, (x, y)


def white_to_transparent(img: Image.Image, thresh: int = 238) -> Image.Image:
    img = img.convert("RGBA")
    px = img.getdata()
    out = [
        (r, g, b, 0) if (r >= thresh and g >= thresh and b >= thresh) else (r, g, b, a)
        for (r, g, b, a) in px
    ]
    img.putdata(out)
    return img


def to_monochrome(img: Image.Image, thresh: int = 235) -> Image.Image:
    """Solid black silhouette on transparent (Android themed icon)."""
    img = img.convert("RGBA")
    out = [
        (0, 0, 0, 0) if (r >= thresh and g >= thresh and b >= thresh) else (0, 0, 0, 255)
        for (r, g, b, a) in img.getdata()
    ]
    mono = Image.new("RGBA", img.size)
    mono.putdata(out)
    return mono


def save_centered(name: str, canvas_size: int, scale: float, bg, transform=None):
    canvas = Image.new("RGBA", (canvas_size, canvas_size), bg)
    art = logo if transform is None else transform(logo)
    art = art.copy()
    target = int(canvas_size * scale)
    art.thumbnail((target, target), Image.LANCZOS)
    pos = ((canvas_size - art.width) // 2, (canvas_size - art.height) // 2)
    canvas.alpha_composite(art, pos)
    canvas.save(OUT / name)
    print("wrote", name, canvas.size)


# Main app icon — opaque, near full-bleed on white.
save_centered("icon.png", 1024, 0.94, (255, 255, 255, 255))

# Android adaptive: foreground art (white made transparent) in the safe zone,
# over a solid white background layer.
save_centered("android-icon-foreground.png", 1024, 0.62, (0, 0, 0, 0), white_to_transparent)
Image.new("RGBA", (1024, 1024), (255, 255, 255, 255)).save(OUT / "android-icon-background.png")
print("wrote android-icon-background.png")
save_centered("android-icon-monochrome.png", 1024, 0.62, (0, 0, 0, 0), to_monochrome)

# Splash — transparent logo (white dropped) so it sits on the white splash bg.
save_centered("splash-icon.png", 1024, 0.80, (0, 0, 0, 0), white_to_transparent)

# Web favicon.
save_centered("favicon.png", 96, 0.96, (255, 255, 255, 255))
print("done")
