// 占い記録(ジャーナル)のクラウド保存用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "journal-entries" の配列として
// [ {"id":"...", "date":"...", "cardId":"...", "name":"...", "reversed":true/false,
//    "note":"...", "mode":"reading"/"timing", "deck":"tarot"/...}, ... ] の形でまとめて保存する。
// 通常の保存(新しい記録)には時刻+乱数のidを付ける。移行(import)で送られてくる、まだidを
// 持たない既存の記録には date+"_"+cardId+"_"+deck を決まった形のidにする
// (同じ記録は同じidになるので、2回移行しても増えない)。
//
// 保存の直前に「他の端末で先に更新されていないか」を確認する(functions/api/_version-guard.js)。
// 古い画面からの保存はここで409を返して止める。

import { checkStaleVersion, bumpVersion } from "./_version-guard.js";

const KEY = "journal-entries";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function load(env) {
  const raw = await env.TAROT_KV.get(KEY);
  const data = raw ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

// date/cardId/deckが無いものは記録として成立しない(idも作れない)ので弾く。
function cleanEntry(input) {
  input = input || {};
  const date = String(input.date || "").slice(0, 64);
  const cardId = String(input.cardId || "").slice(0, 64);
  const deck = String(input.deck || "").slice(0, 32);
  if (!date || !cardId || !deck) return { error: "date, cardId and deck are required" };
  return {
    entry: {
      date, cardId, deck,
      name: String(input.name || "").slice(0, 200),
      reversed: !!input.reversed,
      note: String(input.note || "").slice(0, 5000),
      mode: String(input.mode || "reading").slice(0, 32)
    }
  };
}

function byDateDesc(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

export async function onRequestGet(context) {
  try {
    const entries = await load(context.env);
    return new Response(JSON.stringify(entries), { headers: JSON_HEADERS });
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
    const entries = await load(env);

    if (body && body.delete) {
      const id = String(body.id || "");
      const next = entries.filter(e => e.id !== id);
      next.sort(byDateDesc);
      await env.TAROT_KV.put(KEY, JSON.stringify(next));
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, entries: next }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    if (body && body.import) {
      // すでに同じid(date+cardId+deckから決まる)があるものは飛ばす。何回importしても増えない。
      const incoming = Array.isArray(body.entries) ? body.entries : [];
      let added = 0, skipped = 0;
      for (const raw of incoming) {
        const cleaned = cleanEntry(raw);
        if (cleaned.error) { skipped++; continue; }
        const e = cleaned.entry;
        const id = e.date + "_" + e.cardId + "_" + e.deck;
        if (entries.some(x => x.id === id)) { skipped++; continue; }
        entries.push(Object.assign({ id }, e));
        added++;
      }
      entries.sort(byDateDesc);
      await env.TAROT_KV.put(KEY, JSON.stringify(entries));
      const newVersion = await bumpVersion(env);
      return new Response(JSON.stringify({ ok: true, added, skipped, entries }), {
        headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
      });
    }

    const cleaned = cleanEntry(body && body.entry);
    if (cleaned.error) {
      return new Response(JSON.stringify({ ok: false, error: cleaned.error }), { status: 400, headers: JSON_HEADERS });
    }
    const id = String((body && body.entry && body.entry.id) || "");
    if (id) {
      const existing = entries.find(e => e.id === id);
      if (existing) Object.assign(existing, cleaned.entry);
      else entries.push(Object.assign({ id }, cleaned.entry));
    } else {
      entries.push(Object.assign({ id: makeId() }, cleaned.entry));
    }
    entries.sort(byDateDesc);
    await env.TAROT_KV.put(KEY, JSON.stringify(entries));
    const newVersion = await bumpVersion(env);
    return new Response(JSON.stringify({ ok: true, entries }), {
      headers: { ...JSON_HEADERS, "X-Zukan-Version": newVersion }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
