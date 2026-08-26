#!/usr/bin/env python3
"""Create a multi-resolution .ico icon for Sistemi Genit Windows build."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUT_DIR, exist_ok=True)

# App brand colors (matching the login screen purple theme)
BG_TOP = (94, 53, 177)      # #5E35B1 deep purple
BG_BOTTOM = (74, 20, 140)   # #4A148C darker purple
ACCENT = (255, 255, 255)
LOGO_FILE = os.path.join(OUT_DIR, "logo.png")

# Try to load the existing logo to paste it onto the icon
has_logo = os.path.exists(LOGO_FILE)
if has_logo:
    try:
        logo_img = Image.open(LOGO_FILE).convert("RGBA")
        print(f"Loaded logo: {logo_img.size}")
    except Exception as e:
        print(f"Could not load logo: {e}")
        has_logo = False

def make_icon(size):
    """Create a single icon size with rounded background + logo + 'SG' text."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded-rect gradient background (simulate gradient with rows)
    radius = size // 6
    for y in range(size):
        ratio = y / max(size - 1, 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * ratio)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * ratio)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * ratio)
        for x in range(size):
            # rounded corners check
            xx = x
            yy = y
            in_corner = False
            # top-left
            if xx < radius and yy < radius:
                if (radius - xx) ** 2 + (radius - yy) ** 2 > radius * radius:
                    in_corner = True
            # top-right
            elif xx > size - radius and yy < radius:
                if (xx - (size - radius)) ** 2 + (radius - yy) ** 2 > radius * radius:
                    in_corner = True
            # bottom-left
            elif xx < radius and yy > size - radius:
                if (radius - xx) ** 2 + (yy - (size - radius)) ** 2 > radius * radius:
                    in_corner = True
            # bottom-right
            elif xx > size - radius and yy > size - radius:
                if (xx - (size - radius)) ** 2 + (yy - (size - radius)) ** 2 > radius * radius:
                    in_corner = True
            if not in_corner:
                img.putpixel((x, y), (r, g, b, 255))

    # Paste logo in center if available
    if has_logo:
        logo_size = int(size * 0.62)
        resized_logo = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
        # circular mask for the logo
        mask = Image.new("L", (logo_size, logo_size), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse((0, 0, logo_size - 1, logo_size - 1), fill=255)
        pos = ((size - logo_size) // 2, (size - logo_size) // 2)
        img.paste(resized_logo, pos, mask)

    # Add "SG" monogram text at bottom if logo doesn't show it
    try:
        font_size = max(8, int(size * 0.16))
        # Try common system fonts
        font = None
        for fp in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                   "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                   "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"]:
            if os.path.exists(fp):
                font = ImageFont.truetype(fp, font_size)
                break
        if font is None:
            font = ImageFont.load_default()
        text = "SG"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = (size - tw) // 2 - bbox[0]
        ty = size - int(size * 0.20) - th // 2
        # subtle shadow
        draw.text((tx + 1, ty + 1), text, font=font, fill=(0, 0, 0, 90))
        draw.text((tx, ty), text, font=font, fill=ACCENT + (255,))
    except Exception as e:
        print(f"Text render skipped: {e}")

    return img

# Generate icon sizes
sizes = [256, 128, 64, 48, 32, 16]
icons = [make_icon(s) for s in sizes]

# Save PNG preview
png_path = os.path.join(OUT_DIR, "icon.png")
icons[0].resize((256, 256), Image.LANCZOS).save(png_path)
print(f"Saved preview PNG: {png_path}")

# Save ICO with all sizes
ico_path = os.path.join(OUT_DIR, "icon.ico")
icons[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes], append_images=icons[1:])
print(f"Saved ICO: {ico_path} (sizes: {sizes})")
print("Done.")
