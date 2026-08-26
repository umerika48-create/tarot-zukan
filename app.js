// ===== タロット図鑑 app logic =====
const SUIT_LABEL = {
  major: "大アルカナ", wands: "ワンド", cups: "カップ", swords: "ソード", pentacles: "ペンタクル"
};
const SUIT_JA_SHORT = { major:"", wands:"(火)", cups:"(水)", swords:"(風)", pentacles:"(地)" };

let currentSuit = "all";
let currentQuery = "";

// ---------- ナビゲーション ----------
const views = { dict: document.getElementById("view-dict"), draw: document.getElementById("view-draw"), timing: document.getElementById("view-timing"), journal: document.getElementById("view-journal") };
const titles = {
  dict: ["タロット図鑑", "78枚のカードの意味を、いつでも気軽に。"],
  draw: ["1枚引く", "今の自分に必要なメッセージを受け取りましょう。"],
  timing: ["時期読み", "カードが示す、物事が動くタイミングの目安。"],
  journal: ["記録", "これまで引いたカードと、そのときの気づき。"]
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
  });
});

// ---------- 図鑑 ----------
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentSuit = chip.dataset.suit;
    renderGrid();
  });
});
document.getElementById("searchBox").addEventListener("input", (e) => {
  currentQuery = e.target.value.trim();
  renderGrid();
});

function renderGrid() {
  const grid = document.getElementById("cardGrid");
  const q = currentQuery.toLowerCase();
  const filtered = CARDS.filter(c => {
    const suitOk = currentSuit === "all" || c.arcana === currentSuit;
    const qOk = !q || c.name_jp.toLowerCase().includes(q) || c.name_en.toLowerCase().includes(q) ||
      c.keywords.some(k => k.toLowerCase().includes(q));
    return suitOk && qOk;
  });
  grid.innerHTML = "";
  document.getElementById("emptyMsg").style.display = filtered.length ? "none" : "block";
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
  if (c.arcana === "major") return "MAJOR " + String(c.number).padStart(2, "0");
  return SUIT_LABEL[c.arcana] + " " + rankLabel(c.number);
}
function rankLabel(n) {
  if (n === 1) return "A"; if (n === 11) return "P"; if (n === 12) return "N"; if (n === 13) return "Q"; if (n === 14) return "K";
  return String(n);
}

// ---------- 時期読み 図鑑テーブル ----------
function renderTimingTables() {
  const suitTbl = document.getElementById("timingSuitTable");
  if (suitTbl.dataset.done) return;
  suitTbl.dataset.done = "1";

  let sh = `<div class="timing-row head"><div>スート</div><div>時期の目安</div><div>特徴</div></div>`;
  ["wands","cups","swords","pentacles"].forEach(s => {
    const t = TIMING_SUIT[s];
    sh += `<div class="timing-row"><div class="tc-name">${SUIT_LABEL[s]}${SUIT_JA_SHORT[s]}</div><div class="tc-term">${t.term}</div><div class="tc-feature">${t.feature}</div></div>`;
  });
  suitTbl.innerHTML = sh;

  let ch = `<div class="timing-row head"><div>カード</div><div>時期の目安</div><div>特徴</div></div>`;
  [11,12,13,14].forEach(n => {
    const t = TIMING_COURT[n];
    ch += `<div class="timing-row"><div class="tc-name">${t.label}</div><div class="tc-term">${t.term}</div><div class="tc-feature">${t.feature}</div></div>`;
  });
  document.getElementById("timingCourtTable").innerHTML = ch;

  let mh = `<div class="timing-row head"><div>カード</div><div>時期の目安</div><div>特徴</div></div>`;
  CARDS.filter(c => c.arcana === "major").forEach(c => {
    const t = TIMING_MAJOR[c.id];
    mh += `<div class="timing-row"><div class="tc-name">${c.name_jp}</div><div class="tc-term">${t.term}</div><div class="tc-feature">${t.feature}</div></div>`;
  });
  document.getElementById("timingMajorTable").innerHTML = mh;
}

