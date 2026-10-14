// メモのフォルダ(クラウド保存)用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "memo-folders" の配列として
// [ {"id":"...", "name":"..."}, ... ] の形でまとめて保存する。
// フォルダを削除すると、そのフォルダに属するメモ本体(キー "memo-notes")も一緒に削除する
// (ローカル版の「フォルダを消すと中のメモも消える」仕様を、サーバー側でも保つため)。
//
// 保存の直前に「他の端末で先に更新されていないか」を確認する(functions/api/_version-guard.js)。
// 古い画面からの保存はここで409を返して止める。

import { checkStaleVersion, bumpVersion } from "./_version-guard.js";

const KEY = "memo-folders";
const NOTES_KEY = "memo-notes";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  const data = raw ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}
async function loadNotes(env) {
  const raw = await env.TAROT_KV.get(NOTES_KEY);
  const data = raw ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

export async function onRequestGet(context) {
  try {
    const folders = await load(context.env);
    return new Response(JSON.stringify(folders), { headers: JSON_HEADERS });
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
    const folders = await load(env);

    if (body && body.delete) {
      const id = String(body.id || "");
      const next = folders.filter(f => f.id !== id);
      const notes = await loadNotes(env);
      const remainingNotes = notes.filter(n => n.folderId !== id);
      const deletedNoteCount = notes.length - remainingNotes.length;
      await env.TAROT_KV.put(KEY, JSON.stringify(next));
      if (deletedNoteCount > 0) {
        await env.TAROT_KV.put(NOTES_KEY, JSON.stringify(remainingNotes));
      }
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, folders: next, deletedNoteCount }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    if (body && body.import) {
      // ローカルのフォルダはすでにidを持っているので、そのidをそのまま使う。
      // すでに同じidがあれば飛ばす(上書きしない)。
      const incoming = Array.isArray(body.folders) ? body.folders : [];
      let added = 0, skipped = 0;
      for (const raw of incoming) {
        const id = String((raw && raw.id) || "");
        const name = String((raw && raw.name) || "").slice(0, 200);
        if (!id || !name) { skipped++; continue; }
        if (folders.some(f => f.id === id)) { skipped++; continue; }
        folders.push({ id, name });
        added++;
      }
      await env.TAROT_KV.put(KEY, JSON.stringify(folders));
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, added, skipped, folders }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    const input = (body && body.folder) || {};
    const name = String(input.name || "").trim().slice(0, 200) || "無題フォルダ";
    const id = String(input.id || "");
    if (id) {
      const existing = folders.find(f => f.id === id);
      if (existing) existing.name = name;
      else folders.push({ id, name });
    } else {
      folders.push({ id: makeId(), name });
    }
    await env.TAROT_KV.put(KEY, JSON.stringify(folders));
    const newVersion = await bumpVersion(env);
    return new Response(JSON.stringify({ ok: true, folders }), {
      headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
