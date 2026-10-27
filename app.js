// ===== タロット図鑑 app logic =====
const SUIT_LABEL = {
  major: "大アルカナ", wands: "ワンド", cups: "カップ", swords: "ソード", pentacles: "ペンタクル"
};
const SUIT_JA_SHORT = { major:"", wands:"(火)", cups:"(水)", swords:"(風)", pentacles:"(地)" };

let currentSuit = "all";
let currentQuery = "";
let currentDictDeck = "tarot"; // "tarot" | "lenormand" | "rune"
let currentGridList = [];
let currentModalIndex = -1;

// ===== 古い画面の検知（複数端末・複数タブ対応） =====
// Ericaが複数の端末で図鑑を開いたままにしていると、「今見ている画面」が古くなっている
// のに気づかず保存してしまい、他の端末での編集が上書きで消えてしまう事故が起きうる。
// cafe-kai-kanriの同じ仕組み(checkVersionStaleness/showStaleScreenBanner/STALE_SCREEN/
// SAVE_IN_FLIGHT)に揃えてある。
const ZUKAN_IS_OFFLINE_FILE = location.protocol === "file:"; // build_offline.pyが作るオフライン版
const ZUKAN_PENDING_SAVE_KEY = "zukanPendingSave_v1";
let ZUKAN_VERSION = ""; // サーバーの更新番号。空のうち(初回・未取得時)は「古い画面」の判定をしない
let STALE_SCREEN = false;
// 自分の保存(zukanPostのPOST)が進行中かどうか。trueの間はcheckVersionStalenessを
// 行わない/その結果を使わない(自分の保存を「古い画面」と誤判定しないため)。
let SAVE_IN_FLIGHT = false;
let ZUKAN_SAVE_QUEUE = Promise.resolve(); // 保存を1つずつ順番に行うための待ち行列(同時に2つ走らせない)

function showStaleScreenBanner() {
  if (document.getElementById("staleScreenBanner")) return;
  const b = document.createElement("div");
  b.id = "staleScreenBanner";
  b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:3000;background:#b23b5a;color:#fff;padding:10px;text-align:center;font-size:12px;";
  b.innerHTML = "⚠️ 他の端末で更新されました。更新してから使ってください。" +
    '<button onclick="location.reload()" style="margin-left:8px;padding:4px 10px;border-radius:14px;border:none;background:#fff;color:#b23b5a;font-weight:700;">更新する</button>';
  document.body.appendChild(b);
}

// 止めた保存の内容を、次回この画面を開いたときのために端末内(localStorage)へ1件だけ退避する。
// 復元のためのバナー等は作っていない(退避のみ)。容量オーバー等は無視する(致命的ではない)。
function backupZukanPendingSave(url, body, reason) {
  try {
    localStorage.setItem(ZUKAN_PENDING_SAVE_KEY, JSON.stringify({ url, body, reason, ts: Date.now() }));
  } catch (e) { /* 容量オーバー等は無視 */ }
}

// 画面が古くなっていないかの軽い確認(/api/version)。
// 他の端末・タブが先に保存すると、このタブが覚えているZUKAN_VERSIONが古くなる。
// 保存する前に気づけるよう、定期的にサーバーの最新バージョンと突き合わせる。
function checkVersionStaleness() {
  if (ZUKAN_IS_OFFLINE_FILE || SAVE_IN_FLIGHT || !ZUKAN_VERSION) return;
  const requestedVersion = ZUKAN_VERSION;
  fetch("/api/version", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
    // 確認している間に保存が始まった/ZUKAN_VERSIONが変わったら、この結果は古いので捨てる
    if (SAVE_IN_FLIGHT || ZUKAN_VERSION !== requestedVersion) return;
    if (!j || !j.v) return; // バージョン情報が空のときは誤警告しないよう何もしない
    if (j.v !== ZUKAN_VERSION) {
      STALE_SCREEN = true;
      showStaleScreenBanner();
    }
  }).catch(() => { /* 通信エラー時は何もしない(誤警告しない) */ });
}

// 起動時：7つのGET(symbol-notes/added-symbols/memos/diamond-notes/context-notes/courses/
// course-row-memos)を始める前に、先に/api/versionを読む(版が先、データが後。こうすれば、
// 取得の合間に誰かが保存しても「古い画面」と判定される安全側になる)。
const zukanVersionReady = ZUKAN_IS_OFFLINE_FILE ? Promise.resolve() :
  fetch("/api/version", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
    if (j && j.v) ZUKAN_VERSION = j.v;
  }).catch(() => {});

// 図鑑の7つの保存APIすべてで使う共通の保存処理。
// - 保存は1つずつ順番に行う(同時に2つ走らせない)。
// - 古い画面(STALE_SCREEN)、またはサーバーが409(stale)を返した場合は保存を止めて帯を出す。
//   入力中の文字は消さず、止めた保存の内容をlocalStorageに退避する。
// - 成功したらレスポンスヘッダーのX-Zukan-VersionでZUKAN_VERSIONを更新する。
// 呼び出し側は .then(data => ...) で成功時のJSONを受け取り、.catch(err => ...) で失敗を
// 受け取る。errがzukanStale:trueの場合は「古い画面」として帯で案内済みなので、
// 呼び出し側で重ねてアラートを出す必要はない。
function zukanPost(url, body) {
  ZUKAN_SAVE_QUEUE = ZUKAN_SAVE_QUEUE.then(() => zukanPostNow(url, body), () => zukanPostNow(url, body));
  return ZUKAN_SAVE_QUEUE;
}
function zukanPostNow(url, body) {
  if (STALE_SCREEN) {
    backupZukanPendingSave(url, body, "stale");
    showStaleScreenBanner();
    return Promise.reject({ zukanStale: true });
  }
  SAVE_IN_FLIGHT = true;
  backupZukanPendingSave(url, body, "saving");
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Zukan-Version": ZUKAN_VERSION || "" },
    body: JSON.stringify(body)
  }).then(res => {
    if (res.status === 409) {
      SAVE_IN_FLIGHT = false;
      STALE_SCREEN = true;
      showStaleScreenBanner();
      return Promise.reject({ zukanStale: true });
    }
    if (!res.ok) {
      SAVE_IN_FLIGHT = false;
      return Promise.reject(new Error("save failed: " + res.status));
    }
    const newVersion = res.headers.get("X-Zukan-Version");
    if (newVersion) ZUKAN_VERSION = newVersion;
    SAVE_IN_FLIGHT = false;
    try { localStorage.removeItem(ZUKAN_PENDING_SAVE_KEY); } catch (e) {}
    return res.json();
  }, err => {
    SAVE_IN_FLIGHT = false;
    throw err;
  });
}

if (!ZUKAN_IS_OFFLINE_FILE) {
  // 約15秒ごと、タブが再び表に出てきたとき、ウィンドウにフォーカスが戻ったときに
  // 画面が古くなっていないかを確かめる(他の端末・タブが先に保存した場合の事故防止)。
  setInterval(checkVersionStaleness, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersionStaleness(); });
  window.addEventListener("focus", checkVersionStaleness);
}

// ---------- ナビゲーション ----------
const views = { dict: document.getElementById("view-dict"), draw: document.getElementById("view-draw"), timing: document.getElementById("view-timing"), spread: document.getElementById("view-spread"), combo: document.getElementById("view-combo"), about: document.getElementById("view-about"), courses: document.getElementById("view-courses"), journal: document.getElementById("view-journal"), radio: document.getElementById("view-radio") };
const titles = {
  dict: ["占いカード図鑑", "タロット・ルノルマン・ルーン。いつでも気軽に。"],
  draw: ["1枚引く", "今の自分に必要なメッセージを受け取りましょう。"],
  timing: ["時期読み", "カードが示す、物事が動くタイミングの目安。"],
  spread: ["スプレッド", "目的に合わせた展開方法で、深く読み解きましょう。"],
  combo: ["組み合わせ引き", "複数のデッキを組み合わせて、多角的に読み解きます。"],
  about: ["タロットとは", "カードの成り立ちを、少しだけ覗いてみましょう。"],
  courses: ["講座", "開催する講座の内容とメモを管理できます。"],
  journal: ["記録", "これまで引いたカードと、そのときの気づき。"],
  radio: ["ラジオ", "stand.fm収録用。絵柄と台本を並べて読めます。"]
};
document.querySelectorAll(".rail-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rail-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const v = btn.dataset.view;
    Object.values(views).forEach(el => el.classList.add("hidden"));
    views[v].classList.remove("hidden");
    document.getElementById("pageTitleText").textContent = v === "dict" ? "Sakuraco" : titles[v][0];
    document.getElementById("pageTitleText2").style.display = v === "dict" ? "inline" : "none";
    document.getElementById("pageTitleSparkle").style.display = v === "dict" ? "inline-block" : "none";
    document.getElementById("pageTitleCard").style.display = v === "dict" ? "inline-block" : "none";
    document.getElementById("pageSub").textContent = titles[v][1];
    document.getElementById("searchBox").style.visibility = (v === "dict") ? "visible" : "hidden";
    if (v === "journal") renderJournal();
    if (v === "draw") resetDraw();
    if (v === "timing") renderTimingTables();
    if (v === "spread") initSpreadTab();
    if (v === "combo") { document.getElementById("comboDeckStage").style.display = "flex"; renderComboDeckStage(); }
    if (v === "courses") renderCourseList();
    if (v === "radio") initRadio();
  });
});

// ---------- ラジオ（stand.fm収録用の台本表示・編集）----------
// 台本はタロットRWS版78枚（CARDS）に1回ずつ対応。紹介順は CARDS の並び（大アルカナ0〜21→ワンド→カップ→ソード→ペンタクル）。
// 同梱の初期台本(RADIO_SEED)と、KV(/api/radio-scripts)に保存した編集分をマージして使う（保存分が優先）。
let radioStore = {};
let radioIdx = 0;
let radioLoaded = false;
function radioText(id) {
  if (radioStore[id] && typeof radioStore[id].text === "string") return radioStore[id].text;
  return (typeof RADIO_SEED !== "undefined" && RADIO_SEED[id]) || "";
}
function radioLabel(c, i) {
  const has = radioText(c.id).trim() ? "●" : "○";
  const cov = (radioCovers[c.id] ? " 🖼" : "") + (radioSchedule[c.id] && radioSchedule[c.id].reserved ? " ✔予約済" : "");
  return `${has} 第${i + 1}回｜${c.arcana === "major" ? c.number + " " : ""}${c.name_jp}${cov}`;
}
function renderRadioSelect() {
  const sel = document.getElementById("radioSelect");
  sel.innerHTML = CARDS.map((c, i) => `<option value="${i}">${escapeHtml(radioLabel(c, i))}</option>`).join("");
  sel.value = String(radioIdx);
}
// 配信予定日と予約済み（stand.fm）。各回の上部から入力でき、/api/radio-schedule に保存する。
let radioSchedule = {}; // { カードID: {date:"YYYY-MM-DD"|"", reserved:bool} }
function radioFmtDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日（${"日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
}
function renderRadioPublished() {
  const box = document.getElementById("radioPublished");
  if (!box) return;
  if (typeof ZUKAN_IS_OFFLINE_FILE !== "undefined" && ZUKAN_IS_OFFLINE_FILE) { box.style.display = "none"; return; }
  box.style.display = "";
  const s = radioSchedule[CARDS[radioIdx].id] || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date || "") ? s.date : "";
  box.className = "radio-pub" + (s.reserved ? " done" : "");
  box.innerHTML =
    `<span class="rp-label">📻 stand.fm</span>` +
    `<label class="rp-field">配信予定日 <input type="date" id="radioSchedDate" value="${date}"></label>` +
    (date ? `<span class="rp-wd">${radioFmtDate(date)}</span>` : "") +
    `<label class="rp-field rp-check"><input type="checkbox" id="radioSchedReserved"${s.reserved ? " checked" : ""}> 予約済み</label>`;
}
function radioScheduleSave(payload) {
  const id = CARDS[radioIdx].id;
  const prev = radioSchedule[id];
  const cur = Object.assign({ date: "", reserved: false }, prev, payload);
  if (!cur.date && !cur.reserved) delete radioSchedule[id]; else radioSchedule[id] = { date: cur.date, reserved: cur.reserved };
  renderRadioPublished(); renderRadioSelect(); // 先に画面へ反映
  fetch("/api/radio-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ cardId: id }, payload)) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("save")))
    .then(d => { if (d && d.schedule) { radioSchedule = d.schedule; renderRadioPublished(); renderRadioSelect(); } })
    .catch(() => {
      if (prev) radioSchedule[id] = prev; else delete radioSchedule[id];
      renderRadioPublished(); renderRadioSelect();
      alert("保存できませんでした。通信を確認して、もう一度お試しください。");
    });
}
document.getElementById("radioPublished").addEventListener("change", e => {
  if (e.target.id === "radioSchedDate") radioScheduleSave({ date: e.target.value || "" });
  else if (e.target.id === "radioSchedReserved") radioScheduleSave({ reserved: e.target.checked });
});
// ---- stand.fm投稿用テキスト（タイトル・カテゴリ・ハッシュタグ・放送の説明）。/api/radio-posts に保存 ----
// カバー画像の下に表示。項目ごとにコピーでき、「直す」でその場で編集して保存できる。
let radioPosts = {}; // { カードID: {title, category, tags, desc} }
let radioPostEdit = false;
const RADIO_POST_FIELDS = [
  { k: "title", label: "タイトル", max: 40, rows: 1 },
  { k: "category", label: "カテゴリ", rows: 1 },
  { k: "tags", label: "ハッシュタグ", rows: 2 },
  { k: "desc", label: "放送の説明", max: 800, rows: 14 }
];
function radioPostLen(s) { return Array.from(s || "").length; }
function renderRadioPost() {
  const box = document.getElementById("radioPost");
  if (!box) return;
  if (typeof ZUKAN_IS_OFFLINE_FILE !== "undefined" && ZUKAN_IS_OFFLINE_FILE) { box.style.display = "none"; return; }
  box.style.display = "";
  const c = CARDS[radioIdx];
  const p = radioPosts[c.id];
  const head = `<div class="rpost-head"><span class="rpost-title">stand.fm 投稿用（第${radioIdx + 1}回）</span>`;
  if (radioPostEdit) {
    box.innerHTML = head + `</div>` + RADIO_POST_FIELDS.map(f => {
      const v = (p && p[f.k]) || "";
      return `<div class="rpost-row"><div class="rpost-lab">${f.label}<span class="rpost-cnt" data-cnt="${f.k}"></span></div>` +
        `<textarea class="rpost-ta" data-f="${f.k}" rows="${f.rows}" spellcheck="false">${escapeHtml(v)}</textarea></div>`;
    }).join("") + `<div class="rpost-btns"><button type="button" class="radio-btn save" data-act="save">保存</button><button type="button" class="radio-btn" data-act="cancel">キャンセル</button></div>`;
    box.querySelectorAll(".rpost-ta").forEach(updateRadioPostCount);
    return;
  }
  if (!p) {
    box.innerHTML = head + `</div><div class="rc-info">まだありません。「入力する」から、タイトル・カテゴリ・ハッシュタグ・放送の説明を入れられます。</div>` +
      `<div class="rpost-btns"><button type="button" class="radio-btn save" data-act="edit">入力する</button></div>`;
    return;
  }
  box.innerHTML = head + `<button type="button" class="radio-btn" data-act="edit">直す</button></div>` + RADIO_POST_FIELDS.map(f => {
    const v = p[f.k] || "";
    const n = radioPostLen(v);
    const over = f.max && n > f.max;
    return `<div class="rpost-row"><div class="rpost-lab">${f.label}` +
      (f.max ? `<span class="rpost-cnt${over ? " over" : ""}">${n}/${f.max}字</span>` : "") +
      `<button type="button" class="radio-btn rpost-copy" data-act="copy" data-f="${f.k}">コピー</button></div>` +
      `<div class="rpost-val">${escapeHtml(v) || '<span class="rc-info">（なし）</span>'}</div></div>`;
  }).join("");
}
function updateRadioPostCount(ta) {
  const f = RADIO_POST_FIELDS.find(x => x.k === ta.dataset.f);
  const el = document.querySelector(`#radioPost [data-cnt="${f.k}"]`);
  if (!el || !f.max) return;
  const n = radioPostLen(ta.value);
  el.textContent = `${n}/${f.max}字`;
  el.classList.toggle("over", n > f.max);
}
function radioCopyText(text, btn) {
  const done = () => { const o = btn.textContent; btn.textContent = "コピーしました"; setTimeout(() => { btn.textContent = o; }, 1500); };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { alert("コピーできませんでした。文字を選んでコピーしてください。"); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
}
function radioPostSave() {
  const id = CARDS[radioIdx].id;
  const payload = { cardId: id };
  document.querySelectorAll("#radioPost .rpost-ta").forEach(ta => { payload[ta.dataset.f] = ta.value.trim(); });
  fetch("/api/radio-posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("save")))
    .then(d => { if (d && d.posts) { radioPosts = d.posts; radioPostEdit = false; renderRadioPost(); } })
    .catch(() => alert("保存できませんでした。通信を確認して、もう一度お試しください。"));
}
(function setupRadioPost() {
  const box = document.getElementById("radioPost");
  if (!box) return;
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, p = radioPosts[CARDS[radioIdx].id] || {};
    if (act === "copy") radioCopyText(p[b.dataset.f] || "", b);
    else if (act === "edit") { radioPostEdit = true; renderRadioPost(); }
    else if (act === "cancel") { radioPostEdit = false; renderRadioPost(); }
    else if (act === "save") radioPostSave();
  });
  box.addEventListener("input", e => { if (e.target.classList && e.target.classList.contains("rpost-ta")) updateRadioPostCount(e.target); });
})();
function renderRadio() {
  const c = CARDS[radioIdx];
  renderRadioPublished();
  renderRadioCover();
  renderRadioPost();
  document.getElementById("radioSelect").value = String(radioIdx);
  document.getElementById("radioSide").innerHTML =
    `<img src="${escapeHtml(c.img)}" alt="${escapeHtml(c.name_jp)}"><div><div class="rs-no">第${radioIdx + 1}回 / ${CARDS.length}</div><div class="rs-name">${escapeHtml(c.name_jp)}</div><div class="rs-en">${escapeHtml(c.name_en || "")}</div></div>` + radioToolsHtml();
  const text = radioText(c.id);
  const box = document.getElementById("radioScript");
  if (!text.trim()) {
    box.innerHTML = '<div class="radio-empty">この回の台本はまだありません。右上の「編集」から、台本を貼り付けて保存できます。</div>';
    return;
  }
  let first = true;
  box.innerHTML = text.split("\n").map((line, i) => {
    if (/^##\s/.test(line)) {
      const h = `<span class="rh rl${first ? " first" : ""}" data-i="${i}">${escapeHtml(line.replace(/^##\s*/, ""))}（編集用・読み上げない）</span>`;
      first = false;
      return h;
    }
    first = false;
    if (!line.trim()) return "\n";
    return `<span class="rl" data-i="${i}">${radioMarksToHtml(line)}</span>\n`;
  }).join("").replace(/\n+(?=<span class="rh)/g, "\n");
  box.classList.toggle("hide-head", document.getElementById("radioHideHead").checked);
}
function radioGo(i) {
  radioUserNav = true; // 自分で回を動かしたら、開いた時の自動ジャンプはしない
  radioInlineOpen = false;
  radioPostEdit = false;
  radioIdx = (i + CARDS.length) % CARDS.length;
  closeRadioEdit();
  renderRadio();
  window.scrollTo(0, 0);
  try { localStorage.setItem("radioIdx", String(radioIdx)); } catch (e) {}
}
function openRadioEdit() {
  const c = CARDS[radioIdx];
  const ta = document.getElementById("radioText");
  ta.value = radioText(c.id);
  document.getElementById("radioScript").style.display = "none";
  document.getElementById("radioEditWrap").style.display = "block";
  document.getElementById("radioEditBtn").style.display = "none";
  document.getElementById("radioReset").style.display = (radioStore[c.id] && typeof RADIO_SEED !== "undefined" && RADIO_SEED[c.id]) ? "" : "none";
  updateRadioCount();
  ta.focus();
}
function closeRadioEdit() {
  document.getElementById("radioScript").style.display = "";
  document.getElementById("radioEditWrap").style.display = "none";
  document.getElementById("radioEditBtn").style.display = "";
}
function updateRadioCount() {
  const t = document.getElementById("radioText").value.split("\n").filter(l => !/^##\s/.test(l)).join("").replace(RADIO_MARK_RE, "$2").replace(/\s/g, "");
  document.getElementById("radioCount").textContent = "読み上げ部分 約" + t.length + "文字";
}
function radioSave(payload) {
  if (typeof ZUKAN_IS_OFFLINE_FILE !== "undefined" && ZUKAN_IS_OFFLINE_FILE) {
    alert("オフライン版では台本を保存できません。オンライン版（https://tarot-zukan.pages.dev）で編集してください。");
    return Promise.resolve(false);
  }
  return zukanPost("/api/radio-scripts", payload).then(data => {
    if (!data || !data.ok) throw new Error("save");
    radioStore = data.scripts || {};
    return true;
  }).catch(err => { if (!(err && err.zukanStale)) alert("保存できませんでした。通信を確認して、もう一度お試しください。"); return false; });
}
// ラジオを開いた時の最初の回：「台本があって、予約済みでない回」のうち一番古い（番号が小さい）回。
// 該当がなければ（全部予約済み・台本なし）、前回見ていた回のまま。
let radioUserNav = false;
function radioOldestUnreservedIdx() {
  for (let i = 0; i < CARDS.length; i++) {
    const id = CARDS[i].id;
    if (!(radioSchedule[id] && radioSchedule[id].reserved) && radioText(id).trim()) return i;
  }
  return -1;
}
function initRadio() {
  if (!radioLoaded) {
    radioLoaded = true;
    try { const s = parseInt(localStorage.getItem("radioIdx"), 10); if (s >= 0 && s < CARDS.length) radioIdx = s; } catch (e) {}
    let savedFont = null;
    try { savedFont = localStorage.getItem("radioFont"); } catch (e) {}
    document.getElementById("radioFont").value = savedFont || (window.innerWidth <= 720 ? "22" : "28");
    applyRadioFont();
    renderRadioSelect();
    renderRadio();
    if (typeof ZUKAN_IS_OFFLINE_FILE === "undefined" || !ZUKAN_IS_OFFLINE_FILE) {
      fetch("/api/radio-covers", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.covers && typeof d.covers === "object") { radioCovers = d.covers; renderRadioSelect(); renderRadioCover(); }
      }).catch(() => {});
      fetch("/api/radio-posts", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.posts && typeof d.posts === "object") { radioPosts = d.posts; if (!radioPostEdit) renderRadioPost(); }
      }).catch(() => {});
      const pubReq = fetch("/api/radio-schedule", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.schedule && typeof d.schedule === "object") { radioSchedule = d.schedule; renderRadioPublished(); renderRadioSelect(); return true; }
        return false;
      }).catch(() => false);
      const scrReq = zukanVersionReady.then(() => fetch("/api/radio-scripts")).then(r => r.ok ? r.json() : null).then(d => {
        if (d && typeof d === "object") { radioStore = d; renderRadioSelect(); if (document.getElementById("radioEditWrap").style.display === "none") renderRadio(); }
      }).catch(() => {});
      // 両方そろってから、一番古い未予約の回へ（予約の記録を読めなかったときは動かさない）
      Promise.all([pubReq, scrReq]).then(([pubOk]) => {
        if (!pubOk || radioUserNav || radioInlineOpen || document.getElementById("radioEditWrap").style.display !== "none") return;
        const t = radioOldestUnreservedIdx();
        if (t < 0 || t === radioIdx) return;
        radioIdx = t;
        renderRadioSelect(); renderRadio();
        try { localStorage.setItem("radioIdx", String(radioIdx)); } catch (e) {}
      });
    }
  }
}
// ---- カバー画像（回ごとに1枚。/api/radio-covers に、アップした画像をそのまま保存）----
// 台本とは別保存。ダウンロードは保存した元の画像ファイルがそのまま落ちる（再圧縮しない）。
let radioCovers = {}; // { カードID: {type, size, name, updatedAt} }
let radioCoverBusy = false;
const RADIO_COVER_MAX = 8 * 1024 * 1024;
const RADIO_COVER_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
function radioCoverUrl(id, m) {
  return "/api/radio-covers?id=" + encodeURIComponent(id) + "&v=" + encodeURIComponent((m && m.updatedAt) || "");
}
function radioFmtBytes(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
}
function renderRadioCover() {
  const box = document.getElementById("radioCover");
  if (typeof ZUKAN_IS_OFFLINE_FILE !== "undefined" && ZUKAN_IS_OFFLINE_FILE) { box.style.display = "none"; return; }
  box.style.display = "";
  const c = CARDS[radioIdx];
  const m = radioCovers[c.id];
  const dis = radioCoverBusy ? " disabled" : "";
  const busy = radioCoverBusy ? '<span class="rc-busy">処理中…</span>' : "";
  if (!m) {
    box.innerHTML =
      `<button type="button" class="rc-thumb" data-act="pick"${dis}>カバー画像<br>未登録<br>（タップで選ぶ）</button>` +
      `<div class="rc-main"><div class="rc-title">カバー画像（第${radioIdx + 1}回）</div>` +
      `<div class="rc-info">stand.fmの回のカバー用。正方形（1400×1400px推奨）のPNG・JPEG・WebP、8MBまで。ここに画像をドラッグしても登録できます。</div>` +
      `<div class="rc-btns"><button type="button" class="radio-btn save" data-act="pick"${dis}>画像をアップロード</button>${busy}</div></div>`;
    return;
  }
  const ext = RADIO_COVER_EXT[m.type] || "";
  box.innerHTML =
    `<button type="button" class="rc-thumb has" data-act="view" title="大きく見る"><img src="${escapeHtml(radioCoverUrl(c.id, m))}" alt="第${radioIdx + 1}回のカバー画像"></button>` +
    `<div class="rc-main"><div class="rc-title">カバー画像（第${radioIdx + 1}回）</div>` +
    `<div class="rc-info"><span id="rcDim"></span>${ext.toUpperCase()} ・ ${radioFmtBytes(m.size || 0)}${m.name ? "<br>" + escapeHtml(m.name) : ""}</div>` +
    `<div class="rc-btns"><button type="button" class="radio-btn" data-act="dl"${dis}>ダウンロード</button>` +
    `<button type="button" class="radio-btn" data-act="pick"${dis}>差し替え</button>` +
    `<button type="button" class="radio-btn danger" data-act="del"${dis}>削除</button>${busy}</div></div>`;
  const img = box.querySelector(".rc-thumb img");
  img.addEventListener("load", () => {
    const d = document.getElementById("rcDim");
    if (d && img.naturalWidth) d.textContent = img.naturalWidth + "×" + img.naturalHeight + " ・ ";
  });
}
function radioCoverUpload(file) {
  if (!file || radioCoverBusy) return;
  if (typeof ZUKAN_IS_OFFLINE_FILE !== "undefined" && ZUKAN_IS_OFFLINE_FILE) {
    alert("オフライン版ではカバー画像を登録できません。オンライン版（https://tarot-zukan.pages.dev）で操作してください。");
    return;
  }
  if (file.type && !/^image\/(png|jpeg|webp)$/.test(file.type)) { alert("PNG・JPEG・WebPの画像を選んでください。"); return; }
  if (file.size > RADIO_COVER_MAX) { alert("画像が大きすぎます（" + radioFmtBytes(file.size) + "）。8MB以下にしてください。"); return; }
  const id = CARDS[radioIdx].id;
  radioCoverBusy = true; renderRadioCover();
  fetch("/api/radio-covers?id=" + encodeURIComponent(id), {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "") },
    body: file
  }).then(res => res.json().catch(() => ({})).then(d => ({ res, d }))).then(({ res, d }) => {
    if (res.status === 413) throw new Error("画像が大きすぎます。8MB以下にしてください。");
    if (res.status === 415) throw new Error("PNG・JPEG・WebPの画像を選んでください。");
    if (!res.ok || !d.ok) throw new Error("保存できませんでした。通信を確認して、もう一度お試しください。");
    radioCovers[id] = d.cover;
  }).catch(err => {
    alert(err && err.message ? err.message : "保存できませんでした。通信を確認して、もう一度お試しください。");
  }).then(() => { radioCoverBusy = false; renderRadioCover(); renderRadioSelect(); });
}
function radioCoverDownload() {
  const c = CARDS[radioIdx], m = radioCovers[c.id];
  if (!m) return;
  fetch(radioCoverUrl(c.id, m)).then(r => r.ok ? r.blob() : Promise.reject(new Error("dl"))).then(blob => {
    const a = document.createElement("a");
    const safe = String(c.name_jp || c.id).replace(/[\\/:*?"<>|]/g, "");
    a.href = URL.createObjectURL(blob);
    a.download = "第" + (radioIdx + 1) + "回_" + safe + "_カバー." + (RADIO_COVER_EXT[m.type] || "png");
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }).catch(() => alert("ダウンロードできませんでした。通信を確認して、もう一度お試しください。"));
}
function radioCoverDelete() {
  const c = CARDS[radioIdx], id = c.id;
  if (!radioCovers[id] || radioCoverBusy) return;
  if (!confirm("第" + (radioIdx + 1) + "回のカバー画像を削除します。元に戻せません。\n（必要なら先にダウンロードしてください）\n削除しますか？")) return;
  radioCoverBusy = true; renderRadioCover();
  fetch("/api/radio-covers?id=" + encodeURIComponent(id), { method: "DELETE" }).then(r => {
    if (!r.ok) throw new Error("del");
    delete radioCovers[id];
  }).catch(() => alert("削除できませんでした。通信を確認して、もう一度お試しください。"))
    .then(() => { radioCoverBusy = false; renderRadioCover(); renderRadioSelect(); });
}
(function setupRadioCover() {
  const box = document.getElementById("radioCover");
  const input = document.getElementById("radioCoverFile");
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "pick") input.click();
    else if (act === "dl") radioCoverDownload();
    else if (act === "del") radioCoverDelete();
    else if (act === "view") { const c = CARDS[radioIdx]; window.open(radioCoverUrl(c.id, radioCovers[c.id]), "_blank"); }
  });
  input.addEventListener("change", () => { const f = input.files && input.files[0]; input.value = ""; radioCoverUpload(f); });
  ["dragenter", "dragover"].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.remove("drag"); }));
  box.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) radioCoverUpload(f); });
})();

