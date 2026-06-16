"""Regenerate Parts Pro app icons / splash / favicon from the brand logo.

The launcher icon uses just the phone-and-wrench MARK (no text) so it stays
crisp at small sizes; the native splash keeps the full logo; the animated splash
hero uses the mark on a white tile.

Run: python scripts/gen_assets.py
"""
from pathlib import Path
from PIL import Image, ImageChops

SRC = Path(r"C:\Users\DYNABOOK\Downloads\file_000000008c2871f493603e05550e9e4b.png")
OUT = Path(__file__).resolve().parent.parent / "assets" / "images"

logo = Image.open(SRC).convert("RGBA")


def extract_mark() -> Image.Image:
    """Crop the phone/gear/wrench mark from the top of the logo (drops the
    'partspro' wordmark), then tightly trim surrounding white."""
    w, h = logo.size
    top = logo.crop((0, 0, w, int(h * 0.60)))
    diff = ImageChops.difference(top.convert("RGB"), Image.new("RGB", top.size, (255, 255, 255)))
    mask = diff.convert("L").point(lambda p: 255 if p > 12 else 0)
    bbox = mask.getbbox()
    return top.crop(bbox) if bbox else top


mark = extract_mark()


def white_to_transparent(img: Image.Image, thresh: int = 238) -> Image.Image:
    img = img.convert("RGBA")
    out = [
        (r, g, b, 0) if (r >= thresh and g >= thresh and b >= thresh) else (r, g, b, a)
        for (r, g, b, a) in img.getdata()
    ]
    img.putdata(out)
    return img


def to_monochrome(img: Image.Image, thresh: int = 235) -> Image.Image:
    img = img.convert("RGBA")
    out = [
        (0, 0, 0, 0) if (r >= thresh and g >= thresh and b >= thresh) else (0, 0, 0, 255)
        for (r, g, b, a) in img.getdata()
    ]
    mono = Image.new("RGBA", img.size)
    mono.putdata(out)
    return mono


def save_centered(name, size, scale, bg, source, transform=None):
    canvas = Image.new("RGBA", (size, size), bg)
    art = (transform(source) if transform else source).copy()
    target = int(size * scale)
    art.thumbnail((target, target), Image.LANCZOS)
    pos = ((size - art.width) // 2, (size - art.height) // 2)
    canvas.alpha_composite(art, pos)
    canvas.save(OUT / name)
    print("wrote", name, canvas.size)


# Launcher icon + adaptive layers + favicon — MARK only (crisp small).
save_centered("icon.png", 1024, 0.80, (255, 255, 255, 255), mark)
save_centered("android-icon-foreground.png", 1024, 0.66, (0, 0, 0, 0), mark, white_to_transparent)
Image.new("RGBA", (1024, 1024), (255, 255, 255, 255)).save(OUT / "android-icon-background.png")
print("wrote android-icon-background.png")
save_centered("android-icon-monochrome.png", 1024, 0.66, (0, 0, 0, 0), mark, to_monochrome)
save_centered("favicon.png", 96, 0.90, (255, 255, 255, 255), mark)

# Native splash — full logo (transparent) on the white splash background.
save_centered("splash-icon.png", 1024, 0.80, (0, 0, 0, 0), logo, white_to_transparent)

# Animated-splash hero — the mark on a white tile (the style rounds the corners).
save_centered("splash-logo.png", 512, 0.74, (255, 255, 255, 255), mark)

print("done")
