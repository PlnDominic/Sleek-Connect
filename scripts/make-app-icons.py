"""Draws the app's icon, splash, Android adaptive-icon and notification artwork into apps/mobile/assets.

A placeholder monogram ("SC" on the brand teal) so the stores get real, correctly sized artwork. To use a designed
logo, replace the PNG files in apps/mobile/assets (keep the sizes) and don't re-run this script.

    python3 scripts/make-app-icons.py     # needs Pillow
"""
from PIL import Image, ImageDraw, ImageFont

TEAL = (15, 118, 110)
LIGHT = (95, 194, 184)
WHITE = (255, 255, 255)
FONT = 'node_modules/@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'
OUT = 'apps/mobile/assets/'


def monogram(draw, box, fill, accent=None, ratio=0.43):
    """'SC' centred in box (left, top, right, bottom); ratio is the font size as a share of the box height."""
    left, top, right, bottom = box
    size = int((bottom - top) * ratio)
    font = ImageFont.truetype(FONT, size)
    s_w = draw.textlength('S', font=font)
    c_w = draw.textlength('C', font=font)
    gap = size * 0.02
    total = s_w + gap + c_w
    x = left + ((right - left) - total) / 2
    bbox = font.getbbox('SC')
    y = top + ((bottom - top) - (bbox[3] - bbox[1])) / 2 - bbox[1]
    draw.text((x, y), 'S', font=font, fill=fill)
    draw.text((x + s_w + gap, y), 'C', font=font, fill=accent or fill)


def rounded_tile(size, radius_ratio=0.22):
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=TEAL)
    monogram(draw, (0, 0, size, size), WHITE, LIGHT)
    return image


# iOS icon: full-bleed square, no transparency (the system rounds the corners).
icon = Image.new('RGB', (1024, 1024), TEAL)
monogram(ImageDraw.Draw(icon), (0, 0, 1024, 1024), WHITE, LIGHT)
icon.save(OUT + 'icon.png')

# Splash: the rounded tile on a transparent background (the background colour is set in app.json).
rounded_tile(1024).save(OUT + 'splash-icon.png')
rounded_tile(48).save(OUT + 'favicon.png')

# Android adaptive icon: the monogram stays inside the middle 66% so no launcher mask can cut it off.
fg = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
monogram(ImageDraw.Draw(fg), (86, 86, 426, 426), WHITE, LIGHT, ratio=0.56)
fg.save(OUT + 'android-icon-foreground.png')
Image.new('RGBA', (512, 512), TEAL + (255,)).save(OUT + 'android-icon-background.png')
mono = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
monogram(ImageDraw.Draw(mono), (72, 72, 360, 360), WHITE, None, ratio=0.59)
mono.save(OUT + 'android-icon-monochrome.png')

# Android notification icon: white on transparent, 96 x 96.
note = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
monogram(ImageDraw.Draw(note), (8, 8, 88, 88), WHITE, None, ratio=0.45)
note.save(OUT + 'notification-icon.png')
print('Wrote the app artwork to', OUT)
