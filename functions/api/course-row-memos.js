// 講座のプログラム行ごとの「MEMO」用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "course-row-memos" のJSONオブジェクトとして
// { "<講座id>": { "0": "メモ本文", "n1abc": "..." } } の形でまとめて保存する。
// キーは「行の識別子」。昔のデータは行の番号（0始まり）、新しく作った行は "n…"。並べ替え・削除でもずれない。
//
// 保存の直前に「他の端末で先に更新されていないか」を確認する(functions/api/_version-guard.js)。
// 古い画面からの保存はここで409を返して止める。

import { checkStaleVersion, bumpVersion } from "./_version-guard.js";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,32}$/;

async function load(env) {
  const raw = await env.TAROT_KV.get("course-row-memos");
  const data = raw ? JSON.parse(raw) : {};
  return data && typeof data === "object" ? data : {};
}

export async function onRequestGet(context) {
  try {
    return new Response(JSON.stringify(await load(context.env)), { headers: JSON_HEADERS });
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
    const courseId = String((body && body.courseId) || "");
    // 行の識別子(key)。旧データは行の番号(idx)をそのままキーにしている。新しい行は "n…" の識別子。
    const key = body && body.key != null ? String(body.key) : String(Number(body && body.idx));
    const idx = Number(key);
    const keyOk = KEY_RE.test(key) && (!/^\d+$/.test(key) || (idx >= 0 && idx <= 200));
    if (!ID_RE.test(courseId) || !keyOk) {
      return new Response(JSON.stringify({ ok: false, error: "invalid key" }), { status: 400, headers: JSON_HEADERS });
    }
    const text = String((body && body.text) || "").slice(0, 10000);
    const data = await load(env);
    if (!data[courseId]) data[courseId] = {};
    if (text.trim()) data[courseId][key] = text;
    else delete data[courseId][key];
    if (!Object.keys(data[courseId]).length) delete data[courseId];
    await env.TAROT_KV.put("course-row-memos", JSON.stringify(data));
    const newVersion = await bumpVersion(env);
    return new Response(JSON.stringify({ ok: true, memos: data }), {
      headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