function applyRadioFont() {
  document.getElementById("radioScript").style.fontSize = document.getElementById("radioFont").value + "px";
}

// ---- マーカー ----
// 台本の本文に {{色|文字}} の形で保存する（色: y=黄 p=ピンク b=青）。バックアップ・編集画面でもそのまま残る。
let radioMarkColor = "y";
let radioSelInfo = null;
const RADIO_MARK_RE = /\{\{([ypb])\|([^{}]*?)\}\}/g;
function radioMarksToHtml(line) {
  let out = "", last = 0, m;
  RADIO_MARK_RE.lastIndex = 0;
  while ((m = RADIO_MARK_RE.exec(line))) {
    out += escapeHtml(line.slice(last, m.index));
    out += `<mark class="mk mk-${m[1]}">${escapeHtml(m[2])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(line.slice(last));
}
function radioParseMarks(line) { // → [{ch, c}]
  const chars = []; let last = 0, m;
  RADIO_MARK_RE.lastIndex = 0;
  while ((m = RADIO_MARK_RE.exec(line))) {
    for (const ch of line.slice(last, m.index)) chars.push({ ch, c: null });
    for (const ch of m[2]) chars.push({ ch, c: m[1] });
    last = m.index + m[0].length;
  }
  for (const ch of line.slice(last)) chars.push({ ch, c: null });
  return chars;
}
function radioSerializeMarks(chars) {
  let out = "", i = 0;
  while (i < chars.length) {
    const c = chars[i].c; let j = i, s = "";
    while (j < chars.length && chars[j].c === c) { s += chars[j].ch; j++; }
    out += c ? `{{${c}|${s}}}` : s;
    i = j;
  }
  return out;
}
// 範囲[from,to)に色を適用（同じ色が全部に付いていれば外す。colorが"x"なら消す）
function radioApplyMark(line, from, to, color) {
  const chars = radioParseMarks(line);
  const idx = [];
  for (let k = from; k < Math.min(to, chars.length); k++) if (chars[k].ch.trim()) idx.push(k);
  if (!idx.length) return line;
  const allSame = color !== "x" && idx.every(k => chars[k].c === color);
  for (let k = from; k < Math.min(to, chars.length); k++) chars[k].c = (color === "x" || allSame) ? null : color;
  return radioSerializeMarks(chars);
}
function radioLineLength(line) { return radioParseMarks(line).length; }
function radioApplyAndSave(lineIdx, from, to, color) {
  const c = CARDS[radioIdx];
  const lines = radioText(c.id).split("\n");
  if (!(lineIdx >= 0 && lineIdx < lines.length) || /^##\s/.test(lines[lineIdx])) return;
  const nl = radioApplyMark(lines[lineIdx], from, to, color);
  if (nl === lines[lineIdx]) return;
  lines[lineIdx] = nl;
  const y = window.scrollY;
  radioSave({ cardId: c.id, text: lines.join("\n") }).then(() => { renderRadio(); renderRadioSelect(); window.scrollTo(0, y); });
}
function radioCaptureSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const sEl = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
  const eEl = (r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement);
  const sl = sEl && sEl.closest && sEl.closest("#radioScript .rl:not(.rh)");
  const el = eEl && eEl.closest && eEl.closest("#radioScript .rl:not(.rh)");
  if (!sl || sl !== el) return;
  const pre = document.createRange();
  pre.selectNodeContents(sl); pre.setEnd(r.startContainer, r.startOffset);
  const from = [...pre.toString()].length;
  const len = [...r.toString()].length;
  if (!len) return;
  radioSelInfo = { line: parseInt(sl.dataset.i, 10), from, to: from + len, t: Date.now() };
}
document.addEventListener("selectionchange", radioCaptureSelection);
function radioToolsHtml() {
  const sw = (c, label) => `<button type="button" class="rt-sw sw-${c}${radioMarkColor === c ? " on" : ""}" data-c="${c}" title="${label}">${c === "x" ? "消す" : ""}</button>`;
  return `<div class="rtools"><div class="rt-title">マーカー</div><div class="rt-row">${sw("y","黄")}${sw("p","ピンク")}${sw("b","青")}${sw("x","消す")}</div>` +
    `<label class="rt-mode"><input type="checkbox" id="radioLineMode"${radioLineMode ? " checked" : ""}> 行をタップでマーカー</label>` +
    `<div class="rt-note">文字を選んで色を押すと、その部分だけ塗れます</div></div>`;
}
let radioLineMode = false;
document.getElementById("radioSide").addEventListener("pointerdown", e => { if (e.target.closest(".rt-sw")) e.preventDefault(); });
document.getElementById("radioSide").addEventListener("click", e => {
  const b = e.target.closest(".rt-sw");
  if (!b) return;
  const color = b.dataset.c;
  if (color !== "x") radioMarkColor = color;
  const info = radioSelInfo && (Date.now() - radioSelInfo.t < 30000) ? radioSelInfo : null;
  radioSelInfo = null;
  document.querySelectorAll("#radioSide .rt-sw").forEach(x => x.classList.toggle("on", x.dataset.c === radioMarkColor));
  if (info) {
    const sel = window.getSelection(); if (sel) sel.removeAllRanges();
    radioApplyAndSave(info.line, info.from, info.to, color);
  } else if (color === "x") {
    radioLineModeEraser = true;
    document.querySelectorAll("#radioSide .rt-sw").forEach(x => x.classList.toggle("on", x.dataset.c === "x"));
  } else { radioLineModeEraser = false; }
});
document.getElementById("radioSide").addEventListener("change", e => {
  if (e.target.id === "radioLineMode") radioLineMode = e.target.checked;
});
let radioLineModeEraser = false;

// 読んでいる途中の修正：行をタップすると、その場で直せる（保存すると元の表示に戻る）
let radioInlineOpen = false;
document.getElementById("radioScript").addEventListener("click", e => {
  if (radioInlineOpen) return;
  const el = e.target.closest(".rl");
  if (!el) return;
  const sel = window.getSelection && window.getSelection().toString();
  if (sel) return; // 文字を選択しているだけのときは開かない
  const i = parseInt(el.dataset.i, 10);
  if (radioLineMode && !el.classList.contains("rh")) { // 行をタップでマーカー
    const ln = radioText(CARDS[radioIdx].id).split("\n")[i] || "";
    radioApplyAndSave(i, 0, radioLineLength(ln), radioLineModeEraser ? "x" : radioMarkColor);
    return;
  }
  const c = CARDS[radioIdx];
  const lines = radioText(c.id).split("\n");
  if (!(i >= 0 && i < lines.length)) return;
  radioInlineOpen = true;
  const wrap = document.createElement("div");
  wrap.className = "radio-inline";
  wrap.innerHTML = '<textarea spellcheck="false"></textarea><div class="radio-editbtns"><button type="button" class="radio-btn save">保存</button><button type="button" class="radio-btn" data-act="cancel">キャンセル</button><button type="button" class="radio-btn" data-act="del">この行を削除</button><span class="radio-count">「## 」で始めると見出し（読み上げない部分）</span></div>';
  const ta = wrap.querySelector("textarea");
  ta.value = lines[i];
  el.replaceWith(wrap);
  const fit = () => { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 4) + "px"; };
  ta.addEventListener("input", fit);
  fit(); ta.focus();
  const done = () => { radioInlineOpen = false; };
  const finish = (newLines) => {
    const y = window.scrollY;
    radioSave({ cardId: c.id, text: newLines.join("\n") }).then(ok => {
      done(); renderRadio(); renderRadioSelect(); window.scrollTo(0, y);
    });
  };
  wrap.querySelector(".save").addEventListener("click", () => {
    const nl = lines.slice(); nl.splice(i, 1, ...ta.value.split("\n")); finish(nl);
  });
  wrap.querySelector('[data-act="del"]').addEventListener("click", () => {
    const nl = lines.slice(); nl.splice(i, 1); finish(nl);
  });
  wrap.querySelector('[data-act="cancel"]').addEventListener("click", () => {
    const y = window.scrollY; done(); renderRadio(); window.scrollTo(0, y);
  });
});
document.getElementById("radioSelect").addEventListener("change", e => radioGo(parseInt(e.target.value, 10)));
document.getElementById("radioPrev").addEventListener("click", () => radioGo(radioIdx - 1));
document.getElementById("radioNext").addEventListener("click", () => radioGo(radioIdx + 1));
document.getElementById("radioFont").addEventListener("input", () => {
  applyRadioFont();
  try { localStorage.setItem("radioFont", document.getElementById("radioFont").value); } catch (e) {}
});
document.getElementById("radioHideHead").addEventListener("change", renderRadio);
document.getElementById("radioEditBtn").addEventListener("click", openRadioEdit);
document.getElementById("radioCancel").addEventListener("click", closeRadioEdit);
document.getElementById("radioText").addEventListener("input", updateRadioCount);
document.getElementById("radioSave").addEventListener("click", () => {
  const c = CARDS[radioIdx];
  radioSave({ cardId: c.id, text: document.getElementById("radioText").value }).then(ok => {
    if (ok) { closeRadioEdit(); renderRadioSelect(); renderRadio(); }
  });
});
document.getElementById("radioReset").addEventListener("click", () => {
  if (!confirm("保存した編集内容を消して、同梱の初期台本に戻します。よろしいですか？")) return;
  radioSave({ cardId: CARDS[radioIdx].id, delete: true }).then(ok => {
    if (ok) { closeRadioEdit(); renderRadioSelect(); renderRadio(); }
  });
});

// ---------- 図鑑 ----------
document.querySelectorAll("#dictDeckRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#dictDeckRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentDictDeck = chip.dataset.deck;
    document.getElementById("chipRow").style.display = (currentDictDeck === "tarot" || currentDictDeck === "marseille") ? "flex" : "none";
    currentSuit = "all";
    document.querySelectorAll("#chipRow .chip").forEach(c => c.classList.remove("active"));
    const allChip = document.querySelector('#chipRow .chip[data-suit="all"]');
    if (allChip) allChip.classList.add("active");
    document.getElementById("minorSubRow").style.display = "none";
    document.getElementById("courtSubRow").style.display = "none";
    renderGrid();
  });
});

function selectSuitChip(chip) {
  document.querySelectorAll("#chipRow .chip, #minorSubRow .chip, #courtSubRow .chip").forEach(c => c.classList.remove("active"));
  chip.classList.add("active");
  currentSuit = chip.dataset.suit;
  renderGrid();
}

document.querySelectorAll("#chipRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    if (chip.id === "minorToggleChip") {
      const subRow = document.getElementById("minorSubRow");
      const willShow = subRow.style.display === "none";
      subRow.style.display = willShow ? "flex" : "none";
      document.getElementById("courtSubRow").style.display = "none";
      selectSuitChip(chip);
      return;
    }
    if (chip.id === "courtToggleChip") {
      const subRow = document.getElementById("courtSubRow");
      const willShow = subRow.style.display === "none";
      subRow.style.display = willShow ? "flex" : "none";
      document.getElementById("minorSubRow").style.display = "none";
      selectSuitChip(chip);
      return;
    }
    document.getElementById("minorSubRow").style.display = "none";
    document.getElementById("courtSubRow").style.display = "none";
    selectSuitChip(chip);
  });
});

document.querySelectorAll("#minorSubRow .chip, #courtSubRow .chip").forEach(chip => {
  chip.addEventListener("click", () => selectSuitChip(chip));
});

document.getElementById("searchBox").addEventListener("input", (e) => {
  currentQuery = e.target.value.trim();
  renderGrid();
});

function getDictDeckArray() {
  if (currentDictDeck === "marseille") return MARSEILLE_CARDS;
  if (currentDictDeck === "lenormand") return LENORMAND_CARDS;
  if (currentDictDeck === "rune") return RUNE_CARDS;
  if (currentDictDeck === "heart_oracle") return HEART_ORACLE_CARDS;
  if (currentDictDeck === "step_oracle") return STEP_ORACLE_CARDS;
  if (currentDictDeck === "answer_oracle") return ANSWER_ORACLE_CARDS;
  if (currentDictDeck === "root_oracle") return ROOT_ORACLE_CARDS;
  return CARDS;
}

function renderGrid() {
  const grid = document.getElementById("cardGrid");
  const q = currentQuery.toLowerCase();
  const source = getDictDeckArray();
  const filtered = source.filter(c => {
    const suitOk = (currentDictDeck !== "tarot" && currentDictDeck !== "marseille") || currentSuit === "all"
      || (currentSuit === "minor"
          ? c.arcana !== "major"
          : currentSuit === "court"
          ? (c.arcana !== "major" && c.number >= 11 && c.number <= 14)
          : currentSuit.startsWith("court-")
          ? (c.arcana === currentSuit.replace("court-", "") && c.number >= 11 && c.number <= 14)
          : c.arcana === currentSuit);
    const qOk = !q || c.name_jp.toLowerCase().includes(q) || c.name_en.toLowerCase().includes(q) ||
      c.keywords.some(k => k.toLowerCase().includes(q));
    return suitOk && qOk;
  });
  grid.innerHTML = "";
  document.getElementById("emptyMsg").style.display = filtered.length ? "none" : "block";
  currentGridList = filtered;
  filtered.forEach(c => {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.innerHTML = `
      <img src="${c.img}" alt="${c.name_jp}" loading="lazy">
      <div class="tlabel">
        <span class="tnum">${cardNumLabel(c)}</span>
        <div class="tname">${c.name_jp}</div>
      </div>`;
    tile.addEventListener("click", () => openModal(c));
    grid.appendChild(tile);
  });
}

function cardNumLabel(c) {
  if (c.deck === "lenormand") return "LENORMAND " + c.id.replace("l","").padStart(2,"0");
  if (c.deck === "rune") return "RUNE " + c.id.replace("r","").padStart(2,"0");
  if (c.deck === "heart_oracle") return "HEART ORACLE " + c.id.replace("h","").padStart(2,"0");
  if (c.deck === "step_oracle") return "STEP ORACLE " + c.id.replace("s","").padStart(2,"0");
  if (c.deck === "answer_oracle") return "ANSWER ORACLE " + c.id.replace("a","").padStart(2,"0");
  if (c.deck === "root_oracle") return "ROOT ORACLE " + c.id.replace("rt","").padStart(2,"0");
  const prefix = c.deck === "marseille" ? "MARSEILLE " : "";
  if (c.arcana === "major") return prefix + "MAJOR " + String(c.number).padStart(2, "0");
  return prefix + SUIT_LABEL[c.arcana] + " " + rankLabel(c.number);
}
function rankLabel(n) {
  if (n === 1) return "A"; if (n === 11) return "P"; if (n === 12) return "N"; if (n === 13) return "Q"; if (n === 14) return "K";
  return String(n);
}

// ---------- 時期読み 図鑑テーブル ----------
document.querySelectorAll("#timingDeckRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#timingDeckRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    const deck = chip.dataset.deck;
    document.getElementById("timingTarotContent").style.display = deck === "tarot" ? "block" : "none";
    document.getElementById("timingLenormandContent").style.display = deck === "lenormand" ? "block" : "none";
    document.getElementById("timingRuneContent").style.display = deck === "rune" ? "block" : "none";
  });
});

function renderTimingTables() {
  const suitTbl = document.getElementById("timingSuitTable");
  if (suitTbl.dataset.done) return;
  suitTbl.dataset.done = "1";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const head = (first) => `<div class="timing-row head"><div>${first}</div><div>時期の目安</div><div>特徴</div><div>場所</div></div>`;
  const row = (name, term, feature, place) =>
    `<div class="timing-row"><div class="tc-name">${esc(name)}</div><div class="tc-term">${esc(term)}</div><div class="tc-feature">${esc(feature)}</div><div class="tc-place">${esc(place)}</div></div>`;

  let sh = head("スート");
  ["wands","cups","swords","pentacles"].forEach(s => {
    const t = TIMING_SUIT[s];
    sh += row(SUIT_LABEL[s] + SUIT_JA_SHORT[s], t.term, t.feature, t.place);
  });
  suitTbl.innerHTML = sh;

  let ch = head("カード");
  [11,12,13,14].forEach(n => {
    const t = TIMING_COURT[n];
    ch += row(t.label, t.term, t.feature, t.place);
  });
  document.getElementById("timingCourtTable").innerHTML = ch;

  let nh = `<div class="timing-row head"><div>数字</div><div>意味</div></div>`;
  TIMING_NUMBER.forEach(n => {
    nh += `<div class="timing-row"><div class="tc-num">${esc(n.num)}</div><div class="tc-meaning">${esc(n.meaning)}</div></div>`;
  });
  document.getElementById("timingNumberTable").innerHTML = nh;

  let mh = head("カード");
  CARDS.filter(c => c.arcana === "major").forEach(c => {
    const t = TIMING_MAJOR[c.id];
    mh += row(c.name_jp, t.term, t.feature, t.place);
  });
  document.getElementById("timingMajorTable").innerHTML = mh;

  let lh = head("カード");
  LENORMAND_CARDS.forEach(c => { lh += row(c.name_jp, c.timing_term, c.timing_feature, c.timing_place); });
  document.getElementById("timingLenormandTable").innerHTML = lh;

  let rh = head("カード");
  RUNE_CARDS.forEach(c => { rh += row(c.name_en + "／" + c.name_jp, c.timing_term, c.timing_feature, c.timing_place); });
  document.getElementById("timingRuneTable").innerHTML = rh;
}

// ---------- タロットとは ----------
document.querySelectorAll("#aboutModeRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#aboutModeRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    const level = chip.dataset.level;
    document.getElementById("aboutTextKids").style.display = level === "kids" ? "block" : "none";
    document.getElementById("aboutTextAdult").style.display = level === "adult" ? "block" : "none";
  });
});

// ---------- モーダル ----------
const modalBackdrop = document.getElementById("modalBackdrop");
function resetAccordions() {
  document.getElementById("mUpSec").classList.remove("open");
  document.getElementById("mRvSec").classList.remove("open");
  document.getElementById("mLoveSec").classList.remove("open");
  document.getElementById("mWorkSec").classList.remove("open");
}
document.querySelectorAll(".acc-sec-h").forEach(h => {
  h.addEventListener("click", () => {
    h.closest(".acc-sec").classList.toggle("open");
  });
});
function renderSymbolsSection(c, keepDetailOpen) {
  if (!keepDetailOpen) document.getElementById("symbolDetailBackdrop").classList.add("hidden");
  const chipRow = document.getElementById("mSymbolChipRow");
  chipRow.innerHTML = "";
  const hotspotLayer = document.getElementById("symbolHotspotLayer");
  hotspotLayer.innerHTML = "";
  const hotspotLabel = document.createElement("div");
  hotspotLabel.className = "symbol-hotspot-label";
  hotspotLabel.id = "symbolHotspotLabel";
  hotspotLayer.appendChild(hotspotLabel);

  function hideHotspotLabel() {
    hotspotLabel.classList.remove("show");
    document.querySelectorAll(".symbol-hotspot.active").forEach(d => d.classList.remove("active"));
  }

  let hotspotNum = 0;
  const hiddenBuiltinSymbols = [];
  if (c.symbols && c.symbols.length) {
    const hasCoords = c.symbols.some(s => typeof s.x === "number" && typeof s.y === "number");
    document.getElementById("viewToggle").style.display = hasCoords ? "flex" : "none";
    c.symbols.forEach((s, i) => {
      if (isSymbolHidden(c, i)) {
        hiddenBuiltinSymbols.push({ index: i, label: getSymbolLabel(c, i) });
        return;
      }
      const chip = document.createElement("span");
      chip.className = "symbol-chip";
      chip.textContent = getSymbolLabel(c, i);
      chip.addEventListener("click", () => openSymbolDetail(c, i));
      chipRow.appendChild(chip);

      if (typeof s.x === "number" && typeof s.y === "number") {
        hotspotNum++;
        const dot = document.createElement("div");
        dot.className = "symbol-hotspot";
        dot.style.left = s.x + "%";
        dot.style.top = s.y + "%";
        dot.title = getSymbolLabel(c, i);
        dot.textContent = hotspotNum;
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          const alreadyActive = dot.classList.contains("active");
          hideHotspotLabel();
          if (alreadyActive) return;
          dot.classList.add("active");
          hotspotLabel.textContent = getSymbolLabel(c, i);
          hotspotLabel.style.left = s.x + "%";
          hotspotLabel.style.top = Math.max(s.y - 6, 4) + "%";
          hotspotLabel.classList.add("show");
          hotspotLabel.onclick = (ev) => { ev.stopPropagation(); hideHotspotLabel(); openSymbolDetail(c, i); };
        });
        hotspotLayer.appendChild(dot);
      }
    });
  } else {
    document.getElementById("viewToggle").style.display = "none";
  }
  renderHiddenSymbolsLink(c, hiddenBuiltinSymbols);
  renderAddedChips(c);
  document.getElementById("modalImgFrame").addEventListener("click", hideHotspotLabel);
}
// 【❖】と【Context】の中身を、開いたカードに合わせて整える（全デッキ共通）
function setupDiamondAndContext(c) {
  diamondCardId = c.id;
  closeDiamondEdit();
  renderDiamondList();

  [["mConnPrev", "connections.prev", "＋ 前のカードとのつながりを追加"],
   ["mConnNext", "connections.next", "＋ 次のカードとのつながりを追加"],
   ["mConnContrast", "connections.contrast", "＋ 対比を追加"]].forEach(([id, path, hint]) => {
    const el = document.getElementById(id);
    const text = getFieldOverride(c, path);
    el.textContent = text || hint;
    el.classList.toggle("conn-empty", !text);
    el.style.display = (!text && location.protocol === "file:") ? "none" : ""; // オフライン版は入力できないので空の項目は隠す
  });
  ctxCardId = c.id;
  closeCtxEdit();
  renderCtxList();
}
function openModal(c) {
  currentModalIndex = currentGridList.findIndex(x => x.id === c.id);
  updateNavButtons();
  document.getElementById("modalImg").src = c.img;
  document.getElementById("modalImg").alt = c.name_jp;
  document.getElementById("mTitle").textContent = c.arcana === "major" ? c.number + ". " + c.name_jp : c.name_jp;
  document.getElementById("mTitleEn").textContent = c.name_en;
  renderKeywords(c);
  document.getElementById("symbolHotspotLayer").innerHTML = "";
  document.getElementById("symbolHotspotLayer").classList.remove("show");
  document.getElementById("viewToggle").style.display = "none";
  document.getElementById("viewTogglePlain").classList.add("active");
  document.getElementById("viewToggleSymbol").classList.remove("active");
  resetAccordions();
  resetTapEdits();

  if (c.deck === "lenormand" || c.deck === "rune" || c.deck === "heart_oracle" || c.deck === "step_oracle" || c.deck === "answer_oracle" || c.deck === "root_oracle") {
    document.getElementById("mEyebrow").textContent =
      c.deck === "lenormand" ? "ルノルマン" :
      c.deck === "rune" ? "ルーン（エルダー・フサルク）" :
      c.deck === "step_oracle" ? "Sakuraco Step Oracle" :
      c.deck === "answer_oracle" ? "Sakuraco Answer Oracle" :
      c.deck === "root_oracle" ? "Sakuraco Root Oracle" : "Sakuraco Heart Oracle";
    document.getElementById("mCatchWrap").style.display = "none";
    closeAllPopups();
    document.getElementById("mTagRow").style.display = "flex";
    ["mAge","mPersonTag","mStoryTag","mSituationTag","mPlaceTag","mMnemonicTag"].forEach(id => { document.getElementById(id).style.display = "none"; });
    document.getElementById("mDiamondTag").style.display = "inline-block";
    document.getElementById("mConnTag").style.display = "inline-block";
    setupDiamondAndContext(c);
    document.getElementById("mUpLabel").textContent = "意味";
    document.getElementById("mUp").textContent = getFieldOverride(c, "meaning");
    document.getElementById("mRvSec").style.display = "none";
    document.getElementById("mLoveSec").style.display = "block";
    document.getElementById("mLoveLabel").textContent = c.deck === "step_oracle" ? "後押しのひとこと" : c.deck === "heart_oracle" ? "今のアプローチ" : c.deck === "answer_oracle" ? "見極めのひとこと" : c.deck === "root_oracle" ? "自分への問いかけ" : "恋愛での視点";
    document.getElementById("mLove").textContent = getFieldOverride(c, "love");
    document.getElementById("mWorkSec").style.display = "none";
    modalBackdrop.classList.remove("hidden");
    return;
  }

  document.getElementById("mUpLabel").textContent = "正位置";
  document.getElementById("mRvSec").style.display = "block";
  document.getElementById("mLoveSec").style.display = "block";
  document.getElementById("mLoveLabel").textContent = "恋愛での視点";
  document.getElementById("mEyebrow").textContent = SUIT_LABEL[c.arcana] + " " + SUIT_JA_SHORT[c.arcana] + (c.deck === "marseille" ? "（マルセイユ版）" : "");
  document.getElementById("mUp").textContent = getFieldOverride(c, "upright");
  document.getElementById("mRv").textContent = getFieldOverride(c, "reversed");
  document.getElementById("mLove").textContent = getFieldOverride(c, "love");
  document.getElementById("mWorkSec").style.display = c.work ? "block" : "none";
  document.getElementById("mWork").textContent = getFieldOverride(c, "work");

  const storyPopup = document.getElementById("mStoryPopup");
  const personPopup = document.getElementById("mPersonPopup");
  const diamondPopup = document.getElementById("mDiamondPopup");
  const situationPopup = document.getElementById("mSituationPopup");
  const placePopup = document.getElementById("mPlacePopup");
  const connPopup = document.getElementById("mConnPopup");
  const mnemonicPopup = document.getElementById("mMnemonicPopup");
  storyPopup.classList.remove("show");
  personPopup.classList.remove("show");
  diamondPopup.classList.remove("show");
  situationPopup.classList.remove("show");
  placePopup.classList.remove("show");
  connPopup.classList.remove("show");
  mnemonicPopup.classList.remove("show");
  ["situationEditArea","placeEditArea","storyEditArea","connPrevEditArea","connNextEditArea","connContrastEditArea"].forEach(id => {
    document.getElementById(id).classList.remove("show");
  });
  ["mSituationText","mPlaceText","mStoryText","mConnPrev","mConnNext","mConnContrast"].forEach(id => {
    document.getElementById(id).style.display = "block";
  });
  document.getElementById("addSymbolArea").classList.remove("show");

  if (c.catchphrase) {
    document.getElementById("mCatchWrap").style.display = "block";
    document.getElementById("mCatch").textContent = getCardFieldText(c, "catchphrase");
    document.getElementById("catchEditArea").classList.remove("show");
    document.getElementById("catchEditSaved").classList.remove("show");
    document.getElementById("mCatchQuote").style.display = "inline";
  } else {
    document.getElementById("mCatchWrap").style.display = "none";
  }

  // 【❖】はどのカードにも付くので、タグ行は常に表示する
  document.getElementById("mTagRow").style.display = "flex";
  document.getElementById("mAge").style.display = c.age_range ? "inline-block" : "none";
  document.getElementById("mAge").textContent = c.age_range || "";
  document.getElementById("mPersonTag").style.display = c.person ? "inline-block" : "none";
  document.getElementById("mStoryTag").style.display = c.story ? "inline-block" : "none";
  document.getElementById("mSituationTag").style.display = c.current_situation ? "inline-block" : "none";
  document.getElementById("mPlaceTag").style.display = c.place ? "inline-block" : "none";
  document.getElementById("mConnTag").style.display = "inline-block"; // 【Context】は全カードで入力できる
  document.getElementById("mMnemonicTag").style.display = c.mnemonic ? "inline-block" : "none";
  setupDiamondAndContext(c);
  if (c.mnemonic) {
    document.getElementById("mMnemonicText").textContent = getFieldOverride(c, "mnemonic");
  }

  if (c.person) {
    document.getElementById("mPersonIntent").textContent = getFieldOverride(c, "person.intent");
    document.getElementById("mPersonAction").textContent = getFieldOverride(c, "person.action");
    document.getElementById("mPersonQuote").textContent = getFieldOverride(c, "person.quote");
  }
  if (c.story) {
    document.getElementById("mStoryHeader").textContent = "ストーリー：" + c.name_jp;
    document.getElementById("mStoryText").textContent = getFieldOverride(c, "story");
  }
  renderSymbolsSection(c);
  document.getElementById("addSymbolArea").classList.remove("show");
  if (c.current_situation) {
    document.getElementById("mSituationHeader").textContent = "現状に出たら：" + c.name_jp;
    document.getElementById("mSituationText").textContent = getFieldOverride(c, "current_situation");
  }
  if (c.place) {
    document.getElementById("mPlaceHeader").textContent = "出会いの場所：" + c.name_jp;
    document.getElementById("mPlaceText").textContent = getFieldOverride(c, "place");
  }

  modalBackdrop.classList.remove("hidden");
}
function closeAllPopups() {
  document.getElementById("mStoryPopup").classList.remove("show");
  document.getElementById("mPersonPopup").classList.remove("show");
  document.getElementById("mDiamondPopup").classList.remove("show");
  document.getElementById("mSituationPopup").classList.remove("show");
  document.getElementById("mPlacePopup").classList.remove("show");
  document.getElementById("mConnPopup").classList.remove("show");
  document.getElementById("mMnemonicPopup").classList.remove("show");
}
document.getElementById("mStoryTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mStoryPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mStoryPopup").classList.add("show");
});
document.getElementById("mDiamondTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mDiamondPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mDiamondPopup").classList.add("show");
});
document.getElementById("mPersonTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mPersonPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mPersonPopup").classList.add("show");
});
document.getElementById("mSituationTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mSituationPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mSituationPopup").classList.add("show");
});
document.getElementById("mPlaceTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mPlacePopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mPlacePopup").classList.add("show");
});
document.getElementById("mConnTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mConnPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mConnPopup").classList.add("show");
});
document.getElementById("mMnemonicTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mMnemonicPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mMnemonicPopup").classList.add("show");
});
document.getElementById("viewTogglePlain").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("viewTogglePlain").classList.add("active");
  document.getElementById("viewToggleSymbol").classList.remove("active");
  document.getElementById("symbolHotspotLayer").classList.remove("show");
});
document.getElementById("viewToggleSymbol").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("viewToggleSymbol").classList.add("active");
  document.getElementById("viewTogglePlain").classList.remove("active");
  document.getElementById("symbolHotspotLayer").classList.add("show");
});
function updateNavButtons() {
  const total = currentGridList.length;
  const prevBtn = document.getElementById("navPrevBtn");
  const nextBtn = document.getElementById("navNextBtn");
  const posEl = document.getElementById("cardPosition");
  if (currentModalIndex < 0 || total <= 1) {
    prevBtn.classList.add("hidden");
    nextBtn.classList.add("hidden");
    posEl.textContent = "";
    return;
  }
  prevBtn.classList.remove("hidden");
  nextBtn.classList.remove("hidden");
  posEl.textContent = (currentModalIndex + 1) + " / " + total;
}
function goToModalIndex(newIndex) {
  const total = currentGridList.length;
  if (total === 0) return;
  const wrapped = (newIndex + total) % total;
  openModal(currentGridList[wrapped]);
}
document.getElementById("navPrevBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentModalIndex < 0) return;
  goToModalIndex(currentModalIndex - 1);
});
document.getElementById("navNextBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentModalIndex < 0) return;
  goToModalIndex(currentModalIndex + 1);
});
document.addEventListener("keydown", (e) => {
  if (modalBackdrop.classList.contains("hidden")) return;
  if (currentModalIndex < 0) return;
  if (e.key === "ArrowLeft") goToModalIndex(currentModalIndex - 1);
  if (e.key === "ArrowRight") goToModalIndex(currentModalIndex + 1);
});
document.getElementById("modalClose").addEventListener("click", () => modalBackdrop.classList.add("hidden"));
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) modalBackdrop.classList.add("hidden"); });

// ---------- シンボル詳細ポップアップ ----------
const symbolDetailBackdrop = document.getElementById("symbolDetailBackdrop");
function openSymbolDetail(card, index) {
  if (!symbolDetailBackdrop.classList.contains("hidden") && currentAddedSymbolId === null &&
      currentSymbolDetailCard === card && currentSymbolDetailIndex === index) {
    symbolDetailBackdrop.classList.add("hidden");
    return;
  }
  const s = card.symbols[index];
  currentSymbolDetailCard = card;
  currentSymbolDetailIndex = index;
  currentAddedSymbolId = null;
  document.getElementById("symbolDetailEyebrow").textContent = card.name_jp + " のシンボル";
  document.getElementById("symbolDetailTitle").textContent = getSymbolTitle(card, index);
  document.getElementById("symbolDetailText").textContent = getSymbolText(card, index);
  document.getElementById("symbolEditArea").classList.remove("show");
  document.getElementById("symbolEditSaved").classList.remove("show");
  document.getElementById("symbolDetailText").style.display = "block";
  document.getElementById("symbolDetailTitle").style.display = "block";
  document.getElementById("symbolDeleteBtn").style.display = "none";
  const deleteLink = document.getElementById("symbolDetailDeleteLink");
  deleteLink.textContent = isSymbolHidden(card, index) ? "再表示にする" : "非表示にする";
  deleteLink.style.display = "inline-block";
  symbolDetailBackdrop.classList.remove("hidden");
}
let currentSymbolDetailCard = null;
let currentSymbolDetailIndex = -1;
let symbolNotes = {};
function symbolNoteKey(card, index) {
  return card.id + ":" + index;
}
function isSymbolHidden(card, index) {
  const note = symbolNotes[symbolNoteKey(card, index)];
  return !!(note && note.hidden);
}
function renderHiddenSymbolsLink(card, hiddenList) {
  const block = document.getElementById("hiddenSymbolsBlock");
  const toggle = document.getElementById("hiddenSymbolsToggle");
  const row = document.getElementById("hiddenSymbolsRow");
  row.innerHTML = "";
  row.style.display = "none";
  if (!hiddenList.length) {
    block.style.display = "none";
    return;
  }
  block.style.display = "block";
  toggle.textContent = "非表示にしたシンボル（" + hiddenList.length + "）";
  toggle.onclick = () => {
    if (row.style.display === "none") {
      row.style.display = "flex";
      row.innerHTML = "";
      hiddenList.forEach(h => {
        const chip = document.createElement("span");
        chip.className = "symbol-chip hidden-symbol-chip";
        chip.textContent = h.label;
        chip.addEventListener("click", () => openSymbolDetail(card, h.index));
        row.appendChild(chip);
      });
    } else {
      row.style.display = "none";
    }
  };
}
function getCardFieldText(card, field) {
  const key = card.id + ":" + field;
  const note = symbolNotes[key];
  return (note && note.text) ? note.text : card[field];
}
function getKeywordsList(card) {
  const key = card.id + ":keywords";
  const note = symbolNotes[key];
  if (note && note.text) {
    try {
      const parsed = JSON.parse(note.text);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return card.keywords;
}
function renderKeywords(c) {
  document.getElementById("mKeywords").innerHTML = getKeywordsList(c).map(k => `<span class="kw">${k}</span>`).join("");
}
function getFieldOverride(card, path) {
  const key = card.id + ":" + path;
  const note = symbolNotes[key];
  if (note && note.text) return note.text;
  const parts = path.split(".");
  let val = card;
  for (const p of parts) { val = val ? val[p] : undefined; }
  return val || "";
}
const TAP_EDIT_PAIRS = [];
function setupTapEdit(pId, areaId, taId, saveId, cancelId, savedId, path) {
  // path は文字列、またはカードを受け取ってパスを返す関数
  const pathOf = (card) => (typeof path === "function" ? path(card) : path);
  TAP_EDIT_PAIRS.push([pId, areaId]);
  document.getElementById(pId).addEventListener("click", () => {
    const card = currentGridList[currentModalIndex];
    if (!card) return;
    document.getElementById(taId).value = getFieldOverride(card, pathOf(card));
    document.getElementById(pId).style.display = "none";
    document.getElementById(areaId).classList.add("show");
  });
  document.getElementById(cancelId).addEventListener("click", () => {
    document.getElementById(areaId).classList.remove("show");
    document.getElementById(pId).style.display = "";
  });
  document.getElementById(saveId).addEventListener("click", () => {
    const card = currentGridList[currentModalIndex];
    if (!card) return;
    const newText = document.getElementById(taId).value.trim();
    if (!newText) return;
    const key = card.id + ":" + pathOf(card);
    zukanPost("/api/symbol-notes", { key: key, text: newText }).then(() => {
      symbolNotes[key] = { text: newText };
      document.getElementById(pId).textContent = newText;
      document.getElementById(pId).classList.remove("conn-empty");
      document.getElementById(areaId).classList.remove("show");
      document.getElementById(pId).style.display = "";
      const savedEl = document.getElementById(savedId);
      savedEl.classList.add("show");
      setTimeout(() => savedEl.classList.remove("show"), 2000);
    }).catch(err => {
      if (err && err.zukanStale) return;
      alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
    });
  });
}
function resetTapEdits() {
  TAP_EDIT_PAIRS.forEach(([pId, areaId]) => {
    document.getElementById(areaId).classList.remove("show");
    document.getElementById(pId).style.display = "";
  });
}
const SIMPLE_DECKS = ["lenormand", "rune", "heart_oracle", "step_oracle", "answer_oracle", "root_oracle"];
setupTapEdit("mSituationText", "situationEditArea", "situationEditTextarea", "situationEditSaveBtn", "situationEditCancelBtn", "situationEditSaved", "current_situation");
setupTapEdit("mPlaceText", "placeEditArea", "placeEditTextarea", "placeEditSaveBtn", "placeEditCancelBtn", "placeEditSaved", "place");
setupTapEdit("mStoryText", "storyEditArea", "storyEditTextarea", "storyEditSaveBtn", "storyEditCancelBtn", "storyEditSaved", "story");
setupTapEdit("mConnPrev", "connPrevEditArea", "connPrevEditTextarea", "connPrevEditSaveBtn", "connPrevEditCancelBtn", "connPrevEditSaved", "connections.prev");
setupTapEdit("mConnNext", "connNextEditArea", "connNextEditTextarea", "connNextEditSaveBtn", "connNextEditCancelBtn", "connNextEditSaved", "connections.next");
setupTapEdit("mPersonIntent", "personIntentEditArea", "personIntentEditTextarea", "personIntentEditSaveBtn", "personIntentEditCancelBtn", "personIntentEditSaved", "person.intent");
setupTapEdit("mPersonAction", "personActionEditArea", "personActionEditTextarea", "personActionEditSaveBtn", "personActionEditCancelBtn", "personActionEditSaved", "person.action");
setupTapEdit("mPersonQuote", "personQuoteEditArea", "personQuoteEditTextarea", "personQuoteEditSaveBtn", "personQuoteEditCancelBtn", "personQuoteEditSaved", "person.quote");
setupTapEdit("mUp", "upEditArea", "upEditTextarea", "upEditSaveBtn", "upEditCancelBtn", "upEditSaved", c => SIMPLE_DECKS.includes(c.deck) ? "meaning" : "upright");
setupTapEdit("mRv", "rvEditArea", "rvEditTextarea", "rvEditSaveBtn", "rvEditCancelBtn", "rvEditSaved", "reversed");
setupTapEdit("mLove", "loveEditArea", "loveEditTextarea", "loveEditSaveBtn", "loveEditCancelBtn", "loveEditSaved", "love");
setupTapEdit("mWork", "workEditArea", "workEditTextarea", "workEditSaveBtn", "workEditCancelBtn", "workEditSaved", "work");
setupTapEdit("mMnemonicText", "mnemonicEditArea", "mnemonicEditTextarea", "mnemonicEditSaveBtn", "mnemonicEditCancelBtn", "mnemonicEditSaved", "mnemonic");
setupTapEdit("mConnContrast", "connContrastEditArea", "connContrastEditTextarea", "connContrastEditSaveBtn", "connContrastEditCancelBtn", "connContrastEditSaved", "connections.contrast");
function getSymbolLabel(card, index) {
  const key = symbolNoteKey(card, index);
  const note = symbolNotes[key];
  return (note && note.label) ? note.label : card.symbols[index].label;
}
function getSymbolTitle(card, index) {
  const key = symbolNoteKey(card, index);
  const note = symbolNotes[key];
  return (note && note.title) ? note.title : card.symbols[index].title;
}
function getSymbolText(card, index) {
  const key = symbolNoteKey(card, index);
  const note = symbolNotes[key];
  return (note && note.text) ? note.text : card.symbols[index].text;
}
zukanVersionReady.then(() => fetch("/api/symbol-notes")).then(r => r.ok ? r.json() : {}).then(data => {
  symbolNotes = data || {};
}).catch(() => {});

let addedSymbols = {};
let currentAddedSymbolId = null;
zukanVersionReady.then(() => fetch("/api/added-symbols")).then(r => r.ok ? r.json() : {}).then(data => {
  addedSymbols = data || {};
}).catch(() => {
  // オフライン版：ビルド時に焼き込まれたスナップショットを使う
  if (window.OFFLINE_ADDED_SYMBOLS) addedSymbols = window.OFFLINE_ADDED_SYMBOLS;
});

function renderAddedChips(card) {
  const chipRow = document.getElementById("mSymbolChipRow");
  chipRow.querySelectorAll(".added-symbol-chip").forEach(el => el.remove());
  (addedSymbols[card.id] || []).forEach(s => {
    const chip = document.createElement("span");
    chip.className = "symbol-chip added-symbol-chip";
    chip.textContent = s.label;
    chip.addEventListener("click", () => openAddedSymbolDetail(card, s));
    chipRow.appendChild(chip);
  });
}

function openAddedSymbolDetail(card, s) {
  if (!symbolDetailBackdrop.classList.contains("hidden") &&
      currentAddedSymbolId === s.id && currentSymbolDetailCard === card) {
    symbolDetailBackdrop.classList.add("hidden");
    return;
  }
  currentSymbolDetailCard = card;
  currentSymbolDetailIndex = null;
  currentAddedSymbolId = s.id;
  document.getElementById("symbolDetailEyebrow").textContent = card.name_jp + " のシンボル";
  document.getElementById("symbolDetailTitle").textContent = s.title;
  document.getElementById("symbolDetailText").textContent = s.text;
  document.getElementById("symbolEditArea").classList.remove("show");
  document.getElementById("symbolEditSaved").classList.remove("show");
  document.getElementById("symbolDetailText").style.display = "block";
  document.getElementById("symbolDetailTitle").style.display = "block";
  document.getElementById("symbolDeleteBtn").style.display = "inline-block";
  const deleteLink = document.getElementById("symbolDetailDeleteLink");
  deleteLink.textContent = "削除";
  deleteLink.style.display = "inline-block";
  symbolDetailBackdrop.classList.remove("hidden");
}

document.getElementById("addSymbolLink").addEventListener("click", () => {
  document.getElementById("addSymbolLabelInput").value = "";
  document.getElementById("addSymbolTitleInput").value = "";
  document.getElementById("addSymbolTextInput").value = "";
  document.getElementById("addSymbolArea").classList.add("show");
});
document.getElementById("addSymbolCancelBtn").addEventListener("click", () => {
  document.getElementById("addSymbolArea").classList.remove("show");
});
document.getElementById("addSymbolSaveBtn").addEventListener("click", () => {
  const card = currentGridList[currentModalIndex];
  if (!card) return;
  const label = document.getElementById("addSymbolLabelInput").value.trim();
  const title = document.getElementById("addSymbolTitleInput").value.trim();
  const text = document.getElementById("addSymbolTextInput").value.trim();
  if (!label || !title || !text) {
    alert("ラベル・タイトル・説明文をすべて入力してください。");
    return;
  }
  zukanPost("/api/added-symbols", { cardId: card.id, label: label, title: title, text: text }).then(data => {
    if (data && data.symbols) addedSymbols[card.id] = data.symbols;
    renderAddedChips(card);
    document.getElementById("addSymbolArea").classList.remove("show");
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});

document.getElementById("mCatchQuote").addEventListener("click", () => {
  const card = currentGridList[currentModalIndex];
  if (!card) return;
  document.getElementById("catchEditTextarea").value = getCardFieldText(card, "catchphrase");
  document.getElementById("mCatchQuote").style.display = "none";
  document.getElementById("catchEditArea").classList.add("show");
  document.getElementById("catchEditSaved").classList.remove("show");
});
document.getElementById("catchEditCancelBtn").addEventListener("click", () => {
  document.getElementById("catchEditArea").classList.remove("show");
  document.getElementById("mCatchQuote").style.display = "inline";
});
document.getElementById("catchEditSaveBtn").addEventListener("click", () => {
  const card = currentGridList[currentModalIndex];
  if (!card) return;
  const newText = document.getElementById("catchEditTextarea").value.trim();
  if (!newText) return;
  const key = card.id + ":catchphrase";
  zukanPost("/api/symbol-notes", { key: key, text: newText }).then(() => {
    symbolNotes[key] = { text: newText };
    document.getElementById("mCatch").textContent = newText;
    document.getElementById("catchEditArea").classList.remove("show");
    document.getElementById("mCatchQuote").style.display = "inline";
    const savedEl = document.getElementById("catchEditSaved");
    savedEl.classList.add("show");
    setTimeout(() => savedEl.classList.remove("show"), 2000);
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
document.getElementById("symbolEditLink").addEventListener("click", () => {
  if (!currentSymbolDetailCard) return;
  if (currentAddedSymbolId) {
    const s = (addedSymbols[currentSymbolDetailCard.id] || []).find(x => x.id === currentAddedSymbolId);
    if (!s) return;
    document.getElementById("symbolEditLabelInput").value = s.label;
    document.getElementById("symbolEditTitleInput").value = s.title;
    document.getElementById("symbolEditTextarea").value = s.text;
  } else {
    document.getElementById("symbolEditLabelInput").value = getSymbolLabel(currentSymbolDetailCard, currentSymbolDetailIndex);
    document.getElementById("symbolEditTitleInput").value = getSymbolTitle(currentSymbolDetailCard, currentSymbolDetailIndex);
    document.getElementById("symbolEditTextarea").value = getSymbolText(currentSymbolDetailCard, currentSymbolDetailIndex);
  }
  document.getElementById("symbolDetailText").style.display = "none";
  document.getElementById("symbolDetailTitle").style.display = "none";
  document.getElementById("symbolEditArea").classList.add("show");
  document.getElementById("symbolEditSaved").classList.remove("show");
});
document.getElementById("symbolEditCancelBtn").addEventListener("click", () => {
  document.getElementById("symbolEditArea").classList.remove("show");
  document.getElementById("symbolDetailText").style.display = "block";
  document.getElementById("symbolDetailTitle").style.display = "block";
});
document.getElementById("symbolEditSaveBtn").addEventListener("click", () => {
  if (!currentSymbolDetailCard) return;
  const newLabel = document.getElementById("symbolEditLabelInput").value.trim();
  const newTitle = document.getElementById("symbolEditTitleInput").value.trim();
  const newText = document.getElementById("symbolEditTextarea").value.trim();
  if (!newLabel || !newTitle || !newText) return;
  const card = currentSymbolDetailCard;
  if (currentAddedSymbolId) {
    zukanPost("/api/added-symbols", { cardId: card.id, id: currentAddedSymbolId, label: newLabel, title: newTitle, text: newText }).then(data => {
      if (data && data.symbols) addedSymbols[card.id] = data.symbols;
      document.getElementById("symbolDetailTitle").textContent = newTitle;
      document.getElementById("symbolDetailText").textContent = newText;
      document.getElementById("symbolEditArea").classList.remove("show");
      document.getElementById("symbolDetailText").style.display = "block";
      document.getElementById("symbolDetailTitle").style.display = "block";
      renderSymbolsSection(card, true);
      const savedEl = document.getElementById("symbolEditSaved");
      savedEl.classList.add("show");
      setTimeout(() => savedEl.classList.remove("show"), 2000);
    }).catch(err => {
      if (err && err.zukanStale) return;
      alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
    });
    return;
  }
  const key = symbolNoteKey(currentSymbolDetailCard, currentSymbolDetailIndex);
  zukanPost("/api/symbol-notes", { key: key, label: newLabel, title: newTitle, text: newText }).then(() => {
    const existing = symbolNotes[key] || {};
    existing.label = newLabel;
    existing.title = newTitle;
    existing.text = newText;
    symbolNotes[key] = existing;
    document.getElementById("symbolDetailTitle").textContent = newTitle;
    document.getElementById("symbolDetailText").textContent = newText;
    document.getElementById("symbolEditArea").classList.remove("show");
    document.getElementById("symbolDetailText").style.display = "block";
    document.getElementById("symbolDetailTitle").style.display = "block";
    renderSymbolsSection(currentSymbolDetailCard, true);
    const savedEl = document.getElementById("symbolEditSaved");
    savedEl.classList.add("show");
    setTimeout(() => savedEl.classList.remove("show"), 2000);
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
document.getElementById("symbolDeleteBtn").addEventListener("click", () => {
  if (!currentSymbolDetailCard || !currentAddedSymbolId) return;
  if (!confirm("このラベルを削除しますか？")) return;
  const card = currentSymbolDetailCard;
  zukanPost("/api/added-symbols", { cardId: card.id, id: currentAddedSymbolId, delete: true }).then(data => {
    if (data && data.symbols) addedSymbols[card.id] = data.symbols;
    renderAddedChips(card);
    symbolDetailBackdrop.classList.add("hidden");
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("削除に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
document.getElementById("symbolDetailDeleteLink").addEventListener("click", () => {
  if (currentAddedSymbolId) {
    document.getElementById("symbolDeleteBtn").click();
    return;
  }
  if (!currentSymbolDetailCard || currentSymbolDetailIndex === null) return;
  const card = currentSymbolDetailCard;
  const index = currentSymbolDetailIndex;
  const key = symbolNoteKey(card, index);
  const newHidden = !isSymbolHidden(card, index);
  if (newHidden && !confirm("このシンボルを図鑑から非表示にしますか？（あとで「非表示にしたシンボル」から再表示できます）")) return;
  zukanPost("/api/symbol-notes", { key: key, hidden: newHidden }).then(() => {
    const existing = symbolNotes[key] || {};
    existing.hidden = newHidden;
    symbolNotes[key] = existing;
    symbolDetailBackdrop.classList.add("hidden");
    renderSymbolsSection(card);
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("処理に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
document.getElementById("symbolDetailClose").addEventListener("click", () => symbolDetailBackdrop.classList.add("hidden"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") symbolDetailBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modalBackdrop.classList.add("hidden"); });

// ---------- 【Context】の自由項目（タイトル＋説明） ----------
let ctxNotes = {};
let ctxCardId = null;
let ctxEditId = null;

zukanVersionReady.then(() => fetch("/api/context-notes")).then(r => r.ok ? r.json() : {}).then(data => {
  ctxNotes = data || {};
  renderCtxList();
}).catch(() => {
  if (window.OFFLINE_CONTEXT_NOTES) { ctxNotes = window.OFFLINE_CONTEXT_NOTES; renderCtxList(); }
});

function closeCtxEdit() {
  ctxEditId = null;
  document.getElementById("ctxEditArea").classList.remove("show");
  document.getElementById("ctxAddBtn").style.display = IS_OFFLINE_FILE_CTX ? "none" : "";
}
const IS_OFFLINE_FILE_CTX = location.protocol === "file:";
function openCtxEdit(note) {
  ctxEditId = note ? note.id : null;
  document.getElementById("ctxTitleInput").value = note ? note.title : "";
  document.getElementById("ctxTextInput").value = note ? note.text : "";
  document.getElementById("ctxDeleteBtn").style.display = note ? "inline-block" : "none";
  document.getElementById("ctxEditArea").classList.add("show");
  document.getElementById("ctxAddBtn").style.display = "none";
  document.getElementById("ctxTitleInput").focus();
}
function renderCtxList() {
  const listEl = document.getElementById("ctxList");
  if (!listEl || !ctxCardId) return;
  const list = ctxNotes[ctxCardId] || [];
  listEl.innerHTML = "";
  document.getElementById("ctxEmpty").style.display = list.length || IS_OFFLINE_FILE_CTX ? "none" : "block";
  document.querySelector(".ctx-free").style.display = (IS_OFFLINE_FILE_CTX && !list.length) ? "none" : "";
  list.forEach(n => {
    const row = document.createElement("div");
    row.className = "diamond-item";
    row.innerHTML = '<div class="diamond-item-title"></div><div class="diamond-item-text"></div>';
    row.querySelector(".diamond-item-title").textContent = n.title;
    row.querySelector(".diamond-item-text").textContent = n.text || "";
    if (!IS_OFFLINE_FILE_CTX) row.addEventListener("click", () => openCtxEdit(n));
    listEl.appendChild(row);
  });
}
function ctxPost(payload, failMsg) {
  return zukanPost("/api/context-notes", Object.assign({ cardId: ctxCardId }, payload)).then(data => {
    if (data && data.notes) ctxNotes[ctxCardId] = data.notes;
    closeCtxEdit();
    renderCtxList();
  }).catch(err => { if (!(err && err.zukanStale)) alert(failMsg); });
}
document.getElementById("ctxAddBtn").addEventListener("click", () => openCtxEdit(null));
document.getElementById("ctxCancelBtn").addEventListener("click", closeCtxEdit);
document.getElementById("ctxSaveBtn").addEventListener("click", () => {
  const title = document.getElementById("ctxTitleInput").value.trim();
  const text = document.getElementById("ctxTextInput").value.trim();
  if (!title) { document.getElementById("ctxTitleInput").focus(); return; }
  ctxPost({ id: ctxEditId, title, text }, "保存に失敗しました。通信状態を確認してもう一度お試しください。");
});
document.getElementById("ctxDeleteBtn").addEventListener("click", () => {
  if (!ctxEditId) return;
  if (!confirm("この項目を削除しますか？")) return;
  ctxPost({ id: ctxEditId, delete: true }, "削除に失敗しました。通信状態を確認してもう一度お試しください。");
});

// ---------- 【❖】ノート（タイトル＋説明。右下のMEMOとは別データ） ----------
let diamondNotes = {};
let diamondCardId = null;
let diamondEditId = null;

zukanVersionReady.then(() => fetch("/api/diamond-notes")).then(r => r.ok ? r.json() : {}).then(data => {
  diamondNotes = data || {};
  renderDiamondList();
}).catch(() => {
  // オフライン版：ビルド時に焼き込まれたスナップショットを使う
  if (window.OFFLINE_DIAMOND_NOTES) { diamondNotes = window.OFFLINE_DIAMOND_NOTES; renderDiamondList(); }
});

function closeDiamondEdit() {
  diamondEditId = null;
  document.getElementById("diamondEditArea").classList.remove("show");
  document.getElementById("diamondAddBtn").style.display = "";
}
function openDiamondEdit(note) {
  diamondEditId = note ? note.id : null;
  document.getElementById("diamondTitleInput").value = note ? note.title : "";
  document.getElementById("diamondTextInput").value = note ? note.text : "";
  document.getElementById("diamondDeleteBtn").style.display = note ? "inline-block" : "none";
  document.getElementById("diamondEditArea").classList.add("show");
  document.getElementById("diamondAddBtn").style.display = "none";
  document.getElementById("diamondTitleInput").focus();
}
function renderDiamondList() {
  const listEl = document.getElementById("diamondList");
  if (!listEl || !diamondCardId) return;
  const list = diamondNotes[diamondCardId] || [];
  listEl.innerHTML = "";
  document.getElementById("diamondEmpty").style.display = list.length ? "none" : "block";
  list.forEach(n => {
    const row = document.createElement("div");
    row.className = "diamond-item";
    row.innerHTML = '<div class="diamond-item-title"></div><div class="diamond-item-text"></div>';
    row.querySelector(".diamond-item-title").textContent = n.title;
    row.querySelector(".diamond-item-text").textContent = n.text || "";
    row.addEventListener("click", () => openDiamondEdit(n));
    listEl.appendChild(row);
  });
}
function diamondPost(payload, failMsg) {
  return zukanPost("/api/diamond-notes", Object.assign({ cardId: diamondCardId }, payload)).then(data => {
    if (data && data.notes) diamondNotes[diamondCardId] = data.notes;
    closeDiamondEdit();
    renderDiamondList();
  }).catch(err => { if (!(err && err.zukanStale)) alert(failMsg); });
}
document.getElementById("diamondAddBtn").addEventListener("click", () => openDiamondEdit(null));
document.getElementById("diamondCancelBtn").addEventListener("click", closeDiamondEdit);
document.getElementById("diamondSaveBtn").addEventListener("click", () => {
  const title = document.getElementById("diamondTitleInput").value.trim();
  const text = document.getElementById("diamondTextInput").value.trim();
  if (!title) { document.getElementById("diamondTitleInput").focus(); return; }
  diamondPost({ id: diamondEditId, title, text }, "保存に失敗しました。通信状態を確認してもう一度お試しください。");
});
document.getElementById("diamondDeleteBtn").addEventListener("click", () => {
  if (!diamondEditId) return;
  if (!confirm("このメモを削除しますか？")) return;
  diamondPost({ id: diamondEditId, delete: true }, "削除に失敗しました。通信状態を確認してもう一度お試しください。");
});

// ---------- MEMO ----------
const memoBackdrop = document.getElementById("memoBackdrop");
let cardMemos = {};
let currentMemoCardId = null;
let currentMemoEditId = null;

zukanVersionReady.then(() => fetch("/api/memos")).then(r => r.ok ? r.json() : {}).then(data => {
  cardMemos = data || {};
}).catch(() => {
  // オフライン版：ビルド時に焼き込まれたスナップショットを使う
  if (window.OFFLINE_MEMOS) cardMemos = window.OFFLINE_MEMOS;
});

function renderMemoList() {
  const list = cardMemos[currentMemoCardId] || [];
  const itemsEl = document.getElementById("memoListItems");
  const emptyEl = document.getElementById("memoListEmpty");
  itemsEl.innerHTML = "";
  emptyEl.style.display = list.length ? "none" : "block";
  list.forEach(m => {
    const row = document.createElement("div");
    row.className = "memo-list-item";
    row.innerHTML = `<div><div class="memo-list-item-title"></div><div class="memo-list-item-preview"></div></div><span>›</span>`;
    row.querySelector(".memo-list-item-title").textContent = m.title;
    row.querySelector(".memo-list-item-preview").textContent = m.text;
    row.addEventListener("click", () => openMemoEdit(m));
    itemsEl.appendChild(row);
  });
}

function openMemoList(cardId) {
  currentMemoCardId = cardId;
  document.getElementById("memoListView").style.display = "block";
  document.getElementById("memoEditView").classList.remove("show");
  renderMemoList();
  memoBackdrop.classList.remove("hidden");
}

function openMemoEdit(memo) {
  currentMemoEditId = memo ? memo.id : null;
  document.getElementById("memoTitleInput").value = memo ? memo.title : "";
  document.getElementById("memoTextInput").value = memo ? memo.text : "";
  document.getElementById("memoDeleteBtn").style.display = memo ? "inline-block" : "none";
  document.getElementById("memoListView").style.display = "none";
  document.getElementById("memoEditView").classList.add("show");
}

document.getElementById("memoTag").addEventListener("click", () => {
  const card = currentGridList[currentModalIndex];
  if (!card) return;
  openMemoList(card.id);
});
document.getElementById("memoAddBtn").addEventListener("click", () => openMemoEdit(null));
document.getElementById("memoBackLink").addEventListener("click", () => {
  document.getElementById("memoEditView").classList.remove("show");
  document.getElementById("memoListView").style.display = "block";
  renderMemoList();
});
document.getElementById("memoClose").addEventListener("click", () => memoBackdrop.classList.add("hidden"));
memoBackdrop.addEventListener("click", (e) => { if (e.target === memoBackdrop) memoBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") memoBackdrop.classList.add("hidden"); });

document.getElementById("memoSaveBtn").addEventListener("click", () => {
  const title = document.getElementById("memoTitleInput").value.trim();
  const text = document.getElementById("memoTextInput").value.trim();
  if (!title || !text) return;
  zukanPost("/api/memos", { cardId: currentMemoCardId, id: currentMemoEditId, title, text }).then(data => {
    if (data && data.memos) cardMemos[currentMemoCardId] = data.memos;
    document.getElementById("memoEditView").classList.remove("show");
    document.getElementById("memoListView").style.display = "block";
    renderMemoList();
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
document.getElementById("memoCancelBtn").addEventListener("click", () => {
  document.getElementById("memoEditView").classList.remove("show");
  document.getElementById("memoListView").style.display = "block";
});
document.getElementById("memoDeleteBtn").addEventListener("click", () => {
  if (!currentMemoEditId) return;
  if (!confirm("このメモを削除しますか？")) return;
  zukanPost("/api/memos", { cardId: currentMemoCardId, id: currentMemoEditId, delete: true }).then(data => {
    if (data && data.memos) cardMemos[currentMemoCardId] = data.memos;
    document.getElementById("memoEditView").classList.remove("show");
    document.getElementById("memoListView").style.display = "block";
    renderMemoList();
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("削除に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});

// ---------- キーワード編集 ----------
const kwEditBackdrop = document.getElementById("kwEditBackdrop");
let kwEditWorkingList = [];

function renderKwEditChips() {
  const row = document.getElementById("kwEditChipRow");
  row.innerHTML = "";
  kwEditWorkingList.forEach((k, i) => {
    const chip = document.createElement("span");
    chip.className = "kw-edit-chip";
    chip.innerHTML = `<span></span><span class="kw-remove-x">&times;</span>`;
    chip.querySelector("span").textContent = k;
    chip.querySelector(".kw-remove-x").addEventListener("click", () => {
      kwEditWorkingList.splice(i, 1);
      renderKwEditChips();
    });
    row.appendChild(chip);
  });
}

document.getElementById("kwEditLink").addEventListener("click", () => {
  const card = currentGridList[currentModalIndex];
  if (!card) return;
  kwEditWorkingList = getKeywordsList(card).slice();
  renderKwEditChips();
  document.getElementById("kwEditInput").value = "";
  document.getElementById("kwEditSaved").classList.remove("show");
  kwEditBackdrop.classList.remove("hidden");
});
document.getElementById("kwEditAddBtn").addEventListener("click", () => {
  const input = document.getElementById("kwEditInput");
  const val = input.value.trim();
  if (!val) return;
  kwEditWorkingList.push(val);
  input.value = "";
  renderKwEditChips();
});
document.getElementById("kwEditInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("kwEditAddBtn").click();
  }
});
document.getElementById("kwEditCancelBtn").addEventListener("click", () => kwEditBackdrop.classList.add("hidden"));
document.getElementById("kwEditClose").addEventListener("click", () => kwEditBackdrop.classList.add("hidden"));
kwEditBackdrop.addEventListener("click", (e) => { if (e.target === kwEditBackdrop) kwEditBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") kwEditBackdrop.classList.add("hidden"); });

document.getElementById("kwEditSaveBtn").addEventListener("click", () => {
  const card = currentGridList[currentModalIndex];
  if (!card) return;
  if (!kwEditWorkingList.length) {
    alert("キーワードを1つ以上残してください。");
    return;
  }
  const key = card.id + ":keywords";
  zukanPost("/api/symbol-notes", { key: key, text: JSON.stringify(kwEditWorkingList) }).then(() => {
    symbolNotes[key] = { text: JSON.stringify(kwEditWorkingList) };
    renderKeywords(card);
    const savedEl = document.getElementById("kwEditSaved");
    savedEl.classList.add("show");
    setTimeout(() => {
      savedEl.classList.remove("show");
      kwEditBackdrop.classList.add("hidden");
    }, 900);
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});

// ---------- 1枚引く ----------
let drawnCard = null, drawnReversed = false;
let drawMode = "reading"; // "reading" | "timing"
let currentDeck = "tarot"; // "tarot" | "lenormand"

document.querySelectorAll("#deckRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#deckRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentDeck = chip.dataset.deck;

    const timingChip = document.querySelector('#drawModeRow .chip[data-mode="timing"]');
    if (currentDeck === "lenormand" || currentDeck === "rune" || currentDeck === "marseille" || currentDeck === "heart_oracle" || currentDeck === "step_oracle" || currentDeck === "answer_oracle" || currentDeck === "root_oracle") {
      timingChip.style.display = "none";
      if (drawMode === "timing") {
        drawMode = "reading";
        document.querySelectorAll("#drawModeRow .chip").forEach(c => c.classList.remove("active"));
        document.querySelector('#drawModeRow .chip[data-mode="reading"]').classList.add("active");
      }
      document.getElementById("drawLead").textContent =
        currentDeck === "lenormand" ? "今日のあなたへの1枚（ルノルマン）" :
        currentDeck === "marseille" ? "今日のあなたへの1枚（マルセイユ版）" :
        currentDeck === "heart_oracle" ? "今日のあなたへの1枚（Heart Oracle）" :
        currentDeck === "step_oracle" ? "今日のあなたへの1枚（Step Oracle）" :
        currentDeck === "answer_oracle" ? "今日のあなたへの1枚（Answer Oracle）" :
        currentDeck === "root_oracle" ? "今日のあなたへの1枚（Root Oracle）" : "今日のあなたへの1枚（ルーン）";
      document.getElementById("drawSub").textContent = "静かに一呼吸してから、カードをタップしてください。";
    } else {
      timingChip.style.display = "inline-block";
      document.getElementById("drawLead").textContent = drawMode === "timing" ? "動き出す時期を占う1枚" : "今日のあなたへの1枚";
      document.getElementById("drawSub").textContent = drawMode === "timing" ? "「これはいつ頃動く？」と思いながら、カードをタップしてください。" : "静かに一呼吸してから、カードをタップしてください。";
    }
    resetDraw();
  });
});

document.querySelectorAll("#drawModeRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#drawModeRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    drawMode = chip.dataset.mode;
    if (drawMode === "timing") {
      document.getElementById("drawLead").textContent = "動き出す時期を占う1枚";
      document.getElementById("drawSub").textContent = "「これはいつ頃動く？」と思いながら、カードをタップしてください。";
    } else {
      document.getElementById("drawLead").textContent = "今日のあなたへの1枚";
      document.getElementById("drawSub").textContent = "静かに一呼吸してから、カードをタップしてください。";
    }
    resetDraw();
  });
});

function resetDraw() {
  drawnCard = null;
  document.getElementById("deckBack").style.display = "flex";
  document.getElementById("resultCard").classList.remove("show", "reversed");
  document.getElementById("resultDetail").style.display = "none";
  document.getElementById("drawNote").value = "";
  document.getElementById("saveDrawBtn").textContent = "記録に残す";
  document.getElementById("saveDrawBtn").disabled = false;
}

document.getElementById("deckBack").addEventListener("click", function () {
  if (drawnCard) return;
  const deck = this;
  deck.classList.add("shuffling");
  setTimeout(() => {
    deck.classList.remove("shuffling");
    deck.style.display = "none";

    const rc = document.getElementById("resultCard");

    if (currentDeck === "heart_oracle" || currentDeck === "step_oracle" || currentDeck === "answer_oracle" || currentDeck === "root_oracle") {
      const source = currentDeck === "heart_oracle" ? HEART_ORACLE_CARDS : currentDeck === "step_oracle" ? STEP_ORACLE_CARDS : currentDeck === "root_oracle" ? ROOT_ORACLE_CARDS : ANSWER_ORACLE_CARDS;
      drawnCard = source[Math.floor(Math.random() * source.length)];
      drawnReversed = false;

      document.getElementById("resultImg").src = drawnCard.img;
      rc.classList.remove("reversed");
      rc.classList.add("show");
      document.getElementById("resultOrient").textContent = "";
      document.getElementById("resultOrient").className = "result-orient up";

      document.getElementById("rEyebrow").textContent = currentDeck === "heart_oracle" ? "Sakuraco Heart Oracle" : currentDeck === "step_oracle" ? "Sakuraco Step Oracle" : currentDeck === "root_oracle" ? "Sakuraco Root Oracle" : "Sakuraco Answer Oracle";
      document.getElementById("rTitle").textContent = drawnCard.name_jp;
      document.getElementById("rMeaningSec").style.display = "block";
      document.getElementById("rLoveSec").style.display = "block";
      document.getElementById("rLoveLabel").textContent = currentDeck === "step_oracle" ? "後押しのひとこと" : currentDeck === "heart_oracle" ? "今のアプローチ" : currentDeck === "answer_oracle" ? "見極めのひとこと" : currentDeck === "root_oracle" ? "自分への問いかけ" : "恋愛での視点";
      const hasTiming = currentDeck === "heart_oracle";
      document.getElementById("rTimingTermSec").style.display = hasTiming ? "block" : "none";
      document.getElementById("rTimingFeatureSec").style.display = hasTiming ? "block" : "none";
      document.getElementById("rMeaningLabel").textContent = "意味";
      document.getElementById("rMeaning").textContent = drawnCard.meaning;
      document.getElementById("rLove").textContent = drawnCard.love;
      if (hasTiming) {
        document.getElementById("rTimingTerm").textContent = drawnCard.timing_term;
        document.getElementById("rTimingFeature").textContent = drawnCard.timing_feature + "／" + drawnCard.timing_place;
      }
      document.getElementById("resultDetail").style.display = "block";
      return;
    }

    if (currentDeck === "lenormand" || currentDeck === "rune") {
      const sourceArr = currentDeck === "lenormand" ? LENORMAND_CARDS : RUNE_CARDS;
      drawnCard = sourceArr[Math.floor(Math.random() * sourceArr.length)];
      drawnReversed = false;

      document.getElementById("resultImg").src = drawnCard.img;
      rc.classList.remove("reversed");
      rc.classList.add("show");
      document.getElementById("resultOrient").textContent = "";
      document.getElementById("resultOrient").className = "result-orient up";

      document.getElementById("rEyebrow").textContent = currentDeck === "lenormand" ? "ルノルマン" : "ルーン";
      document.getElementById("rLoveLabel").textContent = "恋愛での視点";
      document.getElementById("rTitle").textContent = drawnCard.name_jp;
      document.getElementById("rMeaningSec").style.display = "block";
      document.getElementById("rLoveSec").style.display = "block";
      document.getElementById("rTimingTermSec").style.display = "none";
      document.getElementById("rTimingFeatureSec").style.display = "none";
      document.getElementById("rMeaningLabel").textContent = "意味";
      document.getElementById("rMeaning").textContent = drawnCard.meaning;
      document.getElementById("rLove").textContent = drawnCard.love;
      document.getElementById("resultDetail").style.display = "block";
      return;
    }

    const tarotSource = currentDeck === "marseille" ? MARSEILLE_CARDS : CARDS;
    drawnCard = tarotSource[Math.floor(Math.random() * tarotSource.length)];
    drawnReversed = Math.random() < 0.5;
    document.getElementById("rLoveLabel").textContent = "恋愛での視点";

    document.getElementById("resultImg").src = drawnCard.img;
    rc.classList.toggle("reversed", drawnReversed);
    rc.classList.add("show");
    document.getElementById("resultOrient").textContent = drawnReversed ? "逆位置" : "正位置";
    document.getElementById("resultOrient").className = "result-orient " + (drawnReversed ? "rv" : "up");

    document.getElementById("rEyebrow").textContent = SUIT_LABEL[drawnCard.arcana] + " " + SUIT_JA_SHORT[drawnCard.arcana] + (currentDeck === "marseille" ? "（マルセイユ版）" : "");

    if (drawMode === "timing") {
      const t = getTiming(drawnCard);
      document.getElementById("rTitle").textContent = drawnCard.name_jp;
      document.getElementById("rMeaningSec").style.display = "none";
      document.getElementById("rLoveSec").style.display = "none";
      document.getElementById("rTimingTermSec").style.display = "block";
      document.getElementById("rTimingFeatureSec").style.display = "block";
      document.getElementById("rTimingTerm").textContent = t.term;
      document.getElementById("rTimingFeature").textContent = t.feature;
    } else {
      document.getElementById("rTitle").textContent = drawnCard.name_jp + (drawnReversed ? "（逆位置）" : "（正位置）");
      document.getElementById("rMeaningSec").style.display = "block";
      document.getElementById("rLoveSec").style.display = "block";
      document.getElementById("rTimingTermSec").style.display = "none";
      document.getElementById("rTimingFeatureSec").style.display = "none";
      document.getElementById("rMeaningLabel").textContent = drawnReversed ? "意味（逆位置）" : "意味（正位置）";
      document.getElementById("rMeaning").textContent = drawnReversed ? drawnCard.reversed : drawnCard.upright;
      document.getElementById("rLove").textContent = drawnCard.love;
    }
    document.getElementById("resultDetail").style.display = "block";
  }, 900);
});

document.getElementById("redrawBtn").addEventListener("click", resetDraw);

document.getElementById("saveDrawBtn").addEventListener("click", () => {
  if (!drawnCard) return;
  const note = document.getElementById("drawNote").value.trim();
  const entry = {
    date: new Date().toISOString(),
    cardId: drawnCard.id,
    name: drawnCard.name_jp,
    reversed: drawnReversed,
    note: note,
    mode: drawMode,
    deck: currentDeck
  };
  if (ZUKAN_IS_OFFLINE_FILE) {
    const entries = loadJournal();
    entries.unshift(entry);
    saveJournal(entries);
    document.getElementById("saveDrawBtn").textContent = "記録しました ✓";
    document.getElementById("saveDrawBtn").disabled = true;
    return;
  }
  zukanPost("/api/journal", { entry }).then(data => {
    cloudJournal = data.entries || [];
    document.getElementById("saveDrawBtn").textContent = "記録しました ✓";
    document.getElementById("saveDrawBtn").disabled = true;
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("記録に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});

// ---------- 記録（ジャーナル） ----------
// localStorageの読み書きは、オフライン版(file://)での動作と、移行(クラウドへ送る)
// ボタンでのバックアップ・送信元データとして、そのまま残してある。
const JOURNAL_KEY = "tarot_journal_v1";
function loadJournal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY)) || []; } catch (e) { return []; }
}
function saveJournal(entries) {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}

// クラウド(KV)側の記録。オフライン版では使わず、常にlocalStorageを使う。
let cloudJournal = [];
let journalLoadFailed = false;
const journalReady = ZUKAN_IS_OFFLINE_FILE ? Promise.resolve() :
  zukanVersionReady.then(() => fetch("/api/journal", { cache: "no-store" }))
    .then(r => { if (!r.ok) throw new Error("load failed"); return r.json(); })
    .then(data => { cloudJournal = Array.isArray(data) ? data : []; journalLoadFailed = false; })
    .catch(() => { journalLoadFailed = true; })
    .then(() => { updateJournalLoadErrorBanner(); renderJournal(); });

function updateJournalLoadErrorBanner() {
  const banner = document.getElementById("journalLoadError");
  if (!banner) return;
  banner.style.display = (journalLoadFailed || memoFoldersLoadFailed || memoNotesLoadFailed) ? "block" : "none";
}

function findCard(id, deck) {
  if (deck === "lenormand") return LENORMAND_CARDS.find(c => c.id === id);
  if (deck === "rune") return RUNE_CARDS.find(c => c.id === id);
  if (deck === "marseille") return MARSEILLE_CARDS.find(c => c.id === id);
  if (deck === "heart_oracle") return HEART_ORACLE_CARDS.find(c => c.id === id);
  if (deck === "step_oracle") return STEP_ORACLE_CARDS.find(c => c.id === id);
  if (deck === "answer_oracle") return ANSWER_ORACLE_CARDS.find(c => c.id === id);
  if (deck === "root_oracle") return ROOT_ORACLE_CARDS.find(c => c.id === id);
  return CARDS.find(c => c.id === id);
}

function renderJournal() {
  const list = document.getElementById("journalList");
  updateJournalLoadErrorBanner();
  if (!ZUKAN_IS_OFFLINE_FILE && journalLoadFailed) {
    list.innerHTML = "";
    document.getElementById("journalEmpty").style.display = "none";
    return;
  }
  const entries = ZUKAN_IS_OFFLINE_FILE ? loadJournal() : cloudJournal;
  list.innerHTML = "";
  document.getElementById("journalEmpty").style.display = entries.length ? "none" : "block";
  entries.forEach((e, idx) => {
    const c = findCard(e.cardId, e.deck);
    if (!c) return;
    const d = new Date(e.date);
    const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const row = document.createElement("div");
    row.className = "jentry";
    row.innerHTML = `
      <img src="${c.img}" class="${e.reversed ? 'reversed' : ''}" alt="${c.name_jp}">
      <div class="jentry-body">
        <div class="jentry-date">${dateStr}</div>
        <div class="jentry-name">${e.name}${e.deck === 'lenormand' ? '<span class="jentry-orient">ルノルマン</span>' : (e.deck === 'rune' ? '<span class="jentry-orient">ルーン</span>' : (e.mode === 'timing' ? '<span class="jentry-orient">時期読み</span>' : `<span class="jentry-orient ${e.reversed ? 'rv' : ''}">${e.reversed ? '逆位置' : '正位置'}</span>`))}</div>
        ${e.note ? `<div class="jentry-note">${escapeHtml(e.note)}</div>` : ""}
      </div>
      <button class="jentry-del" title="削除" data-idx="${idx}" data-id="${e.id || ''}">&times;</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll(".jentry-del").forEach(btn => {
    btn.addEventListener("click", () => {
      if (ZUKAN_IS_OFFLINE_FILE) {
        const entries2 = loadJournal();
        entries2.splice(Number(btn.dataset.idx), 1);
        saveJournal(entries2);
        renderJournal();
        return;
      }
      // クラウド側は何番目かではなく、idで削除する。
      zukanPost("/api/journal", { delete: true, id: btn.dataset.id }).then(data => {
        cloudJournal = data.entries || [];
        renderJournal();
      }).catch(err => {
        if (err && err.zukanStale) return;
        alert("削除に失敗しました。通信状態を確認してもう一度お試しください。");
      });
    });
  });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

// ---------- スプレッド ----------
let currentSpreadDeck = "tarot";
let currentSpread = null;
let spreadDrawnCards = [];

function spreadDeckArray(deck) {
  if (deck === "lenormand") return LENORMAND_CARDS;
  if (deck === "rune") return RUNE_CARDS;
  if (deck === "marseille") return MARSEILLE_CARDS;
  if (deck === "heart_oracle") return HEART_ORACLE_CARDS;
  if (deck === "step_oracle") return STEP_ORACLE_CARDS;
  if (deck === "answer_oracle") return ANSWER_ORACLE_CARDS;
  if (deck === "root_oracle") return ROOT_ORACLE_CARDS;
  return CARDS;
}
function spreadCardMeaning(card) {
  return card.meaning || card.upright || "";
}
function spreadCardName(card) {
  if (card.deck === "rune") return card.name_en + "／" + card.name_jp;
  return card.name_jp;
}

function renderSpreadTypeChips() {
  const row = document.getElementById("spreadTypeRow");
  row.innerHTML = "";
  const list = SPREADS[currentSpreadDeck];
  list.forEach((sp, i) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (i === 0 ? " active" : "");
    chip.textContent = sp.name;
    chip.dataset.spreadId = sp.id;
    chip.addEventListener("click", () => {
      row.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentSpread = sp;
      resetSpreadBoard();
    });
    row.appendChild(chip);
  });
  currentSpread = list[0];
}

document.querySelectorAll("#spreadDeckRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#spreadDeckRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentSpreadDeck = chip.dataset.deck;
    renderSpreadTypeChips();
    resetSpreadBoard();
  });
});

