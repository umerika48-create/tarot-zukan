// 「講座」の新規登録・編集用API。
// データはCloudflare KV (binding: TAROT_KV) に、キー "courses-data" のJSONオブジェクトとして
// { "courses": { "<id>": { id, title, subtitle, tags:[], program:[{time,title,desc,labels:[{title,text}]}] } },
//   "order": ["<id>", ...] }   ← 新規登録した講座の並び順（作成順）
// の形でまとめて保存する。
// courses.js に直書きされている初期講座を編集した場合も、同じidで上書きとしてここに保存する
// （その講座を削除すると、上書きが消えて初期内容に戻る）。

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function str(v, max) {
  return (v == null ? "" : String(v)).slice(0, max);
}

function cleanCourse(input) {
  const id = str(input.id, 64);
  if (!ID_RE.test(id)) return { error: "invalid id" };
  const title = str(input.title, 200).trim();
  if (!title) return { error: "title is required" };

  const tags = (Array.isArray(input.tags) ? input.tags : [])
    .map(t => str(t, 40).trim()).filter(Boolean).slice(0, 20);

  const program = (Array.isArray(input.program) ? input.program : []).slice(0, 60).map(p => {
    p = p || {};
    const labels = (Array.isArray(p.labels) ? p.labels : []).slice(0, 20).map(l => ({
      title: str(l && l.title, 100).trim(),
      text: str(l && l.text, 5000)
    })).filter(l => l.title);
    const item = {
      time: str(p.time, 40).trim(),
      title: str(p.title, 200).trim(),
      desc: str(p.desc, 3000)
    };
    if (labels.length) item.labels = labels;
    return item;
  }).filter(p => p.time || p.title || p.desc);

  return { course: { id, title, subtitle: str(input.subtitle, 300).trim(), tags, program } };
}

async function loadData(env) {
  const raw = await env.TAROT_KV.get("courses-data");
  const data = raw ? JSON.parse(raw) : {};
  if (!data.courses || typeof data.courses !== "object") data.courses = {};
  if (!Array.isArray(data.order)) data.order = [];
  return data;
}

export async function onRequestGet(context) {
  try {
    const data = await loadData(context.env);
    return new Response(JSON.stringify(data), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ courses: {}, order: [] }), { headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const data = await loadData(env);

    if (body && body.delete) {
      const id = str(body.id, 64);
      if (!ID_RE.test(id)) {
        return new Response(JSON.stringify({ ok: false, error: "invalid id" }), { status: 400, headers: JSON_HEADERS });
      }
      delete data.courses[id];
      data.order = data.order.filter(x => x !== id);
    } else {
      const result = cleanCourse((body && body.course) || {});
      if (result.error) {
        return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 400, headers: JSON_HEADERS });
      }
      const c = result.course;
      data.courses[c.id] = c;
      if (body.isNew && !data.order.includes(c.id)) data.order.push(c.id);
    }

    await env.TAROT_KV.put("courses-data", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true, courses: data.courses, order: data.order }), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
}
