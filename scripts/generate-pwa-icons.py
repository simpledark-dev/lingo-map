"""Generate PWA icons featuring character 7 (down-facing idle) on a dark
background. Run from repo root: `python3 scripts/generate-pwa-icons.py`.

Crops the 16x32 me-char-07 down-idle frame from public/assets/me-char-atlas.png
(at offset 0,192) and renders it pixelated and centered on a square canvas at
each PWA icon size."""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "public" / "assets" / "me-char-atlas.png"
BG = (26, 26, 46, 255)  # #1a1a2e — matches manifest theme_color

OUTPUTS = [
    (ROOT / "public" / "icon-192.png", 192),
    (ROOT / "public" / "icon-512.png", 512),
    (ROOT / "public" / "apple-touch-icon.png", 180),
]

def main() -> None:
    atlas = Image.open(ATLAS).convert("RGBA")
    # me-char-07 down idle frame: x=0, y=192, w=16, h=32
    char = atlas.crop((0, 192, 16, 224))

    for path, size in OUTPUTS:
        # Pick the largest integer scale that keeps the sprite at ~85% of the
        # icon height. Integer scaling keeps pixel art crisp; nearest-neighbor
        # avoids blurring on upscale.
        target_h = int(size * 0.85)
        scale = max(1, target_h // 32)
        sprite = char.resize((16 * scale, 32 * scale), Image.NEAREST)

        canvas = Image.new("RGBA", (size, size), BG)
        x = (size - sprite.width) // 2
        y = (size - sprite.height) // 2
        canvas.paste(sprite, (x, y), sprite)
        canvas.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({size}x{size}, sprite scale {scale}x)")

if __name__ == "__main__":
    main()
