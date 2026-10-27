// 「ラジオ」の回ごとの「stand.fm投稿用テキスト」（タイトル・カテゴリ・ハッシュタグ・放送の説明）用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "radio-posts" のJSONで
//   { "m00": { "title": "...", "category": "...", "tags": "...", "desc": "...", "updatedAt": "ISO日時" }, ... }
// の形で保存する。台本・カバー画像・配信予定とは別キー（それらの保存や更新番号に影響しない）。
//
//   GET  /api/radio-posts                                   → { posts: {...} }
//   POST /api/radio-posts {cardId, title?, category?, tags?, desc?}
//        → 指定した項目だけ更新（省略した項目はそのまま）
//   POST /api/radio-posts {cardId, delete:true}             → その回の投稿用テキストを消す

const KEY = "radio-posts";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LIMITS = { title: 200, category: 100, tags: 1000, desc: 5000 };

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
}
async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export async function onRequestGet(context) {
  try {
    return json({ posts: await load(context.env) });
  } catch (err) {
    return json({ posts: {} });
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
      const cur = Object.assign({ title: "", category: "", tags: "", desc: "" }, data[cardId]);
      for (const k of Object.keys(LIMITS)) {
        if (body[k] !== undefined) cur[k] = String(body[k] == null ? "" : body[k]).slice(0, LIMITS[k]);
      }
      if (!cur.title && !cur.category && !cur.tags && !cur.desc) delete data[cardId];
      else data[cardId] = { title: cur.title, category: cur.category, tags: cur.tags, desc: cur.desc, updatedAt: new Date().toISOString() };
    }
    await env.TAROT_KV.put(KEY, JSON.stringify(data));
    return json({ ok: true, posts: data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
