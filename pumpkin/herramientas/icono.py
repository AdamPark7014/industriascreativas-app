"""Ícono de la app PUMPKIN (calabaza naranja sobre fondo oscuro) para el manifest."""
import sys
from PIL import Image, ImageDraw

def icono(lado: int) -> Image.Image:
    esc = 4
    L = lado * esc
    im = Image.new("RGB", (L, L), (28, 16, 9))
    d = ImageDraw.Draw(im)
    cx, cy, r = L / 2, L * 0.56, L * 0.30
    for dx, tono in ((-0.42, (217, 90, 16)), (0.42, (217, 90, 16)), (-0.2, (242, 107, 29)), (0.2, (242, 107, 29)), (0, (255, 140, 60))):
        x = cx + dx * r
        d.ellipse([x - r * 0.62, cy - r * 0.86, x + r * 0.62, cy + r * 0.86], fill=tono)
    d.rounded_rectangle([cx - L * 0.025, cy - r * 1.18, cx + L * 0.03, cy - r * 0.72], radius=L * 0.02, fill=(74, 122, 42))
    return im.resize((lado, lado), Image.LANCZOS)

for lado in (192, 512):
    icono(lado).save(f"{sys.argv[1]}/icon-{lado}.png", optimize=True)