// ---------- モーダル ----------
const modalBackdrop = document.getElementById("modalBackdrop");
function openModal(c) {
  document.getElementById("modalImg").src = c.img;
  document.getElementById("modalImg").alt = c.name_jp;
  document.getElementById("mEyebrow").textContent = SUIT_LABEL[c.arcana] + " " + SUIT_JA_SHORT[c.arcana];
  document.getElementById("mTitle").textContent = c.name_jp;
  document.getElementById("mTitleEn").textContent = c.name_en;
  document.getElementById("mKeywords").innerHTML = c.keywords.map(k => `<span class="kw">${k}</span>`).join("");
  document.getElementById("mUp").textContent = c.upright;
  document.getElementById("mRv").textContent = c.reversed;
  document.getElementById("mLove").textContent = c.love;

  const storyPopup = document.getElementById("mStoryPopup");
  const situationPopup = document.getElementById("mSituationPopup");
  const placePopup = document.getElementById("mPlacePopup");
  storyPopup.classList.remove("show");
  situationPopup.classList.remove("show");
  placePopup.classList.remove("show");

  if (c.catchphrase) {
    document.getElementById("mCatchWrap").style.display = "block";
    document.getElementById("mCatch").textContent = c.catchphrase;
  } else {
    document.getElementById("mCatchWrap").style.display = "none";
  }

  const hasAnyTag = c.age_range || c.story || c.current_situation || c.place;
  if (hasAnyTag) {
    document.getElementById("mTagRow").style.display = "flex";
    document.getElementById("mAge").style.display = c.age_range ? "inline-block" : "none";
    document.getElementById("mAge").textContent = c.age_range || "";
    document.getElementById("mStoryTag").style.display = c.story ? "inline-block" : "none";
    document.getElementById("mSituationTag").style.display = c.current_situation ? "inline-block" : "none";
    document.getElementById("mPlaceTag").style.display = c.place ? "inline-block" : "none";
  } else {
    document.getElementById("mTagRow").style.display = "none";
  }

  if (c.story) {
    document.getElementById("mStoryHeader").textContent = "ストーリー：" + c.name_jp;
    document.getElementById("mStoryText").textContent = c.story;
  }
  const chipRow = document.getElementById("mSymbolChipRow");
  chipRow.innerHTML = "";
  if (c.symbols && c.symbols.length) {
    c.symbols.forEach((s, i) => {
      const chip = document.createElement("span");
      chip.className = "symbol-chip";
      chip.textContent = s.label;
      chip.addEventListener("click", () => openSymbolDetail(c, i));
      chipRow.appendChild(chip);
    });
  }
  if (c.current_situation) {
    document.getElementById("mSituationHeader").textContent = "現状に出たら：" + c.name_jp;
    document.getElementById("mSituationText").textContent = c.current_situation;
  }
  if (c.place) {
    document.getElementById("mPlaceHeader").textContent = "出会いの場所：" + c.name_jp;
    document.getElementById("mPlaceText").textContent = c.place;
  }

  modalBackdrop.classList.remove("hidden");
}
function closeAllPopups() {
  document.getElementById("mStoryPopup").classList.remove("show");
  document.getElementById("mSituationPopup").classList.remove("show");
  document.getElementById("mPlacePopup").classList.remove("show");
}
document.getElementById("mStoryTag").addEventListener("click", () => {
  const isOpen = document.getElementById("mStoryPopup").classList.contains("show");
  closeAllPopups();
  if (!isOpen) document.getElementById("mStoryPopup").classList.add("show");
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
document.getElementById("modalClose").addEventListener("click", () => modalBackdrop.classList.add("hidden"));
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) modalBackdrop.classList.add("hidden"); });

