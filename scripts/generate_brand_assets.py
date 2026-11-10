"""Render the WorkNest mark into every raster icon the three clients need.

The mark is an ink tile carrying an orange "W" stroke (see frontend/src/components/layout/Logo.jsx
and flutter_app/lib/widgets/logo.dart). One script owns the geometry so the web favicon, the PWA
icons and the Android/iOS launcher icons can never drift apart.

    pip install pillow
    python scripts/generate_brand_assets.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK, ORANGE = (9, 9, 11, 255), (255, 90, 31, 255)
W_POINTS = [(6, 9.5), (10, 19), (14, 12.5), (18, 19), (22, 9.5)]  # in the 28x28 design grid
SS = 4  # supersampling factor for smooth edges


def render(size: int, *, rounded: bool, glyph_scale: float = 1.0, bg=INK) -> Image.Image:
    """`rounded` draws the tile with the logo's corner radius on a transparent canvas; otherwise
    the tile bleeds to the edges (iOS/Android apply their own mask). `glyph_scale` shrinks the W
    inside the tile to respect launcher safe zones."""
    px = size * SS
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, px - 1, px - 1], radius=px * 5 / 28, fill=bg)
    else:
        d.rectangle([0, 0, px, px], fill=bg)

    u = px / 28
    c = 14  # centre of the grid
    pts = [((c + (x - c) * glyph_scale) * u, (c + (y - c) * glyph_scale) * u) for x, y in W_POINTS]
    width = 2.7 * glyph_scale * u
    d.line(pts, fill=ORANGE, width=round(width), joint="curve")
    r = width / 2
    for x, y in (pts[0], pts[-1]):  # round caps
        d.ellipse([x - r, y - r, x + r, y + r], fill=ORANGE)
    return img.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, rel: str, flatten: bool = False) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if flatten:  # App Store icons must not have an alpha channel
        img = img.convert("RGB")
    img.save(path, optimize=True)
    print("wrote", rel)


def main() -> None:
    # --- Web (frontend) --------------------------------------------------------------------
    save(render(32, rounded=True), "frontend/public/favicon-32.png")
    save(render(180, rounded=False, glyph_scale=0.78), "frontend/public/apple-touch-icon.png", flatten=True)
    save(render(192, rounded=True), "frontend/public/icon-192.png")
    save(render(512, rounded=True), "frontend/public/icon-512.png")
    save(render(512, rounded=False, glyph_scale=0.62), "frontend/public/icon-maskable-512.png")

    # --- Flutter web -----------------------------------------------------------------------
    save(render(32, rounded=True), "flutter_app/web/favicon.png")
    save(render(192, rounded=True), "flutter_app/web/icons/Icon-192.png")
    save(render(512, rounded=True), "flutter_app/web/icons/Icon-512.png")
    save(render(192, rounded=False, glyph_scale=0.62), "flutter_app/web/icons/Icon-maskable-192.png")
    save(render(512, rounded=False, glyph_scale=0.62), "flutter_app/web/icons/Icon-maskable-512.png")

    # --- Android launcher (legacy square; the OS masks it) ---------------------------------
    for density, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        save(render(px, rounded=False, glyph_scale=0.78), f"flutter_app/android/app/src/main/res/mipmap-{density}/ic_launcher.png")

    # --- iOS -------------------------------------------------------------------------------
    ios = "flutter_app/ios/Runner/Assets.xcassets/AppIcon.appiconset"
    sizes = {
        "Icon-App-20x20@1x": 20, "Icon-App-20x20@2x": 40, "Icon-App-20x20@3x": 60,
        "Icon-App-29x29@1x": 29, "Icon-App-29x29@2x": 58, "Icon-App-29x29@3x": 87,
        "Icon-App-40x40@1x": 40, "Icon-App-40x40@2x": 80, "Icon-App-40x40@3x": 120,
        "Icon-App-60x60@2x": 120, "Icon-App-60x60@3x": 180,
        "Icon-App-76x76@1x": 76, "Icon-App-76x76@2x": 152, "Icon-App-83.5x83.5@2x": 167,
        "Icon-App-1024x1024@1x": 1024,
    }
    for name, px in sizes.items():
        save(render(px, rounded=False, glyph_scale=0.78), f"{ios}/{name}.png", flatten=True)


if __name__ == "__main__":
    main()