function initSpreadTab() {
  if (document.getElementById("spreadTypeRow").children.length === 0) {
    renderSpreadTypeChips();
    resetSpreadBoard();
  }
}

function resetSpreadBoard() {
  spreadDrawnCards = [];
  const board = document.getElementById("spreadBoard");
  board.innerHTML = "";
  board.className = "spread-board";
  const lg = document.getElementById("spreadLegend");
  if (lg) lg.innerHTML = "";
}

document.getElementById("spreadDealBtn").addEventListener("click", () => {
  if (!currentSpread) return;
  const source = spreadDeckArray(currentSpreadDeck);
  const pool = [...source];
  const picked = [];
  for (let i = 0; i < currentSpread.count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  spreadDrawnCards = picked;
  renderSpreadBoard();
});

document.getElementById("spreadResetBtn").addEventListener("click", resetSpreadBoard);

function renderSpreadBoard() {
  const board = document.getElementById("spreadBoard");
  const layout = currentSpread.layout;
  board.className = "spread-board layout-" + layout;
  board.innerHTML = "";

  if (layout === "hexagram") {
    const R = 292, cx = 400, cy = 400;
    const pts = [0,1,2,3,4,5].map(i => {
      const angle = (i * 60 - 90) * Math.PI / 180;
      return [cx + R * Math.cos(angle), cy + R * Math.sin(angle)];
    });
    const triA = [pts[0], pts[2], pts[4]].map(p => p.join(",")).join(" ");
    const triB = [pts[1], pts[3], pts[5]].map(p => p.join(",")).join(" ");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "800");
    svg.setAttribute("height", "800");
    svg.style.cssText = "position:absolute; top:0; left:0; pointer-events:none;";
    svg.innerHTML = `<polygon points="${triA}" fill="none" stroke="var(--gold-dim)" stroke-width="2"/>
      <polygon points="${triB}" fill="none" stroke="var(--gold-dim)" stroke-width="2"/>`;
    board.appendChild(svg);
  }

  const positions = currentSpread.positions;
  const n = positions.length;
  const SLOT_W = layout === "celtic" ? 140 : 150;
  const SLOT_H = layout === "celtic" ? 230 : 290; // カード本体＋ラベル・名前分の余裕を含む概算サイズ
  let maxX = 0, maxY = 0;

  positions.forEach((pos, i) => {
    const card = spreadDrawnCards[i];
    const slot = document.createElement("div");
    slot.className = "spread-slot";

    if (layout === "celtic") {
      // 中央の十字（1現状・2障害・3顕在意識・4潜在意識・5過去・6近い未来）＋右の縦列（7〜10を下から上へ）
      const coords = [
        {x:190,y:345},{x:190,y:345,cross:1},{x:190,y:115},{x:190,y:575},
        {x:0,y:345},{x:380,y:345},
        {x:570,y:690},{x:570,y:460},{x:570,y:230},{x:570,y:0}
      ];
      const c = coords[i] || {x:0,y:0};
      slot.style.left = c.x + "px";
      slot.style.top = c.y + "px";
      if (c.cross) slot.classList.add("celtic-cross");
      maxX = Math.max(maxX, c.x + SLOT_W);
      maxY = Math.max(maxY, c.y + SLOT_H);
    }
    if (layout === "horoscope") {
      const R = 367, cx = 467, cy = 467;
      const angle = (i * 30 - 90) * Math.PI / 180;
      const left = cx + R * Math.cos(angle) - 65;
      const top = cy + R * Math.sin(angle) - 100;
      slot.style.left = left + "px";
      slot.style.top = top + "px";
      maxX = Math.max(maxX, left + SLOT_W);
      maxY = Math.max(maxY, top + SLOT_H);
    }
    if (layout === "hexagram") {
      // 1過去(真上) 2現在(右下) 3未来(左下) ＝上向き△ ／ 4対策(真下) 5相手(左上) 6自分(右上) ＝下向き▽ ／ 7結果(中央)
      const R = 292, cx = 400, cy = 400;
      const STAR_POS = [0, 2, 4, 3, 5, 1]; // 位置番号 → 星の頂点（0=真上から時計回りに60°刻み）
      let left, top;
      if (i === 6) {
        left = cx - 65;
        top = cy - 100;
      } else {
        const angle = (STAR_POS[i] * 60 - 90) * Math.PI / 180;
        left = cx + R * Math.cos(angle) - 65;
        top = cy + R * Math.sin(angle) - 100;
      }
      slot.style.left = left + "px";
      slot.style.top = top + "px";
      maxX = Math.max(maxX, left + SLOT_W);
      maxY = Math.max(maxY, top + SLOT_H);
    }

    const label = document.createElement("div");
    label.className = "slot-label";
    label.textContent = (n <= 12 ? (i+1) + " " : "") + pos.label;
    slot.appendChild(label);

    const cardBox = document.createElement("div");
    cardBox.className = "slot-card" + (card ? "" : " empty");
    if (card) {
      const img = document.createElement("img");
      img.src = card.img;
      img.alt = spreadCardName(card);
      cardBox.appendChild(img);
    } else {
      cardBox.textContent = "?";
    }
    if (layout === "celtic" && i === 1) {
      const badge = document.createElement("div");
      badge.className = "celtic-badge";
      badge.textContent = "2 " + pos.label;
      cardBox.appendChild(badge);
    }
    slot.appendChild(cardBox);

    if (n <= 12) {
      const nameEl = document.createElement("div");
      nameEl.className = "slot-name";
      nameEl.textContent = card ? spreadCardName(card) : "";
      slot.appendChild(nameEl);
    }

    if (card) {
      slot.addEventListener("click", () => openSpreadDetail(pos, card, i+1));
    }

    board.appendChild(slot);
  });

  fitAbsoluteLayoutToScreen(board, layout, maxX, maxY);
  renderSpreadLegend(layout, positions);
}

