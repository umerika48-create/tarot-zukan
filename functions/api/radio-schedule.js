// 「ラジオ」の回ごとの「配信予定日」と「予約済み」用API（旧「配信日」は廃止）。
// 画面（各回の上部）から入力でき、Claudeに頼んでここへ記録することもできる。
// データはCloudflare KV (binding: TAROT_KV) に、キー "radio-schedule" のJSONで
//   { "m00": { "date": "2026-10-28", "reserved": true, "updatedAt": "ISO日時" }, ... } の形で保存する。
//   date は未定なら空文字。date も reserved も空の回は、エントリごと消す。
// 台本・カバー画像とは別キー（それらの保存や更新番号に影響しない）。
//
//   GET  /api/radio-schedule                                → { schedule: {...} }
//   POST /api/radio-schedule {cardId, date?, reserved?}     → 指定した項目だけ更新（省略した項目はそのまま）
//        date: "YYYY-MM-DD"（空文字 "" で予定日を消す）／ reserved: true / false
//
// 旧「配信日」(KV "radio-published")の記録は、このキーが無い最初の読み込み時に
// 「配信予定日＝その日付、予約済み＝true」として一度だけ移す（旧キーはそのまま残す）。

const KEY = "radio-schedule";
const OLD_KEY = "radio-published";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
}
function parse(raw) {
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  if (raw != null) return parse(raw);
  // 初回のみ：旧「配信日」から移す
  const old = parse(await env.TAROT_KV.get(OLD_KEY));
  const data = {};
  for (const id of Object.keys(old)) {
    const d = old[id] && old[id].date;
    if (ID_RE.test(id) && DATE_RE.test(String(d || ""))) data[id] = { date: d, reserved: true, updatedAt: new Date().toISOString() };
  }
  await env.TAROT_KV.put(KEY, JSON.stringify(data));
  return data;
}
function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

export async function onRequestGet(context) {
  try {
    return json({ schedule: await load(context.env) });
  } catch (err) {
    return json({ schedule: {} });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const cardId = String((body && body.cardId) || "");
    if (!ID_RE.test(cardId)) return json({ ok: false, error: "invalid cardId" }, 400);
    const data = await load(env);
    const cur = data[cardId] || { date: "", reserved: false };
    let date = cur.date || "";
    let reserved = !!cur.reserved;
    if (body.date !== undefined) {
      const d = body.date == null ? "" : String(body.date);
      if (d !== "" && !validDate(d)) return json({ ok: false, error: "invalid date (YYYY-MM-DD)" }, 400);
      date = d;
    }
    if (body.reserved !== undefined) reserved = body.reserved === true;
    if (!date && !reserved) delete data[cardId];
    else data[cardId] = { date, reserved, updatedAt: new Date().toISOString() };
    await env.TAROT_KV.put(KEY, JSON.stringify(data));
    return json({ ok: true, schedule: data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
