#!/usr/bin/env python3
"""stand.fm 番組「丸暗記しないタロット入門」の回ごとのカバー画像を作る。

使い方（リポジトリのルートで）:
  python3 radio_cover/make_cover.py m01                 # 第2回（魔術師）→ radio_cover/out/m01.png
  python3 radio_cover/make_cover.py m02 --upload        # 作って、アプリの「ラジオ」にも登録
  python3 radio_cover/make_cover.py m00 --out /tmp/x.png

card_id は cards.js の id（大アルカナ m00〜m21）。カード画像は images/<card_id>.jpg を使う。
必要: pip install pillow（--upload には curl）
絵柄は base_clean.png（元のテンプレートからカードと日本語を消したもの）の上に、
白いラベル「現役占い師と学ぶ」・タイトル・サブタイトル・カード・キラキラを重ねている。
"""
import argparse, math, os, subprocess, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/mplusrounded1c/MPLUSRounded1c-Bold.ttf"
FONT = os.path.join(HERE, "fonts", "MPLUSRounded1c-Bold.ttf")
APP = "https://tarot-zukan.pages.dev"

# --- 文字（変えるときはここ） ---
PILL_TEXT = "現役占い師と学ぶ"
TITLE = "丸暗記しないタロット入門"
SUB = "（愚者の旅で読む大アルカナ）"

def ensure_font():
    if not os.path.exists(FONT):
        os.makedirs(os.path.dirname(FONT), exist_ok=True)
        urllib.request.urlretrieve(FONT_URL, FONT)

def width(t, f, sp):
    return sum(f.getlength(c) + sp for c in t) - sp

CARD_H = 370          # カードの高さ（1080px基準）。大きくするときはここ
CARD_CX, CARD_CY = 285, 456   # カードの中心位置（1080px基準）

def build(card_id, card_h=None, cx=None, cy=None):
    ensure_font()
    base = Image.open(os.path.join(HERE, "base_clean.png")).convert("RGBA")
    # --- 文字 ---
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0)); tx = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh); dt = ImageDraw.Draw(tx)
    f1 = ImageFont.truetype(FONT, 40); w = width(PILL_TEXT, f1, 3)
    px, py, ph = 58, 836, 62
    pill = (px, py, px + w + 56, py + ph)
    ds.rounded_rectangle((pill[0], pill[1] + 4, pill[2], pill[3] + 4), radius=31, fill=(150, 30, 80, 110))
    dt.rounded_rectangle(pill, radius=31, fill=(255, 255, 255, 255))
    x = px + 28
    for ch in PILL_TEXT:
        dt.text((x, py + ph / 2 + 1), ch, font=f1, fill=(222, 52, 108, 255), anchor="lm"); x += f1.getlength(ch) + 3
    f2 = ImageFont.truetype(FONT, 78)   # タイトル（12文字で右端に収まる大きさ。文字数が増えたら小さくする）
    x = 58
    for ch in TITLE:
        ds.text((x, 959), ch, font=f2, fill=(150, 30, 80, 140), anchor="lm"); dt.text((x, 954), ch, font=f2, fill="white", anchor="lm"); x += f2.getlength(ch) - 1
    f3 = ImageFont.truetype(FONT, 44)
    x = 50
    for ch in SUB:
        ds.text((x, 1027), ch, font=f3, fill=(150, 30, 80, 120), anchor="lm"); dt.text((x, 1024), ch, font=f3, fill="white", anchor="lm"); x += f3.getlength(ch) + 2
    sh = sh.filter(ImageFilter.GaussianBlur(3.5))
    res = Image.alpha_composite(Image.alpha_composite(base, sh), tx)
    # --- カード（白い縁・角丸・5度傾け・影） ---
    cp = os.path.join(ROOT, "images", card_id + ".jpg")
    if not os.path.exists(cp):
        sys.exit("カード画像が見つかりません: " + cp)
    H = card_h or CARD_H; card = Image.open(cp).convert("RGB"); W = int(card.size[0] * H / card.size[1])
    card = card.resize((W, H), Image.LANCZOS).convert("RGBA")
    rm = Image.new("L", (W, H), 0); ImageDraw.Draw(rm).rounded_rectangle((0, 0, W - 1, H - 1), radius=12, fill=255); card.putalpha(rm)
    pad = 7; bordered = Image.new("RGBA", (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    bm = Image.new("L", bordered.size, 0); ImageDraw.Draw(bm).rounded_rectangle((0, 0, bordered.size[0] - 1, bordered.size[1] - 1), radius=16, fill=255)
    white = Image.new("RGBA", bordered.size, (255, 255, 255, 255)); white.putalpha(bm)
    bordered.alpha_composite(white); bordered.alpha_composite(card, (pad, pad))
    rot = bordered.rotate(5, expand=True, resample=Image.BICUBIC)
    pos = ((cx or CARD_CX) - rot.size[0] // 2, (cy or CARD_CY) - rot.size[1] // 2)
    shl = Image.new("RGBA", res.size, (0, 0, 0, 0))
    shd = Image.new("RGBA", rot.size, (120, 20, 70, 255)); shd.putalpha(rot.split()[3].point(lambda v: int(v * 0.45)))
    shl.alpha_composite(shd, (pos[0] + 6, pos[1] + 10)); shl = shl.filter(ImageFilter.GaussianBlur(9))
    res = Image.alpha_composite(res, shl); res.alpha_composite(rot, pos)
    # --- キラキラ ---
    def sparkle(cx, cy, r, col=(252, 200, 50)):
        S = 4; w = int(2 * r * S) + 8
        im = Image.new("RGBA", (w, w), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = w / 2; pts = []
        for k in range(8):
            a = math.pi / 2 * (k / 2) - math.pi / 2; rr = r * S if k % 2 == 0 else r * S * 0.28
            pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))
        d.polygon(pts, fill=col + (255,)); im = im.resize((w // S, w // S), Image.LANCZOS)
        res.alpha_composite(im, (int(cx - im.size[0] / 2), int(cy - im.size[1] / 2)))
    for (x, y, r) in [(135, 300, 30), (95, 400, 17), (445, 318, 18), (460, 585, 34), (432, 440, 14), (120, 640, 16)]:
        sparkle(x, y, r)
    return res.convert("RGB").resize((1400, 1400), Image.LANCZOS)   # アプリの推奨サイズ

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("card_id"); ap.add_argument("--out"); ap.add_argument("--card-h", type=int); ap.add_argument("--cx", type=int); ap.add_argument("--cy", type=int); ap.add_argument("--upload", action="store_true")
    a = ap.parse_args()
    out = a.out or os.path.join(HERE, "out", a.card_id + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    build(a.card_id, a.card_h, a.cx, a.cy).save(out); print("作成:", out)
    if a.upload:
        name = urllib.parse.quote(os.path.basename(out))
        r = subprocess.run(["curl", "-sS", "-m", "90", "-X", "POST", f"{APP}/api/radio-covers?id={a.card_id}",
                            "-H", "Content-Type: image/png", "-H", "X-File-Name: " + name, "--data-binary", "@" + out],
                           capture_output=True, text=True)
        print("アップロード結果:", r.stdout or r.stderr)

if __name__ == "__main__":
    main()