// 固定座標レイアウトは重なりや縮小で文字が読みにくいため、位置の意味を一覧でも表示する
function renderSpreadLegend(layout, positions) {
  const lg = document.getElementById("spreadLegend");
  if (!lg) return;
  lg.innerHTML = "";
  if (!(layout === "celtic" || layout === "hexagram" || layout === "horoscope")) return;
  positions.forEach((pos, i) => {
    const card = spreadDrawnCards[i];
    const row = document.createElement("div");
    row.className = "lg-row";
    const no = document.createElement("div");
    no.className = "lg-no";
    no.textContent = i + 1;
    const body = document.createElement("div");
    const head = document.createElement("div");
    const l = document.createElement("span");
    l.className = "lg-label";
    l.textContent = pos.label;
    head.appendChild(l);
    if (card) {
      const n = document.createElement("span");
      n.className = "lg-card";
      n.textContent = spreadCardName(card);
      head.appendChild(n);
    }
    const d = document.createElement("div");
    d.className = "lg-desc";
    d.textContent = pos.desc;
    body.appendChild(head);
    body.appendChild(d);
    row.appendChild(no);
    row.appendChild(body);
    if (card) row.addEventListener("click", () => openSpreadDetail(pos, card, i + 1));
    lg.appendChild(row);
  });
}

