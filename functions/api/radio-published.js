// 「ラジオ」の回ごとの配信日（stand.fmに配信した日）用API。
// アプリの画面からは入力せず、「配信したよ」とClaudeに伝えたとき、Claudeがここに記録する。
// 画面（各回の上部）は、ここに入っている日付を表示するだけ。
// データはCloudflare KV (binding: TAROT_KV) に、キー "radio-published" のJSONで
//   { "m00": { "date": "2026-10-28", "recordedAt": "ISO日時" }, ... } の形で保存する。
// 台本・カバー画像とは別キー（それらの保存や更新番号に影響しない）。
//
//   GET    /api/radio-published                              → { published: {...} }
//   POST   /api/radio-published  {cardId, date?}             → 配信日を記録（date省略＝今日。日本時間、YYYY-MM-DD）
//   POST   /api/radio-published  {cardId, delete:true}       → 記録を消す（未配信に戻す）

const KEY = "radio-published";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
}
async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
  return data && typeof data === "object" ? data : {};
}
function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

export async function onRequestGet(context) {
  try {
    return json({ published: await load(context.env) });
  } catch (err) {
    return json({ published: {} });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const cardId = String((body && body.cardId) || "");
    if (!ID_RE.test(cardId)) return json({ ok: false, error: "invalid cardId" }, 400);
    const data = await load(env);
    if (body.delete) {
      delete data[cardId];
    } else {
      const date = body.date == null || body.date === "" ? todayJst() : String(body.date);
      if (!validDate(date)) return json({ ok: false, error: "invalid date (YYYY-MM-DD)" }, 400);
      data[cardId] = { date, recordedAt: new Date().toISOString() };
    }
    await env.TAROT_KV.put(KEY, JSON.stringify(data));
    return json({ ok: true, published: data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
