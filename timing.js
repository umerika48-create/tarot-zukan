// ===== 時期読み データ =====
// 大アルカナ：カードごとの個別の時期感
const TIMING_MAJOR = {
  "m00": { term: "かなり近い", feature: "突然・予想外", place: "旅先での偶然の出会い・新天地" },
  "m01": { term: "1ヶ月前後", feature: "動き始める", place: "仕事関連のセミナーや副業の勉強会" },
  "m02": { term: "2ヶ月前後", feature: "水面下・ゆっくり", place: "SNSやマッチングアプリでのやり取り" },
  "m03": { term: "3ヶ月前後", feature: "恋愛が育つ", place: "職場や友人の紹介、結婚式の二次会" },
  "m04": { term: "4ヶ月前後", feature: "関係が固まる", place: "職場関係や取引先との会食" },
  "m05": { term: "5ヶ月前後", feature: "紹介・正式な関係", place: "婚活サービスや結婚相談所での紹介" },
  "m06": { term: "6ヶ月前後", feature: "恋愛そのものが動く", place: "友人の紹介や合コン・飲み会" },
  "m07": { term: "かなり早い", feature: "一気に進展", place: "スポーツジムや草野球などアクティビティ" },
  "m08": { term: "8ヶ月前後", feature: "徐々に進む", place: "ボランティアや保護犬・保護猫の里親会" },
  "m09": { term: "遅め", feature: "時間をかける", place: "習い事や資格スクール、図書館の読書会" },
  "m10": { term: "時期特定しにくい", feature: "突然タイミングが来る", place: "旅行先や出張先、偶然乗った電車で" },
  "m11": { term: "11月頃・節目", feature: "条件が整う", place: "士業関係の勉強会・セミナー" },
  "m12": { term: "遅延", feature: "すぐには動かない", place: "今の職場やコミュニティで待機中" },
  "m13": { term: "大きな転換後", feature: "過去を終えた後", place: "引っ越し先や転職先の新しい環境" },
  "m14": { term: "ゆっくり", feature: "徐々に自然に", place: "カフェやヨガ・ピラティス教室" },
  "m15": { term: "早め", feature: "強烈な引力・急接近", place: "夜のお店やマッチングアプリの刺激的な相手" },
  "m16": { term: "突然", feature: "予想外の急展開", place: "事故やトラブル対応など突発的なハプニング" },
  "m17": { term: "中長期", feature: "希望が現実化していく", place: "占い・スピリチュアル系の癒しイベント" },
  "m18": { term: "不明瞭", feature: "時期が読みにくい", place: "深夜のSNSやオンライン通話" },
  "m19": { term: "近い", feature: "明確な進展", place: "フェスやBBQなど屋外イベント" },
  "m20": { term: "再始動", feature: "過去の相手・再会も", place: "同窓会での再会" },
  "m21": { term: "ひと区切り", feature: "成就・完成", place: "海外旅行や国際交流イベント" }
};

// 小アルカナ（スート別・数札 A〜10 に適用する一般的な時期感）
const TIMING_SUIT = {
  "wands":     { term: "早い・数週間〜数ヶ月", feature: "動きが早く、勢いよく展開する", place: "スポーツ観戦や趣味のアクティブな集まり" },
  "cups":      { term: "数ヶ月",               feature: "恋愛や気持ちがゆっくり動く", place: "友人の紹介や気の合う集まりの場" },
  "swords":    { term: "急展開・予想外",         feature: "急にタイミングが訪れやすい", place: "SNSでのメッセージのやり取り" },
  "pentacles": { term: "ゆっくり・数ヶ月〜半年以上", feature: "現実的なペースで着実に進む", place: "職場の同僚や取引先など堅実な場" }
};

// 小アルカナ（コートカード：ペイジ／ナイト／クイーン／キング。スートによらず共通）
const TIMING_COURT = {
  11: { label: "ペイジ",   term: "近い・始まり",     feature: "数週間〜3ヶ月", place: "学びの場や学生時代の同級生・後輩" },
  12: { label: "ナイト",   term: "かなり動く",       feature: "数週間〜数ヶ月", place: "合コンや街コンなどアクティブな場" },
  13: { label: "クイーン", term: "ややゆっくり",     feature: "2〜6ヶ月", place: "女子会や趣味のコミュニティなど落ち着いた場" },
  14: { label: "キング",   term: "ある程度時間が必要", feature: "3〜6ヶ月以上", place: "仕事関係の信頼できる紹介" }
};

// 数字の意味（小アルカナ 1〜10）
const TIMING_NUMBER = [
  { num: "1",  meaning: "始まり・可能性の種" },
  { num: "2",  meaning: "選択・バランス・二者の関係" },
  { num: "3",  meaning: "成長・広がり・創造" },
  { num: "4",  meaning: "安定・基盤・停滞のはじまり" },
  { num: "5",  meaning: "変化・試練・揺らぎ" },
  { num: "6",  meaning: "調和・回復・前進" },
  { num: "7",  meaning: "内省・見極め・停滞からの再考" },
  { num: "8",  meaning: "力の集中・鍛錬・動き出し" },
  { num: "9",  meaning: "達成間近・仕上げの手前" },
  { num: "10", meaning: "完成・ひと区切り・次への移行" }
];

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