// ---------- シンボル詳細ポップアップ ----------
const symbolDetailBackdrop = document.getElementById("symbolDetailBackdrop");
function openSymbolDetail(card, index) {
  const s = card.symbols[index];
  document.getElementById("symbolDetailEyebrow").textContent = card.name_jp + " のシンボル";
  document.getElementById("symbolDetailTitle").textContent = s.title;
  document.getElementById("symbolDetailText").textContent = s.text;
  symbolDetailBackdrop.classList.remove("hidden");
}
document.getElementById("symbolDetailClose").addEventListener("click", () => symbolDetailBackdrop.classList.add("hidden"));
symbolDetailBackdrop.addEventListener("click", (e) => { if (e.target === symbolDetailBackdrop) symbolDetailBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") symbolDetailBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modalBackdrop.classList.add("hidden"); });

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
    if (currentDeck === "lenormand") {
      timingChip.style.display = "none";
      if (drawMode === "timing") {
        drawMode = "reading";
        document.querySelectorAll("#drawModeRow .chip").forEach(c => c.classList.remove("active"));
        document.querySelector('#drawModeRow .chip[data-mode="reading"]').classList.add("active");
      }
      document.getElementById("drawLead").textContent = "今日のあなたへの1枚（ルノルマン）";
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

    if (currentDeck === "lenormand") {
      drawnCard = LENORMAND_CARDS[Math.floor(Math.random() * LENORMAND_CARDS.length)];
      drawnReversed = false;

      document.getElementById("resultImg").src = drawnCard.img;
      rc.classList.remove("reversed");
      rc.classList.add("show");
      document.getElementById("resultOrient").textContent = "";
      document.getElementById("resultOrient").className = "result-orient up";

      document.getElementById("rEyebrow").textContent = "ルノルマン";
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

    drawnCard = CARDS[Math.floor(Math.random() * CARDS.length)];
    drawnReversed = Math.random() < 0.5;

    document.getElementById("resultImg").src = drawnCard.img;
    rc.classList.toggle("reversed", drawnReversed);
    rc.classList.add("show");
    document.getElementById("resultOrient").textContent = drawnReversed ? "逆位置" : "正位置";
    document.getElementById("resultOrient").className = "result-orient " + (drawnReversed ? "rv" : "up");

    document.getElementById("rEyebrow").textContent = SUIT_LABEL[drawnCard.arcana] + " " + SUIT_JA_SHORT[drawnCard.arcana];

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
  const entries = loadJournal();
  entries.unshift({
    date: new Date().toISOString(),
    cardId: drawnCard.id,
    name: drawnCard.name_jp,
    reversed: drawnReversed,
    note: note,
    mode: drawMode,
    deck: currentDeck
  });
  saveJournal(entries);
  document.getElementById("saveDrawBtn").textContent = "記録しました ✓";
  document.getElementById("saveDrawBtn").disabled = true;
});

// ---------- 記録（ジャーナル） ----------
const JOURNAL_KEY = "tarot_journal_v1";
function loadJournal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY)) || []; } catch (e) { return []; }
}
function saveJournal(entries) {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}
function findCard(id, deck) {
  if (deck === "lenormand") return LENORMAND_CARDS.find(c => c.id === id);
  return CARDS.find(c => c.id === id);
}

function renderJournal() {
  const list = document.getElementById("journalList");
  const entries = loadJournal();
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
        <div class="jentry-name">${e.name}${e.deck === 'lenormand' ? '<span class="jentry-orient">ルノルマン</span>' : (e.mode === 'timing' ? '<span class="jentry-orient">時期読み</span>' : `<span class="jentry-orient ${e.reversed ? 'rv' : ''}">${e.reversed ? '逆位置' : '正位置'}</span>`)}</div>
        ${e.note ? `<div class="jentry-note">${escapeHtml(e.note)}</div>` : ""}
      </div>
      <button class="jentry-del" title="削除" data-idx="${idx}">&times;</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll(".jentry-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const entries2 = loadJournal();
      entries2.splice(Number(btn.dataset.idx), 1);
      saveJournal(entries2);
      renderJournal();
    });
  });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

// ---------- init ----------
renderGrid();