function fitAbsoluteLayoutToScreen(board, layout, naturalW, naturalH) {
  const isAbsoluteLayout = layout === "celtic" || layout === "horoscope" || layout === "hexagram";
  board.style.transform = "";
  board.style.width = "";
  board.style.height = "";
  board.style.marginBottom = "";
  if (!isAbsoluteLayout) return;

  if (window.innerWidth > 760) return; // デスクトップはそのままのサイズで表示

  const available = window.innerWidth - 32; // .view の左右パディング(16px×2)分を差し引く
  const scale = Math.min(available / naturalW, 1);
  board.style.width = naturalW + "px";
  board.style.height = naturalH + "px";
  board.style.transform = `scale(${scale})`;
  board.style.transformOrigin = "top left";
  board.style.marginBottom = -(naturalH - naturalH * scale) + "px";
}

window.addEventListener("resize", () => {
  const board = document.getElementById("spreadBoard");
  if (currentSpread && spreadDrawnCards.length && board.querySelector(".spread-slot")) {
    renderSpreadBoard();
  }
});

const spreadDetailBackdrop = document.getElementById("spreadDetailBackdrop");
function openSpreadDetail(pos, card, index) {
  document.getElementById("spreadDetailPos").textContent = index + " ｜ " + pos.label;
  document.getElementById("spreadDetailTitle").textContent = spreadCardName(card);
  document.getElementById("spreadDetailPosDesc").textContent = pos.desc;
  document.getElementById("spreadDetailCardMeaning").textContent = spreadCardMeaning(card);
  spreadDetailBackdrop.classList.remove("hidden");
}
document.getElementById("spreadDetailClose").addEventListener("click", () => spreadDetailBackdrop.classList.add("hidden"));
spreadDetailBackdrop.addEventListener("click", (e) => { if (e.target === spreadDetailBackdrop) spreadDetailBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") spreadDetailBackdrop.classList.add("hidden"); });

// ---------- 組み合わせ引き ----------
function getComboDecks() {
  const mode = document.querySelector("#comboModeRow .chip.active").dataset.combo;
  if (mode === "three") {
    const deckX = document.querySelector("#comboDeckXRow .chip.active").dataset.deck;
    const deckY = document.querySelector("#comboDeckYRow .chip.active").dataset.deck;
    const deckZ = document.querySelector("#comboDeckZRow .chip.active").dataset.deck;
    return [deckX, deckY, deckZ];
  }
  const deckA = document.querySelector("#comboDeckARow .chip.active").dataset.deck;
  const deckB = document.querySelector("#comboDeckBRow .chip.active").dataset.deck;
  return [deckA, deckB];
}

function renderComboDeckStage() {
  document.getElementById("comboBoard").innerHTML = "";
  const decks = getComboDecks();
  const stage = document.getElementById("comboDeckStage");
  stage.innerHTML = "";
  decks.forEach((deck, i) => {
    const slot = document.createElement("div");
    slot.className = "combo-deck-slot";
    const back = document.createElement("div");
    back.className = "deck-back";
    back.innerHTML = '<span class="glyph">&#10022;</span>';
    back.addEventListener("click", () => drawComboDecks());
    slot.appendChild(back);
    const label = document.createElement("div");
    label.className = "deck-label";
    label.textContent = DECK_LABEL[deck];
    slot.appendChild(label);
    stage.appendChild(slot);
  });
}

document.querySelectorAll("#comboModeRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#comboModeRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    document.getElementById("comboThreePicker").style.display = chip.dataset.combo === "three" ? "block" : "none";
    document.getElementById("comboTwoPicker").style.display = chip.dataset.combo === "two" ? "block" : "none";
    renderComboDeckStage();
  });
});

