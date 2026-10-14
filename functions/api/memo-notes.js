// メモ本体(クラウド保存)用API。右下のMEMOやカードの❖ノートとは別データ。
// データはCloudflare KV (binding: TAROT_KV) に、キー "memo-notes" の配列として
// [ {"id":"...", "folderId":"...", "title":"...", "subtitle":"...", "text":"...", "updatedAt":数値}, ... ]
// の形でまとめて保存する。
//
// 保存の直前に「他の端末で先に更新されていないか」を確認する(functions/api/_version-guard.js)。
// 古い画面からの保存はここで409を返して止める。

import { checkStaleVersion, bumpVersion } from "./_version-guard.js";

const KEY = "memo-notes";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  const data = raw ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

function cleanNote(input) {
  input = input || {};
  return {
    folderId: String(input.folderId || "").slice(0, 64),
    title: String(input.title || "").slice(0, 300),
    subtitle: String(input.subtitle || "").slice(0, 300),
    text: String(input.text || "").slice(0, 50000)
  };
}

export async function onRequestGet(context) {
  try {
    const notes = await load(context.env);
    return new Response(JSON.stringify(notes), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify([]), { headers: JSON_HEADERS });
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
    const notes = await load(env);

    if (body && body.delete) {
      const id = String(body.id || "");
      const next = notes.filter(n => n.id !== id);
      await env.TAROT_KV.put(KEY, JSON.stringify(next));
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, notes: next }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    if (body && body.import) {
      // ローカルのメモはすでにidを持っているので、そのidをそのまま使う。
      // すでに同じidがあれば、updatedAtが新しい方だけを残す(古い方なら飛ばす)。
      const incoming = Array.isArray(body.notes) ? body.notes : [];
      let added = 0, skipped = 0;
      for (const raw of incoming) {
        const id = String((raw && raw.id) || "");
        if (!id) { skipped++; continue; }
        const cleaned = cleanNote(raw);
        const updatedAt = Number(raw && raw.updatedAt) || 0;
        const existing = notes.find(n => n.id === id);
        if (!existing) {
          notes.push(Object.assign({ id, updatedAt }, cleaned));
          added++;
        } else if (updatedAt > (Number(existing.updatedAt) || 0)) {
          Object.assign(existing, cleaned, { updatedAt });
          added++;
        } else {
          skipped++;
        }
      }
      await env.TAROT_KV.put(KEY, JSON.stringify(notes));
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, added, skipped, notes }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    const input = (body && body.note) || {};
    const cleaned = cleanNote(input);
    const id = String(input.id || "");
    const updatedAt = Date.now();
    if (id) {
      const existing = notes.find(n => n.id === id);
      if (existing) Object.assign(existing, cleaned, { updatedAt });
      else notes.push(Object.assign({ id, updatedAt }, cleaned));
    } else {
      notes.push(Object.assign({ id: makeId(), updatedAt }, cleaned));
    }
    await env.TAROT_KV.put(KEY, JSON.stringify(notes));
    const newVersion = await bumpVersion(env);
    return new Response(JSON.stringify({ ok: true, notes }), {
      headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
