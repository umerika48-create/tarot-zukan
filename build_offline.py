#!/usr/bin/env python3
"""
オフライン版ビルドスクリプト（占いカード図鑑）
- index.html の <script src> をすべてインライン化
- 各 cards.js 内の img パスを base64 データURIに置換
- Google Fonts の <link> を @font-face（base64埋め込み）に置換
出力: index_offline.html
"""
import re
import base64
import mimetypes
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with open(os.path.join(ROOT, path), "r", encoding="utf-8") as f:
        return f.read()

def read_bytes(path):
    with open(os.path.join(ROOT, path), "rb") as f:
        return f.read()

def to_data_uri(rel_path):
    mime, _ = mimetypes.guess_type(rel_path)
    mime = mime or "application/octet-stream"
    data = read_bytes(rel_path)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"

JS_FILES = [
    "cards.js", "marseille_cards.js", "lenormand_cards.js", "rune_cards.js",
    "heart_oracle_cards.js", "step_oracle_cards.js", "answer_oracle_cards.js",
    "spreads.js", "courses.js", "timing.js", "app.js",
]

IMG_PATH_RE = re.compile(r'"img":\s*"([^"]+\.(?:jpg|jpeg|png))"')

def inline_images_in_js(js_text):
    def repl(m):
        rel = m.group(1)
        try:
            uri = to_data_uri(rel)
        except FileNotFoundError:
            print(f"  WARNING: image not found: {rel}")
            return m.group(0)
        return f'"img": "{uri}"'
    return IMG_PATH_RE.sub(repl, js_text)

FONT_PACKAGES = {
    "Kosugi Maru": ("@fontsource/kosugi-maru/files/kosugi-maru-japanese-400-normal.woff2", "normal", "400"),
    "DM Sans 400": ("@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2", "normal", "400"),
    "DM Sans 500": ("@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2", "normal", "500"),
    "DM Sans 700": ("@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2", "normal", "700"),
    "DM Mono 400": ("@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2", "normal", "400"),
    "DM Mono 500": ("@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2", "normal", "500"),
}

def build_font_face_css():
    rules = []
    families = {
        "Kosugi Maru": "Kosugi Maru",
        "DM Sans 400": "DM Sans", "DM Sans 500": "DM Sans", "DM Sans 700": "DM Sans",
        "DM Mono 400": "DM Mono", "DM Mono 500": "DM Mono",
    }
    for key, (relpath, style, weight) in FONT_PACKAGES.items():
        fam = families[key]
        node_path = os.path.join(ROOT, "node_modules", relpath)
        if not os.path.exists(node_path):
            print(f"  WARNING: font file missing: {node_path}")
            continue
        with open(node_path, "rb") as f:
            data = f.read()
        b64 = base64.b64encode(data).decode("ascii")
        rules.append(
            f"@font-face {{ font-family: '{fam}'; font-style: {style}; "
            f"font-weight: {weight}; src: url(data:font/woff2;base64,{b64}) format('woff2'); }}"
        )
    return "\n".join(rules)

def main():
    html = read("index.html")

    # 1) Google Fonts link を @font-face に置換
    font_css = build_font_face_css()
    html = re.sub(
        r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\s*\n?',
        "", html
    )
    html = re.sub(
        r'<link href="https://fonts\.googleapis\.com/css2\?[^"]+" rel="stylesheet">',
        f"<style>\n{font_css}\n</style>", html
    )

    # 2) 各 script src をインライン化（画像はcards.js系のみ置換対象）
    for jsf in JS_FILES:
        js_text = read(jsf)
        if IMG_PATH_RE.search(js_text):
            print(f"inlining images in {jsf} ...")
            js_text = inline_images_in_js(js_text)
        tag = f'<script src="{jsf}"></script>'
        html = html.replace(tag, f"<script>\n{js_text}\n</script>")

    out_path = os.path.join(ROOT, "index_offline.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"done: {out_path} ({size_mb:.1f} MB)")

if __name__ == "__main__":
    main()
