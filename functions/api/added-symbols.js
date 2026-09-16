// ストーリーポップアップのシンボルラベル一覧に、後から追加できるラベル用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "added-symbols" のJSONオブジェクトとして
// { "m01": [ {"id":"...", "label":"短いラベル", "title":"詳細タイトル", "text":"説明文"} , ... ], "m02": [...] } の形でまとめて保存する。

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.TAROT_KV.get("added-symbols");
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
    const cardId = (body && body.cardId || "").toString();
    const label = (body && body.label || "").toString();
    const title = (body && body.title || "").toString();
    const text = (body && body.text || "").toString();
    const id = (body && body.id || "").toString();
    const del = !!(body && body.delete);

    if (!cardId) {
      return new Response(JSON.stringify({ ok: false, error: "cardId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const raw = await env.TAROT_KV.get("added-symbols");
    const data = raw ? JSON.parse(raw) : {};
    const list = data[cardId] || [];

    if (del) {
      data[cardId] = list.filter(s => s.id !== id);
    } else {
      if (!label || !title || !text) {
        return new Response(JSON.stringify({ ok: false, error: "label, title and text are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (id) {
        const existing = list.find(s => s.id === id);
        if (existing) {
          existing.label = label;
          existing.title = title;
          existing.text = text;
        } else {
          list.push({ id, label, title, text });
        }
      } else {
        list.push({ id: makeId(), label, title, text });
      }
      data[cardId] = list;
    }

    await env.TAROT_KV.put("added-symbols", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true, symbols: data[cardId] }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
