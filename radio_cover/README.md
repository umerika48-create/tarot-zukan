# ラジオのカバー画像メーカー

stand.fm番組「丸暗記しないタロット入門」の、回ごとのカバー画像（1400×1400 PNG）を作るスクリプト。

```
python3 radio_cover/make_cover.py m02            # 第3回（女帝）→ radio_cover/out/m02.png
python3 radio_cover/make_cover.py m02 --upload   # 作って、アプリの「ラジオ」にも登録
```

- `m02` は cards.js のカードID（大アルカナ m00〜m21）。カード画像は `images/<ID>.jpg` を使う
- 必要なもの：Python 3 と Pillow。--upload には curl
- フォント（M PLUS Rounded 1c Bold）は初回に自動でダウンロード（`radio_cover/fonts/`、git管理外）
- `base_clean.png`：元のテンプレート画像から、カードと日本語の文字を消した土台（天使・TAROT READING・英語の文字は残してある）
- 文字を変えたいときは make_cover.py の先頭の PILL_TEXT / TITLE / SUB を直す（タイトルは12文字で右端ぎりぎり。増えたらフォントサイズ78を下げる）
- 既に登録済みの回に --upload すると、画像が差し替わる
- 注意：images/ のRWS画像には「© 1971 U.S. Games」の表記が入っている。公開前に、パブリックドメインの画像への差し替えを検討する
