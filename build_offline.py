#!/usr/bin/env python3
"""
オフライン版ビルドスクリプト（占いカード図鑑）
- index.html の <script src> をすべてインライン化
- 各 cards.js 内の img パスを base64 データURIに置換
- Google Fonts の <link> を @font-face（base64埋め込み）に置換
- symbol-notes-snapshot.json があれば、KV(/api/symbol-notes)の編集内容を各カードデータにマージしてから焼き込む
出力: index_offline.html

symbol-notes-snapshot.json の作り方:
  ブラウザで https://tarot-zukan.pages.dev/api/symbol-notes を開き、
  表示されたJSONをそのまま同名ファイルとしてこのフォルダに保存する。
"""
import re
import json
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

# 各ファイルの中の変数名（cards.js: CARDS, marseille_cards.js: MARSEILLE_CARDS, ...）
JS_FILES = [
    ("cards.js", "CARDS"),
    ("marseille_cards.js", "MARSEILLE_CARDS"),
    ("lenormand_cards.js", "LENORMAND_CARDS"),
    ("rune_cards.js", "RUNE_CARDS"),
    ("heart_oracle_cards.js", "HEART_ORACLE_CARDS"),
    ("step_oracle_cards.js", "STEP_ORACLE_CARDS"),
    ("answer_oracle_cards.js", "ANSWER_ORACLE_CARDS"),
]
NON_DATA_JS_FILES = ["spreads.js", "courses.js", "timing.js", "app.js"]

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

def load_symbol_notes():
    path = os.path.join(ROOT, "symbol-notes-snapshot.json")
    if not os.path.exists(path):
        print("symbol-notes-snapshot.json が無いため、KVの編集内容は取り込まずビルドします。")
        return {}
    with open(path, "r", encoding="utf-8") as f:
        notes = json.load(f)
    print(f"symbol-notes-snapshot.json を読み込みました（{len(notes)}件の編集）")
    return notes

def apply_notes_to_cards(cards, notes):
    applied = 0
    by_id = {c["id"]: c for c in cards if "id" in c}
    for key, note in notes.items():
        if ":" not in key:
            continue
        card_id, field = key.split(":", 1)
        card = by_id.get(card_id)
        if not card:
            continue
        if field.isdigit():
            idx = int(field)
            symbols = card.get("symbols") or []
            if 0 <= idx < len(symbols):
                if note.get("title"):
                    symbols[idx]["title"] = note["title"]
                if note.get("text"):
                    symbols[idx]["text"] = note["text"]
                applied += 1
        elif "." in field:
            parts = field.split(".")
            target = card
            ok = True
            for p in parts[:-1]:
                if isinstance(target, dict) and p in target:
                    target = target[p]
                else:
                    ok = False
                    break
            if ok and note.get("text") and isinstance(target, dict):
                target[parts[-1]] = note["text"]
                applied += 1
        else:
            if note.get("text"):
                card[field] = note["text"]
                applied += 1
    return applied

def process_data_js(filename, varname, notes):
    js_text = read(filename)
    m = re.search(r"const " + varname + r" = (\[.*\]);", js_text, re.S)
    if not m:
        print(f"  WARNING: {filename} 内に {varname} が見つかりません。画像インライン化のみ行います。")
        return inline_images_in_js(js_text)
    cards = json.loads(m.group(1))
    applied = apply_notes_to_cards(cards, notes)
    if applied:
        print(f"  {filename}: {applied}件のKV編集をマージしました")
    new_json = json.dumps(cards, ensure_ascii=False)
    js_text = js_text[:m.start(1)] + new_json + js_text[m.end(1):]
    if IMG_PATH_RE.search(js_text):
        print(f"inlining images in {filename} ...")
        js_text = inline_images_in_js(js_text)
    return js_text

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
    notes = load_symbol_notes()

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

    # 2) カードデータ系ファイル：KV編集をマージしてから画像をインライン化
    for filename, varname in JS_FILES:
        js_text = process_data_js(filename, varname, notes)
        tag = f'<script src="{filename}"></script>'
        html = html.replace(tag, f"<script>\n{js_text}\n</script>")

    # 3) それ以外の script src はそのままインライン化
    for jsf in NON_DATA_JS_FILES:
        js_text = read(jsf)
        tag = f'<script src="{jsf}"></script>'
        html = html.replace(tag, f"<script>\n{js_text}\n</script>")

    out_path = os.path.join(ROOT, "index_offline.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"done: {out_path} ({size_mb:.1f} MB)")

if __name__ == "__main__":
    main()

