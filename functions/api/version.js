// Cloudflare Pages Function: GET /api/version
// 画面が「古くなっていないか」を軽く確かめるためだけのAPI。
// KVの "zukan-version" キー(文字列1個)だけを返す。図鑑本体のデータ(symbol-notes等の
// 7つのキー)は一切読み書きしない。

export async function onRequestGet(context) {
  const { env } = context;
  const v = (await env.TAROT_KV.get("zukan-version")) || "";
  return new Response(JSON.stringify({ v }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
