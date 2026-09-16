// カードごとの「MEMO」機能用API。
// タイトル別に複数のメモを1枚のカードに紐付けて保存できるようにする。
// データはCloudflare KV (binding: TAROT_KV) に、キー "card-memos" のJSONオブジェクトとして
// { "m01": [ {"id":"...", "title":"恋愛リーディング用", "text":"..."} , ... ], "m02": [...] } の形でまとめて保存する。

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.TAROT_KV.get("card-memos");
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

    const raw = await env.TAROT_KV.get("card-memos");
    const data = raw ? JSON.parse(raw) : {};
    const list = data[cardId] || [];

    if (del) {
      data[cardId] = list.filter(m => m.id !== id);
    } else {
      if (!title || !text) {
        return new Response(JSON.stringify({ ok: false, error: "title and text are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (id) {
        const existing = list.find(m => m.id === id);
        if (existing) {
          existing.title = title;
          existing.text = text;
        } else {
          list.push({ id, title, text });
        }
      } else {
        list.push({ id: makeId(), title, text });
      }
      data[cardId] = list;
    }

    await env.TAROT_KV.put("card-memos", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true, memos: data[cardId] }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