function setupComboDeckRow(rowId, groupRowIds) {
  document.querySelectorAll(`#${rowId} .chip`).forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(`#${rowId} .chip`).forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderComboDeckStage();
    });
  });
}
setupComboDeckRow("comboDeckARow", ["comboDeckARow", "comboDeckBRow"]);
setupComboDeckRow("comboDeckBRow", ["comboDeckARow", "comboDeckBRow"]);
setupComboDeckRow("comboDeckXRow", ["comboDeckXRow", "comboDeckYRow", "comboDeckZRow"]);
setupComboDeckRow("comboDeckYRow", ["comboDeckXRow", "comboDeckYRow", "comboDeckZRow"]);
setupComboDeckRow("comboDeckZRow", ["comboDeckXRow", "comboDeckYRow", "comboDeckZRow"]);

function drawOneFrom(deck) {
  const arr = spreadDeckArray(deck);
  return arr[Math.floor(Math.random() * arr.length)];
}
const DECK_LABEL = { tarot: "タロット（RWS）", marseille: "タロット（マルセイユ）", lenormand: "ルノルマン", rune: "ルーン", heart_oracle: "Heart Oracle", step_oracle: "Step Oracle", answer_oracle: "Answer Oracle", root_oracle: "Root Oracle" };

function renderComboCard(deck, card) {
  const wrap = document.createElement("div");
  wrap.className = "spread-slot";
  wrap.style.cursor = "default";

  const label = document.createElement("div");
  label.className = "slot-label";
  label.textContent = DECK_LABEL[deck];
  wrap.appendChild(label);

  const cardBox = document.createElement("div");
  cardBox.className = "slot-card";
  cardBox.style.width = "150px";
  cardBox.style.cursor = "zoom-in";
  const img = document.createElement("img");
  img.src = card.img;
  img.alt = spreadCardName(card);
  cardBox.appendChild(img);
  cardBox.addEventListener("click", () => openImageZoom(img.src, img.alt));
  wrap.appendChild(cardBox);

  const nameEl = document.createElement("div");
  nameEl.className = "slot-name";
  nameEl.style.fontSize = "13px";
  nameEl.style.maxWidth = "160px";
  nameEl.textContent = spreadCardName(card);
  wrap.appendChild(nameEl);

  const meaningEl = document.createElement("div");
  meaningEl.style.cssText = "font-size:13px; line-height:1.7; color:var(--text-dim); max-width:170px; margin-top:8px; text-align:left;";
  meaningEl.textContent = spreadCardMeaning(card);
  wrap.appendChild(meaningEl);

  return wrap;
}

