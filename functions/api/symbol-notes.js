// カード詳細のシンボル説明を、アプリの編集画面から書き換えられるようにするためのAPI。
// データはCloudflare KV (binding: TAROT_KV) に、キー "symbol-notes" のJSONオブジェクトとして
// { "m01:0": "編集後の本文", "m02:3": "..." } の形でまとめて保存する。

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.TAROT_KV.get("symbol-notes");
    const data = raw ? JSON.parse(raw) : {};
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const key = (body && body.key || "").toString();
    const text = (body && body.text || "").toString();
    if (!key || !text) {
      return new Response(JSON.stringify({ ok: false, error: "key and text are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const raw = await env.TAROT_KV.get("symbol-notes");
    const data = raw ? JSON.parse(raw) : {};
    data[key] = text;
    await env.TAROT_KV.put("symbol-notes", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
