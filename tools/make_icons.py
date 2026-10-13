"""단어 3 아이콘 생성기: 단색 배경 위에 카드 3장(흰 막대)을 그린다.
사용법: python3 tools/make_icons.py   (Pillow 필요: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (0, 64, 192)      # 진한 파랑
FG = (255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "icons"


def draw(size, safe=0.0, rounded=True):
    """safe: maskable 아이콘용 여백 비율(가장자리가 잘려도 그림이 남도록)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, size, size], fill=BG)
    inset = size * (0.2 + safe)
    w = size - inset * 2
    gap = w * 0.09
    h = (w - gap * 2) / 3
    for i in range(3):
        top = inset + i * (h + gap)
        d.rounded_rectangle([inset, top, inset + w, top + h], radius=int(h * 0.22), fill=FG)
        # 카드 안의 '글자' 표시 (짧은 막대)
        bar_h = h * 0.22
        bx = inset + w * 0.12
        by = top + h / 2 - bar_h / 2
        d.rounded_rectangle([bx, by, bx + w * (0.55 - i * 0.1), by + bar_h], radius=int(bar_h / 2), fill=BG)
    return img


OUT.mkdir(exist_ok=True)
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, safe=0.08, rounded=False).save(OUT / "icon-maskable-512.png")
draw(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
