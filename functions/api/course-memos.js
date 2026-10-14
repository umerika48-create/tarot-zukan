// 講座メモ(クラウド保存)用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "course-memos" のJSONオブジェクトとして
// { "<講座id>": "メモ本文", ... } の形でまとめて保存する。
//
// 保存の直前に「他の端末で先に更新されていないか」を確認する(functions/api/_version-guard.js)。
// 古い画面からの保存はここで409を返して止める。

import { checkStaleVersion, bumpVersion } from "./_version-guard.js";

const KEY = "course-memos";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  const data = raw ? JSON.parse(raw) : {};
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export async function onRequestGet(context) {
  try {
    const memos = await load(context.env);
    return new Response(JSON.stringify(memos), { headers: JSON_HEADERS });
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
    const memos = await load(env);

    if (body && body.import) {
      // すでに講座idがあれば(値が空でも)飛ばす。上書きしない。
      const incoming = (body.memos && typeof body.memos === "object") ? body.memos : {};
      let added = 0, skipped = 0;
      for (const courseId of Object.keys(incoming)) {
        if (Object.prototype.hasOwnProperty.call(memos, courseId)) { skipped++; continue; }
        memos[courseId] = String(incoming[courseId] || "").slice(0, 20000);
        added++;
      }
      await env.TAROT_KV.put(KEY, JSON.stringify(memos));
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, added, skipped, memos }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    const courseId = String((body && body.courseId) || "");
    if (!courseId) {
      return new Response(JSON.stringify({ ok: false, error: "courseId is required" }), { status: 400, headers: JSON_HEADERS });
    }
    const text = String((body && body.text) || "").slice(0, 20000);
    memos[courseId] = text;
    await env.TAROT_KV.put(KEY, JSON.stringify(memos));
    const newVersion = await bumpVersion(env);
    return new Response(JSON.stringify({ ok: true, memos }), {
      headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
