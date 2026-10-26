// 「ラジオ」の回ごとのカバー画像用API。
// 画像はCloudflare KV (binding: TAROT_KV) に、1回につき1キー "radio-cover:<cardId>" で
// 画像のバイト列そのまま保存する（台本テキストの "radio-scripts" とは別キー。台本の保存を重くしない・
// アップした画像をそのままダウンロードできるようにするため）。
// 付随情報（種類・サイズ・元のファイル名・更新日時）はKVのmetadataに入れる。
//
//   GET    /api/radio-covers            → { covers: { "<cardId>": {type,size,name,updatedAt}, ... } }
//   GET    /api/radio-covers?id=<id>    → 画像そのもの（<img src>やダウンロードに使う）
//   POST   /api/radio-covers?id=<id>    → 画像のバイト列を本文に入れて登録／差し替え
//                                          (Content-Type は無視し、先頭バイトで PNG/JPEG/WebP を判定する)
//   DELETE /api/radio-covers?id=<id>    → 削除
//
// 画像の保存は回ごとに独立しているため、台本のような「更新番号」(_version-guard.js)の
// 確認・更新はしない（他の保存の更新番号を巻き込まないため）。

const PREFIX = "radio-cover:";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BYTES = 8 * 1024 * 1024; // 1枚8MBまで（KVの1値上限25MBより十分小さく）
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...JSON_HEADERS, ...(extra || {}) } });
}

// 先頭バイトから画像の種類を判定（SVGなどスクリプトを含み得る形式は受け付けない）
function sniffType(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      const covers = {};
      let cursor;
      do {
        const page = await env.TAROT_KV.list({ prefix: PREFIX, cursor });
        for (const k of page.keys) covers[k.name.slice(PREFIX.length)] = k.metadata || {};
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return json({ covers }, 200, { "Cache-Control": "no-store" });
    }
    if (!ID_RE.test(id)) return json({ ok: false, error: "invalid id" }, 400);
    const { value, metadata } = await env.TAROT_KV.getWithMetadata(PREFIX + id, "arrayBuffer");
    if (!value) return json({ ok: false, error: "not found" }, 404);
    return new Response(value, {
      headers: {
        "Content-Type": (metadata && metadata.type) || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        // 画面側が ?v=<更新日時> を付けて呼ぶので、差し替えれば別URLになる
        "Cache-Control": "private, max-age=86400"
      }
    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!ID_RE.test(id)) return json({ ok: false, error: "invalid id" }, 400);
    const declared = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (declared > MAX_BYTES + 1024) return json({ ok: false, error: "too_large" }, 413);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ ok: false, error: "empty" }, 400);
    if (buf.byteLength > MAX_BYTES) return json({ ok: false, error: "too_large" }, 413);
    const type = sniffType(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
    if (!type) return json({ ok: false, error: "unsupported_type" }, 415);
    let name = "";
    try { name = decodeURIComponent(request.headers.get("X-File-Name") || ""); } catch (e) {}
    const meta = { type, size: buf.byteLength, name: name.slice(0, 100), updatedAt: new Date().toISOString() };
    await env.TAROT_KV.put(PREFIX + id, buf, { metadata: meta });
    return json({ ok: true, cover: meta });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!ID_RE.test(id)) return json({ ok: false, error: "invalid id" }, 400);
    await env.TAROT_KV.delete(PREFIX + id);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