function drawComboDecks() {
  const stage = document.getElementById("comboDeckStage");
  if (stage.dataset.drawn) return;
  stage.dataset.drawn = "1";

  const mode = document.querySelector("#comboModeRow .chip.active").dataset.combo;
  let decks;
  if (mode === "three") {
    const deckX = document.querySelector("#comboDeckXRow .chip.active").dataset.deck;
    const deckY = document.querySelector("#comboDeckYRow .chip.active").dataset.deck;
    const deckZ = document.querySelector("#comboDeckZRow .chip.active").dataset.deck;
    decks = [deckX, deckY, deckZ];
  } else {
    const deckA = document.querySelector("#comboDeckARow .chip.active").dataset.deck;
    const deckB = document.querySelector("#comboDeckBRow .chip.active").dataset.deck;
    decks = [deckA, deckB];
  }

  stage.querySelectorAll(".deck-back").forEach(b => b.classList.add("shuffling"));

  setTimeout(() => {
    stage.style.display = "none";
    const board = document.getElementById("comboBoard");
    board.innerHTML = "";
    decks.forEach(deck => {
      const card = drawOneFrom(deck);
      board.appendChild(renderComboCard(deck, card));
    });
  }, 900);
}

document.getElementById("comboResetBtn").addEventListener("click", () => {
  document.getElementById("comboBoard").innerHTML = "";
  const stage = document.getElementById("comboDeckStage");
  stage.style.display = "flex";
  stage.dataset.drawn = "";
  renderComboDeckStage();
});

// ---------- 画像拡大表示 ----------
const imageZoomBackdrop = document.getElementById("imageZoomBackdrop");
function openImageZoom(src, alt) {
  document.getElementById("imageZoomImg").src = src;
  document.getElementById("imageZoomImg").alt = alt || "";
  imageZoomBackdrop.classList.remove("hidden");
}
document.getElementById("imageZoomClose").addEventListener("click", () => imageZoomBackdrop.classList.add("hidden"));
imageZoomBackdrop.addEventListener("click", () => imageZoomBackdrop.classList.add("hidden"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") imageZoomBackdrop.classList.add("hidden"); });

document.getElementById("zoomBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const img = document.getElementById("modalImg");
  openImageZoom(img.src, img.alt);
});

// 1枚引く：引いた結果のカード画像も拡大できるように
document.getElementById("resultCard").addEventListener("click", () => {
  const img = document.getElementById("resultImg");
  if (img.src) openImageZoom(img.src, img.alt);
});

// 組み合わせ引き：カード画像クリックで拡大

// ---------- 講座 ----------
// localStorageの読み書きは、オフライン版(file://)での動作と、移行(クラウドへ送る)
// ボタンでのバックアップ・送信元データとして、そのまま残してある。
const COURSE_MEMO_KEY = "tarot_course_memo_v1";
function loadCourseMemos() {
  try { return JSON.parse(localStorage.getItem(COURSE_MEMO_KEY)) || {}; } catch (e) { return {}; }
}
function saveCourseMemo(courseId, text) {
  const memos = loadCourseMemos();
  memos[courseId] = text;
  localStorage.setItem(COURSE_MEMO_KEY, JSON.stringify(memos));
}

// クラウド(KV)側の講座メモ。オフライン版では使わず、常にlocalStorageを使う。
let cloudCourseMemos = {};
let courseMemosLoadFailed = false;
const courseMemosReady = ZUKAN_IS_OFFLINE_FILE ? Promise.resolve() :
  zukanVersionReady.then(() => fetch("/api/course-memos", { cache: "no-store" }))
    .then(r => { if (!r.ok) throw new Error("load failed"); return r.json(); })
    .then(data => { cloudCourseMemos = (data && typeof data === "object") ? data : {}; courseMemosLoadFailed = false; })
    .catch(() => { courseMemosLoadFailed = true; });
function getCourseMemo(courseId) {
  if (ZUKAN_IS_OFFLINE_FILE) return loadCourseMemos()[courseId] || "";
  return cloudCourseMemos[courseId] || "";
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// 講座データ：courses.js の初期講座 ＋ KV(/api/courses)に保存した上書き・新規登録分
let courseStore = { courses: {}, order: [] };
const IS_OFFLINE_FILE = location.protocol === "file:";

zukanVersionReady.then(() => fetch("/api/courses")).then(r => r.ok ? r.json() : null).then(data => {
  if (data) courseStore = { courses: data.courses || {}, order: data.order || [] };
  renderCourseList();
}).catch(() => {
  // オフライン版：ビルド時に焼き込まれたスナップショットを使う
  if (window.OFFLINE_COURSES) {
    courseStore = { courses: window.OFFLINE_COURSES.courses || {}, order: window.OFFLINE_COURSES.order || [] };
    renderCourseList();
  }
});

function isBuiltinCourse(id) { return COURSES.some(c => c.id === id); }
function getAllCourses() {
  const list = COURSES.map(c => courseStore.courses[c.id] || c);
  courseStore.order.forEach(id => {
    if (!isBuiltinCourse(id) && courseStore.courses[id]) list.push(courseStore.courses[id]);
  });
  return list;
}
function getCourseById(id) { return getAllCourses().find(c => c.id === id) || null; }

function renderCourseList() {
  const list = document.getElementById("courseList");
  document.getElementById("courseToolbar").style.display = IS_OFFLINE_FILE ? "none" : "";
  list.innerHTML = "";
  getAllCourses().forEach(course => {
    const card = document.createElement("div");
    card.className = "course-card";
    card.innerHTML = `
      <div class="course-title">${escHtml(course.title)}</div>
      <div class="course-sub">${escHtml(course.subtitle)}</div>
      <div class="course-meta">${(course.tags || []).map(t => `<span class="course-tag">${escHtml(t)}</span>`).join("")}</div>`;
    card.addEventListener("click", () => openCourseDetail(course));
    list.appendChild(card);
  });
}

// ---- 講座のプログラム行ごとのMEMO（ラベルを押すと開く。保存先はKV） ----
let courseRowMemos = {};
zukanVersionReady.then(() => fetch("/api/course-row-memos")).then(r => r.ok ? r.json() : {}).then(d => {
  courseRowMemos = d || {};
  document.querySelectorAll(".course-program-item").forEach(r => r._refreshMemo && r._refreshMemo());
}).catch(() => { if (window.OFFLINE_COURSE_ROW_MEMOS) courseRowMemos = window.OFFLINE_COURSE_ROW_MEMOS; });

function setupRowMemo(row, courseId, idx) {
  const tag = row.querySelector(".cp-memo-tag");
  const area = row.querySelector(".cp-memo-area");
  const ta = area.querySelector("textarea");
  const saved = area.querySelector(".cp-memo-saved");
  const offline = location.protocol === "file:";
  const get = () => ((courseRowMemos[courseId] || {})[String(idx)]) || "";
  row._refreshMemo = () => tag.classList.toggle("has", !!get());
  row._refreshMemo();
  if (offline) { area.querySelector(".save").style.display = "none"; ta.readOnly = true; }
  tag.addEventListener("click", () => {
    const open = area.classList.toggle("show");
    tag.classList.toggle("open", open);
    if (open) { ta.value = get(); saved.textContent = ""; }
  });
  area.querySelector(".close").addEventListener("click", () => { area.classList.remove("show"); tag.classList.remove("open"); });
  area.querySelector(".save").addEventListener("click", () => {
    zukanPost("/api/course-row-memos", { courseId, idx, text: ta.value }).then(d => {
      courseRowMemos = d.memos || {};
      row._refreshMemo();
      saved.textContent = "保存しました";
      setTimeout(() => { saved.textContent = ""; }, 2000);
    }).catch(err => { if (!(err && err.zukanStale)) alert("保存に失敗しました。通信状態を確認してもう一度お試しください。"); });
  });
}

let currentCourseId = null;
const courseDetailBackdrop = document.getElementById("courseDetailBackdrop");

function openCourseDetail(course) {
  currentCourseId = course.id;
  document.getElementById("courseDetailTitle").textContent = course.title;
  document.getElementById("courseDetailSubtitle").textContent = course.subtitle || "";
  document.getElementById("courseEditLink").style.display = IS_OFFLINE_FILE ? "none" : "";

  const program = document.getElementById("courseProgram");
  program.innerHTML = "";
  (course.program || []).forEach((item, rowIdx) => {
    const row = document.createElement("div");
    row.className = "course-program-item";

    let descHtml = escHtml(item.desc);
    if (item.labels && item.labels.length) {
      item.labels.forEach((label, idx) => {
        const safeTitle = escHtml(label.title);
        if (safeTitle && descHtml.includes(safeTitle)) {
          descHtml = descHtml.replace(
            safeTitle,
            `<span class="inline-glossary-label" data-label-idx="${idx}">${safeTitle}</span>`
          );
        }
      });
    }

    row.innerHTML = `
      <div class="course-program-time">${escHtml(item.time)}</div>
      <div class="course-program-body">
        <div class="cp-title">${escHtml(item.title)}</div>
        <div class="cp-desc">${descHtml}</div>
        <span class="cp-memo-tag">MEMO</span>
        <div class="cp-memo-area">
          <textarea placeholder="この項目のメモ"></textarea>
          <div class="cp-memo-btns"><button type="button" class="save">保存</button><button type="button" class="close">閉じる</button><span class="cp-memo-saved"></span></div>
        </div>
      </div>`;
    setupRowMemo(row, course.id, rowIdx);

    if (item.labels && item.labels.length) {
      row.querySelectorAll(".inline-glossary-label").forEach(span => {
        const idx = Number(span.dataset.labelIdx);
        span.addEventListener("click", () => openCourseGlossary(item.labels[idx]));
      });
    }

    program.appendChild(row);
  });

  const memoBox = document.getElementById("courseMemoBox");
  const memoStatus = document.getElementById("courseMemoStatus");
  if (!ZUKAN_IS_OFFLINE_FILE && courseMemosLoadFailed) {
    memoBox.value = "";
    memoBox.readOnly = true;
    memoStatus.textContent = "読み込めませんでした。通信を確認してください。";
  } else {
    memoBox.readOnly = false;
    memoBox.value = getCourseMemo(course.id);
    memoStatus.textContent = "";
  }

  courseDetailBackdrop.classList.remove("hidden");
}

const courseGlossaryBackdrop = document.getElementById("courseGlossaryBackdrop");
function openCourseGlossary(term) {
  document.getElementById("courseGlossaryTitle").textContent = term.title;
  document.getElementById("courseGlossaryText").textContent = term.text;
  courseGlossaryBackdrop.classList.remove("hidden");
}
document.getElementById("courseGlossaryClose").addEventListener("click", () => courseGlossaryBackdrop.classList.add("hidden"));
courseGlossaryBackdrop.addEventListener("click", (e) => { if (e.target === courseGlossaryBackdrop) courseGlossaryBackdrop.classList.add("hidden"); });

document.getElementById("courseDetailClose").addEventListener("click", () => courseDetailBackdrop.classList.add("hidden"));
courseDetailBackdrop.addEventListener("click", (e) => { if (e.target === courseDetailBackdrop) courseDetailBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { courseEditBackdrop && courseEditBackdrop.classList.add("hidden"); courseDetailBackdrop.classList.add("hidden"); courseGlossaryBackdrop.classList.add("hidden"); } });

let courseMemoTimer = null;
document.getElementById("courseMemoBox").addEventListener("input", (e) => {
  if (!currentCourseId) return;
  clearTimeout(courseMemoTimer);
  const status = document.getElementById("courseMemoStatus");
  status.textContent = "";
  courseMemoTimer = setTimeout(() => {
    if (ZUKAN_IS_OFFLINE_FILE) {
      saveCourseMemo(currentCourseId, e.target.value);
      status.textContent = "保存しました";
      setTimeout(() => { status.textContent = ""; }, 1500);
      return;
    }
    zukanPost("/api/course-memos", { courseId: currentCourseId, text: e.target.value }).then(data => {
      cloudCourseMemos = (data && data.memos) || cloudCourseMemos;
      status.textContent = "保存しました";
      setTimeout(() => { status.textContent = ""; }, 1500);
    }).catch(err => {
      if (err && err.zukanStale) return;
      status.textContent = "保存に失敗しました";
    });
  }, 500);
});

// ---- 講座の新規登録・編集 ----
const courseEditBackdrop = document.getElementById("courseEditBackdrop");
let courseEditId = null;
let courseEditIsNew = false;

function makeCourseId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addLabelEditor(container, label) {
  const item = document.createElement("div");
  item.className = "ce-label-item";
  item.innerHTML = `
    <div class="ce-label-head">
      <input type="text" class="ce-input ce-lab-title" placeholder="用語（説明文に含まれる言葉）">
      <button type="button" class="ce-mini del" title="この用語ラベルを削除">&#10005;</button>
    </div>
    <textarea class="ce-textarea ce-lab-text" placeholder="タップしたときに開く解説"></textarea>`;
  item.querySelector(".ce-lab-title").value = label ? label.title : "";
  item.querySelector(".ce-lab-text").value = label ? label.text : "";
  item.querySelector(".del").addEventListener("click", () => item.remove());
  container.appendChild(item);
}

function addProgramRowEditor(item) {
  const rows = document.getElementById("ceProgramRows");
  const row = document.createElement("div");
  row.className = "ce-row";
  row.innerHTML = `
    <div class="ce-row-top">
      <input type="text" class="ce-input ce-time" placeholder="19:00〜19:05">
      <div class="ce-row-btns">
        <button type="button" class="ce-mini up" title="上へ">&uarr;</button>
        <button type="button" class="ce-mini down" title="下へ">&darr;</button>
        <button type="button" class="ce-mini del" title="この行を削除">&#10005;</button>
      </div>
    </div>
    <input type="text" class="ce-input ce-ptitle" placeholder="見出し（例：オープニング・自己紹介）">
    <textarea class="ce-textarea ce-desc" placeholder="説明"></textarea>
    <div class="ce-labels"></div>
    <button type="button" class="ce-link-btn ce-add-label">＋ 用語ラベルを追加</button>
    <div class="ce-hint">用語ラベル：説明文にその言葉が含まれていると下線が付き、タップで解説が開きます。</div>`;
  row.querySelector(".ce-time").value = item ? item.time : "";
  row.querySelector(".ce-ptitle").value = item ? item.title : "";
  row.querySelector(".ce-desc").value = item ? item.desc : "";
  const labelBox = row.querySelector(".ce-labels");
  ((item && item.labels) || []).forEach(l => addLabelEditor(labelBox, l));
  row.querySelector(".ce-add-label").addEventListener("click", () => addLabelEditor(labelBox, null));
  row.querySelector(".up").addEventListener("click", () => { if (row.previousElementSibling) rows.insertBefore(row, row.previousElementSibling); });
  row.querySelector(".down").addEventListener("click", () => { if (row.nextElementSibling) rows.insertBefore(row.nextElementSibling, row); });
  row.querySelector(".ce-row-btns .del").addEventListener("click", () => row.remove());
  rows.appendChild(row);
  return row;
}

function openCourseEdit(course) {
  courseEditIsNew = !course;
  courseEditId = course ? course.id : makeCourseId();
  document.getElementById("courseEditEyebrow").textContent = course ? "講座を編集" : "講座を新規登録";
  document.getElementById("ceTitle").value = course ? course.title : "";
  document.getElementById("ceSubtitle").value = course ? (course.subtitle || "") : "";
  document.getElementById("ceTags").value = course ? (course.tags || []).join("、") : "";
  document.getElementById("ceProgramRows").innerHTML = "";
  if (course && course.program && course.program.length) course.program.forEach(addProgramRowEditor);
  else addProgramRowEditor(null);

  const delBtn = document.getElementById("ceDeleteBtn");
  if (!course) delBtn.style.display = "none";
  else {
    delBtn.style.display = "inline-block";
    delBtn.textContent = isBuiltinCourse(course.id) ? "初期内容に戻す" : "削除";
  }
  courseEditBackdrop.classList.remove("hidden");
  courseEditBackdrop.querySelector(".course-edit-modal").scrollTop = 0;
}

function closeCourseEdit() { courseEditBackdrop.classList.add("hidden"); }

function collectCourseFromForm() {
  const program = [];
  document.querySelectorAll("#ceProgramRows .ce-row").forEach(row => {
    const labels = [];
    row.querySelectorAll(".ce-label-item").forEach(li => {
      const title = li.querySelector(".ce-lab-title").value.trim();
      if (title) labels.push({ title, text: li.querySelector(".ce-lab-text").value });
    });
    const item = {
      time: row.querySelector(".ce-time").value.trim(),
      title: row.querySelector(".ce-ptitle").value.trim(),
      desc: row.querySelector(".ce-desc").value
    };
    if (labels.length) item.labels = labels;
    if (item.time || item.title || item.desc) program.push(item);
  });
  return {
    id: courseEditId,
    title: document.getElementById("ceTitle").value.trim(),
    subtitle: document.getElementById("ceSubtitle").value.trim(),
    tags: document.getElementById("ceTags").value.split(/[、,，]/).map(t => t.trim()).filter(Boolean),
    program
  };
}

function coursePost(payload, failMsg) {
  return zukanPost("/api/courses", payload).then(data => {
    if (!data || !data.ok) throw new Error("save");
    courseStore = { courses: data.courses || {}, order: data.order || [] };
    return true;
  }).catch(err => { if (!(err && err.zukanStale)) alert(failMsg); return false; });
}

document.getElementById("courseNewBtn").addEventListener("click", () => openCourseEdit(null));
document.getElementById("courseEditLink").addEventListener("click", () => {
  const c = getCourseById(currentCourseId);
  if (c) openCourseEdit(c);
});
document.getElementById("ceAddRowBtn").addEventListener("click", () => {
  const row = addProgramRowEditor(null);
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  row.querySelector(".ce-time").focus();
});
document.getElementById("courseEditClose").addEventListener("click", closeCourseEdit);
document.getElementById("ceCancelBtn").addEventListener("click", closeCourseEdit);

document.getElementById("ceSaveBtn").addEventListener("click", () => {
  const course = collectCourseFromForm();
  if (!course.title) { document.getElementById("ceTitle").focus(); alert("タイトルを入力してください。"); return; }
  coursePost({ course, isNew: courseEditIsNew }, "保存に失敗しました。通信状態を確認してもう一度お試しください。").then(ok => {
    if (!ok) return;
    closeCourseEdit();
    renderCourseList();
    openCourseDetail(getCourseById(course.id) || course);
  });
});

document.getElementById("ceDeleteBtn").addEventListener("click", () => {
  const builtin = isBuiltinCourse(courseEditId);
  const msg = builtin ? "この講座を初期の内容に戻しますか？（編集した内容は消えます）" : "この講座を削除しますか？";
  if (!confirm(msg)) return;
  coursePost({ id: courseEditId, delete: true }, "処理に失敗しました。通信状態を確認してもう一度お試しください。").then(ok => {
    if (!ok) return;
    closeCourseEdit();
    renderCourseList();
    const back = builtin ? getCourseById(courseEditId) : null;
    if (back) openCourseDetail(back); else courseDetailBackdrop.classList.add("hidden");
  });
});

// ---------- init ----------
renderGrid();


// ---- バックアップ書き出し：3つのKVデータを1つのJSONファイルにまとめてダウンロード ----
(function setupBackupExport() {
  const link = document.getElementById("backupExportLink");
  if (!link) return;
  if (location.protocol === "file:") {
    document.getElementById("backupExportWrap").style.display = "none";
    return;
  }
  link.addEventListener("click", () => {
    const get = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); });
    link.textContent = "書き出し中…";
    Promise.all([
      get("/api/symbol-notes"), get("/api/added-symbols"), get("/api/memos"), get("/api/diamond-notes"),
      get("/api/courses"), get("/api/context-notes"), get("/api/course-row-memos"),
      get("/api/journal"), get("/api/memo-folders"), get("/api/memo-notes"), get("/api/course-memos"), get("/api/radio-scripts"), get("/api/radio-posts")
    ])
      .then(([symbolNotes, addedSymbols, memos, diamondNotes, courses, contextNotes, courseRowMemos, journal, memoFolders, memoNotes, courseMemos, radioScripts, radioPostsData]) => {
        const backup = {
          symbolNotes, addedSymbols, memos, diamondNotes, courses, contextNotes, courseRowMemos,
          journal, memoFolders, memoNotes, courseMemos, radioScripts, radioPosts: radioPostsData,
          exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "tarot-backup.json";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        link.textContent = "書き出しました（tarot-backup.json）";
        setTimeout(() => { link.textContent = "バックアップを書き出す（オフライン版の更新用）"; }, 4000);
      })
      .catch(() => {
        link.textContent = "バックアップを書き出す（オフライン版の更新用）";
        alert("書き出しに失敗しました。通信状態を確認してもう一度お試しください。");
      });
  });
})();

