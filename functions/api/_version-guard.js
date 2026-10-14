// 図鑑全体の「更新番号」をまとめて確認・更新するための共通ヘルパー。
// 複数端末で同時に開いたときに、古い画面のまま保存して上書きしてしまう事故を防ぐための
// 仕組み(cafe-kai-kanriの/api/version・checkVersionStaleness・STALE_SCREEN・SAVE_IN_FLIGHTと
// 同じ考え方)を、図鑑の7つの保存API（symbol-notes/added-symbols/memos/diamond-notes/
// context-notes/courses/course-row-memos）で共通に使うためのもの。
//
// ⚠️ このファイルは onRequestGet / onRequestPost をexportしていないため、
// /api/_version-guard のようなURLとしては公開されない(アクセスされてもハンドラが無く404になる)。
//
// キー名は既存の7つのデータキー(symbol-notes, added-symbols, card-memos, card-diamond-notes,
// card-context-notes, courses-data, course-row-memos)とは別の "zukan-version" を使う。
//
// ⚠️ 既知の限界：KVは「読んでから書く」の間に別の保存が入り込む可能性が残るため、
// 完全な排他制御にはならない(ごく短い時間差で両方の保存が「自分が最新」と思い込む
// ケースは理論上残る)。ここで防いでいるのは、それより頻度の高い「古い画面を長時間
// 開きっぱなしにしたまま保存して上書きする」事故。

const VERSION_KEY = "zukan-version";

export function makeVersion() {
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// 保存の直前に呼ぶ。
// - X-Zukan-Version ヘッダーが無い場合 → これまで通り保存を許可する(古い画面や
//   Claudeチャットなどヘッダーを付けずに呼んでいる既存の呼び出しを壊さないため)。
// - ヘッダーがあり、サーバーの番号と違う場合 → conflict:true を返す(呼び出し側は
//   保存せずに409を返す)。
export async function checkStaleVersion(env, request) {
  const clientVersion = request.headers.get("X-Zukan-Version") || "";
  if (!clientVersion) return { conflict: false };
  const current = await env.TAROT_KV.get(VERSION_KEY);
  if (current && current !== clientVersion) {
    return { conflict: true, current };
  }
  return { conflict: false };
}

// 保存に成功した直後に呼ぶ。新しい更新番号を作ってKVに書き込み、呼び出し側へ返す。
export async function bumpVersion(env) {
  const next = makeVersion();
  await env.TAROT_KV.put(VERSION_KEY, next);
  return next;
}
