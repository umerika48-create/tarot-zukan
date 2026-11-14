#!/usr/bin/env python3
"""スート紹介回（i-w / i-c / i-s / i-p）用の画像を作る。
そのスートの エース・5・8・10 の4枚を、2×2に並べた1枚の画像（images/intro_<w|c|s|p>.jpg）。
アプリのラジオの左の絵と、カバー画像（make_cover.py）の両方で使う。

使い方（リポジトリのルートで）:  python3 radio_cover/make_intro_images.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NUMS = ["01", "05", "08", "10"]
GAP = 12

for s in "wcsp":
    cards = [Image.open(os.path.join(ROOT, "images", f"{s}{n}.jpg")).convert("RGB") for n in NUMS]
    cw, ch = cards[0].size
    out = Image.new("RGB", (cw * 2 + GAP * 3, ch * 2 + GAP * 3), (255, 255, 255))
    for k, c in enumerate(cards):
        r, q = divmod(k, 2)
        out.paste(c.resize((cw, ch), Image.LANCZOS), (GAP + q * (cw + GAP), GAP + r * (ch + GAP)))
    p = os.path.join(ROOT, "images", f"intro_{s}.jpg")
    out.save(p, quality=92)
    print("作成:", p, out.size)