// ---------- 記録：メモ（フォルダ管理） ----------
// localStorageの読み書きは、オフライン版(file://)での動作と、移行(クラウドへ送る)
// ボタンでのバックアップ・送信元データとして、そのまま残してある。
const MEMO_FOLDERS_KEY = "tarot_memo_folders_v1";
const MEMO_NOTES_KEY = "tarot_memo_notes_v1";

function loadMemoFolders() {
  try { return JSON.parse(localStorage.getItem(MEMO_FOLDERS_KEY)) || []; } catch (e) { return []; }
}
function saveMemoFolders(folders) {
  localStorage.setItem(MEMO_FOLDERS_KEY, JSON.stringify(folders));
}
function loadMemoNotes() {
  try { return JSON.parse(localStorage.getItem(MEMO_NOTES_KEY)) || []; } catch (e) { return []; }
}
function saveMemoNotes(notes) {
  localStorage.setItem(MEMO_NOTES_KEY, JSON.stringify(notes));
}
function genMemoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// クラウド(KV)側のフォルダ・メモ。オフライン版では使わず、常にlocalStorageを使う。
let cloudMemoFolders = [];
let memoFoldersLoadFailed = false;
const memoFoldersReady = ZUKAN_IS_OFFLINE_FILE ? Promise.resolve() :
  zukanVersionReady.then(() => fetch("/api/memo-folders", { cache: "no-store" }))
    .then(r => { if (!r.ok) throw new Error("load failed"); return r.json(); })
    .then(data => { cloudMemoFolders = Array.isArray(data) ? data : []; memoFoldersLoadFailed = false; })
    .catch(() => { memoFoldersLoadFailed = true; })
    .then(() => { updateJournalLoadErrorBanner(); renderMemoFolderList(); });

let cloudMemoNotes = [];
let memoNotesLoadFailed = false;
const memoNotesReady = ZUKAN_IS_OFFLINE_FILE ? Promise.resolve() :
  zukanVersionReady.then(() => fetch("/api/memo-notes", { cache: "no-store" }))
    .then(r => { if (!r.ok) throw new Error("load failed"); return r.json(); })
    .then(data => { cloudMemoNotes = Array.isArray(data) ? data : []; memoNotesLoadFailed = false; })
    .catch(() => { memoNotesLoadFailed = true; })
    .then(() => { updateJournalLoadErrorBanner(); renderMemoFolderList(); });

function getMemoFolders() { return ZUKAN_IS_OFFLINE_FILE ? loadMemoFolders() : cloudMemoFolders; }
function getMemoNotes() { return ZUKAN_IS_OFFLINE_FILE ? loadMemoNotes() : cloudMemoNotes; }

let currentMemoFolderId = null;
let currentMemoNoteId = null;

// --- タブ切り替え ---
document.getElementById("journalTabDraws").addEventListener("click", () => {
  document.getElementById("journalTabDraws").classList.add("active");
  document.getElementById("journalTabMemos").classList.remove("active");
  document.getElementById("journalDrawsPane").style.display = "";
  document.getElementById("journalMemosPane").style.display = "none";
});
document.getElementById("journalTabMemos").addEventListener("click", () => {
  document.getElementById("journalTabMemos").classList.add("active");
  document.getElementById("journalTabDraws").classList.remove("active");
  document.getElementById("journalDrawsPane").style.display = "none";
  document.getElementById("journalMemosPane").style.display = "";
  showMemoFolderListScreen();
});

function showMemoScreen(name) {
  document.getElementById("memoFolderListScreen").style.display = name === "folders" ? "" : "none";
  document.getElementById("memoNoteListScreen").style.display = name === "notes" ? "" : "none";
  document.getElementById("memoNoteEditScreen").style.display = name === "edit" ? "" : "none";
}

// --- フォルダ一覧 ---
function showMemoFolderListScreen() {
  currentMemoFolderId = null;
  showMemoScreen("folders");
  renderMemoFolderList();
}
function renderMemoFolderList() {
  const itemsEl = document.getElementById("memoFolderListItems");
  if (!ZUKAN_IS_OFFLINE_FILE && (memoFoldersLoadFailed || memoNotesLoadFailed)) {
    itemsEl.innerHTML = "";
    document.getElementById("memoFolderEmpty").style.display = "none";
    return;
  }
  const folders = getMemoFolders();
  const notes = getMemoNotes();
  itemsEl.innerHTML = "";
  document.getElementById("memoFolderEmpty").style.display = folders.length ? "none" : "block";
  folders.forEach(f => {
    const count = notes.filter(n => n.folderId === f.id).length;
    const row = document.createElement("div");
    row.className = "memo-folder-item";
    row.innerHTML = `
      <span class="memo-folder-name"></span>
      <div class="memo-folder-item-actions">
        <span class="memo-folder-count">${count}件</span>
        <button type="button" class="memo-folder-rename-btn" title="フォルダ名を変更">&#9998;</button>
        <button type="button" class="memo-note-item-del" title="フォルダを削除">&times;</button>
      </div>
    `;
    row.querySelector(".memo-folder-name").textContent = f.name;
    row.querySelector(".memo-folder-rename-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      renameMemoFolder(f.id, f.name);
    });
    row.querySelector(".memo-note-item-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMemoFolder(f.id, f.name, count);
    });
    row.addEventListener("click", () => openMemoFolder(f.id));
    itemsEl.appendChild(row);
  });
}
document.getElementById("memoFolderAddLink").addEventListener("click", () => {
  const name = (prompt("フォルダ名を入力してください（空欄のままでも作成できます）") || "").trim();
  if (ZUKAN_IS_OFFLINE_FILE) {
    const folders = loadMemoFolders();
    folders.push({ id: genMemoId(), name: name || "無題フォルダ" });
    saveMemoFolders(folders);
    renderMemoFolderList();
    return;
  }
  zukanPost("/api/memo-folders", { folder: { name: name || "無題フォルダ" } }).then(data => {
    cloudMemoFolders = data.folders || [];
    renderMemoFolderList();
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("作成に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
function deleteMemoFolder(folderId, folderName, noteCount) {
  const msg = noteCount > 0
    ? `「${folderName}」を削除しますか？中の${noteCount}件のメモも一緒に削除されます。`
    : `「${folderName}」を削除しますか？`;
  if (!confirm(msg)) return;
  if (ZUKAN_IS_OFFLINE_FILE) {
    saveMemoFolders(loadMemoFolders().filter(f => f.id !== folderId));
    saveMemoNotes(loadMemoNotes().filter(n => n.folderId !== folderId));
    renderMemoFolderList();
    return;
  }
  zukanPost("/api/memo-folders", { delete: true, id: folderId }).then(data => {
    cloudMemoFolders = data.folders || [];
    cloudMemoNotes = cloudMemoNotes.filter(n => n.folderId !== folderId);
    renderMemoFolderList();
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("削除に失敗しました。通信状態を確認してもう一度お試しください。");
  });
}
function renameMemoFolder(folderId, currentName) {
  const input = prompt("フォルダ名を入力してください（空欄のままでも保存できます）", currentName);
  if (input === null) return;
  const name = input.trim();
  if (ZUKAN_IS_OFFLINE_FILE) {
    const folders = loadMemoFolders();
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    folder.name = name || "無題フォルダ";
    saveMemoFolders(folders);
    renderMemoFolderList();
    return;
  }
  zukanPost("/api/memo-folders", { folder: { id: folderId, name: name || "無題フォルダ" } }).then(data => {
    cloudMemoFolders = data.folders || [];
    renderMemoFolderList();
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("変更に失敗しました。通信状態を確認してもう一度お試しください。");
  });
}

// --- フォルダ内のメモ一覧 ---
function openMemoFolder(folderId) {
  currentMemoFolderId = folderId;
  showMemoScreen("notes");
  renderMemoNoteList();
}
function renderMemoNoteList() {
  const folder = getMemoFolders().find(f => f.id === currentMemoFolderId);
  document.getElementById("memoNoteListFolderName").textContent = folder ? folder.name : "";
  const itemsEl = document.getElementById("memoNoteListItems");
  if (!ZUKAN_IS_OFFLINE_FILE && memoNotesLoadFailed) {
    itemsEl.innerHTML = "";
    document.getElementById("memoNoteListEmpty").style.display = "none";
    return;
  }
  const notes = getMemoNotes().filter(n => n.folderId === currentMemoFolderId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  itemsEl.innerHTML = "";
  document.getElementById("memoNoteListEmpty").style.display = notes.length ? "none" : "block";
  notes.forEach(n => {
    const row = document.createElement("div");
    row.className = "memo-note-item";
    row.innerHTML = `
      <div class="memo-note-item-body">
        <div class="memo-note-item-title"></div>
        <div class="memo-note-item-subtitle"></div>
        <div class="memo-note-item-preview"></div>
      </div>
      <button type="button" class="memo-note-item-del" title="削除">&times;</button>
    `;
    row.querySelector(".memo-note-item-title").textContent = n.title || "無題";
    row.querySelector(".memo-note-item-subtitle").textContent = n.subtitle || "";
    row.querySelector(".memo-note-item-preview").textContent = n.text || "";
    row.querySelector(".memo-note-item-del").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("このメモを削除しますか？")) return;
      if (ZUKAN_IS_OFFLINE_FILE) {
        saveMemoNotes(loadMemoNotes().filter(x => x.id !== n.id));
        renderMemoNoteList();
        return;
      }
      zukanPost("/api/memo-notes", { delete: true, id: n.id }).then(data => {
        cloudMemoNotes = data.notes || [];
        renderMemoNoteList();
        renderMemoFolderList();
      }).catch(err => {
        if (err && err.zukanStale) return;
        alert("削除に失敗しました。通信状態を確認してもう一度お試しください。");
      });
    });
    row.addEventListener("click", () => openMemoNoteEdit(n.id));
    itemsEl.appendChild(row);
  });
}
document.getElementById("memoNoteListBackLink").addEventListener("click", showMemoFolderListScreen);
document.getElementById("memoNoteAddLink").addEventListener("click", () => openMemoNoteEdit(null));

// --- メモ編集 ---
function populateMemoFolderSelect(selectedFolderId) {
  const sel = document.getElementById("memoNoteFolderSelect");
  sel.innerHTML = "";
  getMemoFolders().forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    if (f.id === selectedFolderId) opt.selected = true;
    sel.appendChild(opt);
  });
}
function openMemoNoteEdit(noteId) {
  currentMemoNoteId = noteId;
  const note = noteId ? getMemoNotes().find(n => n.id === noteId) : null;
  document.getElementById("memoNoteTitleInput").value = note ? note.title : "";
  document.getElementById("memoNoteSubtitleInput").value = note ? note.subtitle : "";
  document.getElementById("memoNoteTextInput").value = note ? note.text : "";
  populateMemoFolderSelect(note ? note.folderId : currentMemoFolderId);
  document.getElementById("memoNoteDeleteBtn").style.display = note ? "inline-block" : "none";
  document.getElementById("memoNoteSaved").classList.remove("show");
  showMemoScreen("edit");
}
document.getElementById("memoNoteEditBackLink").addEventListener("click", () => {
  showMemoScreen("notes");
});
document.getElementById("memoNoteCancelBtn").addEventListener("click", () => {
  showMemoScreen("notes");
});
document.getElementById("memoNoteSaveBtn").addEventListener("click", () => {
  const title = document.getElementById("memoNoteTitleInput").value.trim();
  const subtitle = document.getElementById("memoNoteSubtitleInput").value.trim();
  const text = document.getElementById("memoNoteTextInput").value;
  const folderId = document.getElementById("memoNoteFolderSelect").value;
  if (ZUKAN_IS_OFFLINE_FILE) {
    const notes = loadMemoNotes();
    if (currentMemoNoteId) {
      const note = notes.find(n => n.id === currentMemoNoteId);
      if (note) {
        note.title = title;
        note.subtitle = subtitle;
        note.text = text;
        note.folderId = folderId;
        note.updatedAt = Date.now();
      }
    } else {
      currentMemoNoteId = genMemoId();
      notes.push({ id: currentMemoNoteId, folderId, title, subtitle, text, updatedAt: Date.now() });
    }
    saveMemoNotes(notes);
    currentMemoFolderId = folderId;
    const savedEl = document.getElementById("memoNoteSaved");
    savedEl.classList.add("show");
    setTimeout(() => {
      savedEl.classList.remove("show");
      showMemoScreen("notes");
      renderMemoNoteList();
    }, 500);
    return;
  }
  zukanPost("/api/memo-notes", { note: { id: currentMemoNoteId || undefined, folderId, title, subtitle, text } }).then(data => {
    cloudMemoNotes = data.notes || [];
    currentMemoNoteId = null;
    currentMemoFolderId = folderId;
    const savedEl = document.getElementById("memoNoteSaved");
    savedEl.classList.add("show");
    setTimeout(() => {
      savedEl.classList.remove("show");
      showMemoScreen("notes");
      renderMemoNoteList();
      renderMemoFolderList();
    }, 500);
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("保存に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});
document.getElementById("memoNoteDeleteBtn").addEventListener("click", () => {
  if (!currentMemoNoteId) return;
  if (!confirm("このメモを削除しますか？")) return;
  if (ZUKAN_IS_OFFLINE_FILE) {
    saveMemoNotes(loadMemoNotes().filter(n => n.id !== currentMemoNoteId));
    showMemoScreen("notes");
    renderMemoNoteList();
    return;
  }
  zukanPost("/api/memo-notes", { delete: true, id: currentMemoNoteId }).then(data => {
    cloudMemoNotes = data.notes || [];
    showMemoScreen("notes");
    renderMemoNoteList();
    renderMemoFolderList();
  }).catch(err => {
    if (err && err.zukanStale) return;
    alert("削除に失敗しました。通信状態を確認してもう一度お試しください。");
  });
});

// ---------- 記録・メモをクラウドに送る(移行) ----------
// この端末のlocalStorageに入っている「記録」「メモのフォルダ」「メモ本体」「講座メモ」を、
// クラウド(KV)へ送る。安全のため、送る前に必ずこの端末の分をJSONファイルとしてダウンロードする。
// すでにクラウドにある分は上書きしない(import側で判定)ので、何度押しても増えない。
// 成功してもlocalStorageのデータは消さない(そのまま残す)。
function downloadLocalJournalBackup() {
  const backup = {
    journal: loadJournal(),
    memoFolders: loadMemoFolders(),
    memoNotes: loadMemoNotes(),
    courseMemos: loadCourseMemos(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  const ts = backup.exportedAt.replace(/[:.]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `tarot-local-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return backup;
}

function describeMigrateResult(label, r) {
  if (!r) return `${label}：実行できませんでした`;
  if (!r.ok) return `${label}：失敗しました${r.stale ? "(画面が古くなっています。更新してからやり直してください)" : ""}`;
  return `${label}：追加${r.added}件 / すでにあって飛ばした${r.skipped}件`;
}

function migrateLocalDataToCloud() {
  if (ZUKAN_IS_OFFLINE_FILE) return;
  const backup = downloadLocalJournalBackup();
  const journalCount = backup.journal.length;
  const folderCount = backup.memoFolders.length;
  const noteCount = backup.memoNotes.length;
  const courseMemoCount = Object.keys(backup.courseMemos).length;
  const confirmMsg = `記録${journalCount}件、フォルダ${folderCount}件、メモ${noteCount}件、講座メモ${courseMemoCount}件を送ります。すでにクラウドにあるものは消えません。送りますか？`;
  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById("journalMigrateBtn");
  if (btn) { btn.disabled = true; btn.textContent = "送信中…"; }

  const results = {};
  zukanPost("/api/journal", { import: true, entries: backup.journal })
    .then(data => { cloudJournal = data.entries || cloudJournal; results.journal = { ok: true, added: data.added, skipped: data.skipped }; })
    .catch(err => { results.journal = { ok: false, stale: !!(err && err.zukanStale) }; })
    .then(() => zukanPost("/api/memo-folders", { import: true, folders: backup.memoFolders }))
    .then(data => { cloudMemoFolders = data.folders || cloudMemoFolders; results.memoFolders = { ok: true, added: data.added, skipped: data.skipped }; })
    .catch(err => { results.memoFolders = { ok: false, stale: !!(err && err.zukanStale) }; })
    .then(() => zukanPost("/api/memo-notes", { import: true, notes: backup.memoNotes }))
    .then(data => { cloudMemoNotes = data.notes || cloudMemoNotes; results.memoNotes = { ok: true, added: data.added, skipped: data.skipped }; })
    .catch(err => { results.memoNotes = { ok: false, stale: !!(err && err.zukanStale) }; })
    .then(() => zukanPost("/api/course-memos", { import: true, memos: backup.courseMemos }))
    .then(data => { cloudCourseMemos = data.memos || cloudCourseMemos; results.courseMemos = { ok: true, added: data.added, skipped: data.skipped }; })
    .catch(err => { results.courseMemos = { ok: false, stale: !!(err && err.zukanStale) }; })
    .then(() => {
      if (btn) { btn.disabled = false; btn.textContent = "この端末の記録・メモをクラウドに送る"; }
      renderJournal();
      renderMemoFolderList();
      const allOk = ["journal", "memoFolders", "memoNotes", "courseMemos"].every(k => results[k] && results[k].ok);
      const header = allOk ? "送信しました。" : "一部、送信できなかったものがあります(すでに送れた分はそのままクラウドに残ります)。";
      const lines = [
        describeMigrateResult("記録", results.journal),
        describeMigrateResult("フォルダ", results.memoFolders),
        describeMigrateResult("メモ", results.memoNotes),
        describeMigrateResult("講座メモ", results.courseMemos)
      ];
      alert(header + "\n" + lines.join("\n") + "\n\nこの端末の分は、念のため残してあります。");
    });
}

if (ZUKAN_IS_OFFLINE_FILE) {
  const wrap = document.getElementById("journalMigrateWrap");
  if (wrap) wrap.style.display = "none";
} else {
  const migrateBtn = document.getElementById("journalMigrateBtn");
  if (migrateBtn) migrateBtn.addEventListener("click", migrateLocalDataToCloud);
}
