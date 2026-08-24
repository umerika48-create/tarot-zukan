// ===== 時期読み データ =====
// 大アルカナ：カードごとの個別の時期感
const TIMING_MAJOR = {
  "m00": { term: "かなり近い", feature: "突然・予想外" },
  "m01": { term: "1ヶ月前後", feature: "動き始める" },
  "m02": { term: "2ヶ月前後", feature: "水面下・ゆっくり" },
  "m03": { term: "3ヶ月前後", feature: "恋愛が育つ" },
  "m04": { term: "4ヶ月前後", feature: "関係が固まる" },
  "m05": { term: "5ヶ月前後", feature: "紹介・正式な関係" },
  "m06": { term: "6ヶ月前後", feature: "恋愛そのものが動く" },
  "m07": { term: "かなり早い", feature: "一気に進展" },
  "m08": { term: "8ヶ月前後", feature: "徐々に進む" },
  "m09": { term: "遅め", feature: "時間をかける" },
  "m10": { term: "時期特定しにくい", feature: "突然タイミングが来る" },
  "m11": { term: "11月頃・節目", feature: "条件が整う" },
  "m12": { term: "遅延", feature: "すぐには動かない" },
  "m13": { term: "大きな転換後", feature: "過去を終えた後" },
  "m14": { term: "ゆっくり", feature: "徐々に自然に" },
  "m15": { term: "早め", feature: "強烈な引力・急接近" },
  "m16": { term: "突然", feature: "予想外の急展開" },
  "m17": { term: "中長期", feature: "希望が現実化していく" },
  "m18": { term: "不明瞭", feature: "時期が読みにくい" },
  "m19": { term: "近い", feature: "明確な進展" },
  "m20": { term: "再始動", feature: "過去の相手・再会も" },
  "m21": { term: "ひと区切り", feature: "成就・完成" }
};

// 小アルカナ（スート別・数札 A〜10 に適用する一般的な時期感）
const TIMING_SUIT = {
  "wands":     { term: "早い・数週間〜数ヶ月", feature: "動きが早く、勢いよく展開する" },
  "cups":      { term: "数ヶ月",               feature: "恋愛や気持ちがゆっくり動く" },
  "swords":    { term: "急展開・予想外",         feature: "急にタイミングが訪れやすい" },
  "pentacles": { term: "ゆっくり・数ヶ月〜半年以上", feature: "現実的なペースで着実に進む" }
};

// 小アルカナ（コートカード：ペイジ／ナイト／クイーン／キング。スートによらず共通）
const TIMING_COURT = {
  11: { label: "ペイジ",   term: "近い・始まり",     feature: "数週間〜3ヶ月" },
  12: { label: "ナイト",   term: "かなり動く",       feature: "数週間〜数ヶ月" },
  13: { label: "クイーン", term: "ややゆっくり",     feature: "2〜6ヶ月" },
  14: { label: "キング",   term: "ある程度時間が必要", feature: "3〜6ヶ月以上" }
};

// カードIDから時期リーディングを取得するヘルパー
function getTiming(card) {
  if (card.arcana === "major") {
    return { type: "major", term: TIMING_MAJOR[card.id].term, feature: TIMING_MAJOR[card.id].feature, label: card.name_jp };
  }
  if (card.number >= 11) {
    const c = TIMING_COURT[card.number];
    return { type: "court", term: c.term, feature: c.feature, label: c.label + "（" + SUIT_LABEL[card.arcana] + "）" };
  }
  const s = TIMING_SUIT[card.arcana];
  return { type: "suit", term: s.term, feature: s.feature, label: SUIT_LABEL[card.arcana] + "全般" };
}
