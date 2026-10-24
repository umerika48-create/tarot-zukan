// 「ラジオ」(stand.fm番組の収録用台本)用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "radio-scripts" のJSONオブジェクトとして
// { "m00": { "text": "台本本文", "updatedAt": "ISO日時" }, "w01": {...}, ... } の形でまとめて保存する。
// 初期台本(第1回など)は radio_scripts.js に同梱し、ここに保存した内容があればそちらを優先する。
// 保存の直前に「他の端末で先に更新されていないか」を確認する(_version-guard.js)。

import { checkStaleVersion, bumpVersion } from "./_version-guard.js";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function loadData(env) {
  const raw = await env.TAROT_KV.get("radio-scripts");
  const data = raw ? JSON.parse(raw) : {};
  return data && typeof data === "object" ? data : {};
}

export async function onRequestGet(context) {
  try {
    return new Response(JSON.stringify(await loadData(context.env)), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({}), { headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const staleCheck = await checkStaleVersion(env, request);
    if (staleCheck.conflict) {
      return new Response(JSON.stringify({ ok: false, error: "stale", v: staleCheck.current }), {
        status: 409, headers: JSON_HEADERS
      });
    }
    const body = await request.json();
    const cardId = String((body && body.cardId) || "");
    if (!ID_RE.test(cardId)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid cardId" }), { status: 400, headers: JSON_HEADERS });
    }
    const data = await loadData(env);
    if (body.delete) {
      delete data[cardId]; // 保存分を消すと同梱の初期台本(あれば)に戻る
    } else {
      data[cardId] = { text: String(body.text == null ? "" : body.text).slice(0, 30000), updatedAt: new Date().toISOString() };
    }
    await env.TAROT_KV.put("radio-scripts", JSON.stringify(data));
    const newVersion = await bumpVersion(env);
    return new Response(JSON.stringify({ ok: true, scripts: data }), {
      headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
