// ===== タロット図鑑 app logic =====
const SUIT_LABEL = {
  major: "大アルカナ", wands: "ワンド", cups: "カップ", swords: "ソード", pentacles: "ペンタクル"
};
const SUIT_JA_SHORT = { major:"", wands:"(火)", cups:"(水)", swords:"(風)", pentacles:"(地)" };

let currentSuit = "all";
let currentQuery = "";
let currentDictDeck = "tarot"; // "tarot" | "lenormand" | "rune"

// ---------- ナビゲーション ----------
const views = { dict: document.getElementById("view-dict"), draw: document.getElementById("view-draw"), timing: document.getElementById("view-timing"), spread: document.getElementById("view-spread"), combo: document.getElementById("view-combo"), about: document.getElementById("view-about"), journal: document.getElementById("view-journal") };
const titles = {
  dict: ["占いカード図鑑", "タロット・ルノルマン・ルーン。いつでも気軽に。"],
  draw: ["1枚引く", "今の自分に必要なメッセージを受け取りましょう。"],
  timing: ["時期読み", "カードが示す、物事が動くタイミングの目安。"],
  spread: ["スプレッド", "目的に合わせた展開方法で、深く読み解きましょう。"],
  combo: ["組み合わせ引き", "複数のデッキを組み合わせて、多角的に読み解きます。"],
  about: ["タロットとは", "カードの成り立ちを、少しだけ覗いてみましょう。"],
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
    if (v === "spread") initSpreadTab();
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
    renderGrid();
  });
});
document.querySelectorAll("#chipRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#chipRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentSuit = chip.dataset.suit;
    renderGrid();
  });
});
document.getElementById("searchBox").addEventListener("input", (e) => {
  currentQuery = e.target.value.trim();
  renderGrid();
});

function getDictDeckArray() {
  if (currentDictDeck === "marseille") return MARSEILLE_CARDS;
  if (currentDictDeck === "lenormand") return LENORMAND_CARDS;
  if (currentDictDeck === "rune") return RUNE_CARDS;
  return CARDS;
}

function renderGrid() {
  const grid = document.getElementById("cardGrid");
  const q = currentQuery.toLowerCase();
  const source = getDictDeckArray();
  const filtered = source.filter(c => {
    const suitOk = (currentDictDeck !== "tarot" && currentDictDeck !== "marseille") || currentSuit === "all"
      || (currentSuit === "court" ? (c.arcana !== "major" && c.number >= 11 && c.number <= 14) : c.arcana === currentSuit);
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
  if (c.deck === "lenormand") return "LENORMAND " + c.id.replace("l","").padStart(2,"0");
  if (c.deck === "rune") return "RUNE " + c.id.replace("r","").padStart(2,"0");
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

  let lh = `<div class="timing-row head"><div>カード</div><div>時期の目安</div><div>特徴</div></div>`;
  LENORMAND_CARDS.forEach(c => {
    lh += `<div class="timing-row"><div class="tc-name">${c.name_jp}</div><div class="tc-term">${c.timing_term}</div><div class="tc-feature">${c.timing_feature}</div></div>`;
  });
  document.getElementById("timingLenormandTable").innerHTML = lh;

  let rh = `<div class="timing-row head"><div>カード</div><div>時期の目安</div><div>特徴</div></div>`;
  RUNE_CARDS.forEach(c => {
    rh += `<div class="timing-row"><div class="tc-name">${c.name_en}／${c.name_jp}</div><div class="tc-term">${c.timing_term}</div><div class="tc-feature">${c.timing_feature}</div></div>`;
  });
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
function openModal(c) {
  document.getElementById("modalImg").src = c.img;
  document.getElementById("modalImg").alt = c.name_jp;
  document.getElementById("mTitle").textContent = c.name_jp;
  document.getElementById("mTitleEn").textContent = c.name_en;
  document.getElementById("mKeywords").innerHTML = c.keywords.map(k => `<span class="kw">${k}</span>`).join("");

  if (c.deck === "lenormand" || c.deck === "rune") {
    document.getElementById("mEyebrow").textContent = c.deck === "lenormand" ? "ルノルマン" : "ルーン（エルダー・フサルク）";
    document.getElementById("mCatchWrap").style.display = "none";
    document.getElementById("mTagRow").style.display = "none";
    document.getElementById("mStoryPopup").classList.remove("show");
    document.getElementById("mSituationPopup").classList.remove("show");
    document.getElementById("mPlacePopup").classList.remove("show");
    document.getElementById("mUpLabel").textContent = "意味";
    document.getElementById("mUp").textContent = c.meaning;
    document.getElementById("mRvSec").style.display = "none";
    document.getElementById("mLoveSec").style.display = "block";
    document.getElementById("mLove").textContent = c.love;
    modalBackdrop.classList.remove("hidden");
    return;
  }

  document.getElementById("mUpLabel").textContent = "正位置";
  document.getElementById("mRvSec").style.display = "block";
  document.getElementById("mLoveSec").style.display = "block";
  document.getElementById("mEyebrow").textContent = SUIT_LABEL[c.arcana] + " " + SUIT_JA_SHORT[c.arcana] + (c.deck === "marseille" ? "（マルセイユ版）" : "");
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
    if (currentDeck === "lenormand" || currentDeck === "rune" || currentDeck === "marseille") {
      timingChip.style.display = "none";
      if (drawMode === "timing") {
        drawMode = "reading";
        document.querySelectorAll("#drawModeRow .chip").forEach(c => c.classList.remove("active"));
        document.querySelector('#drawModeRow .chip[data-mode="reading"]').classList.add("active");
      }
      document.getElementById("drawLead").textContent =
        currentDeck === "lenormand" ? "今日のあなたへの1枚（ルノルマン）" :
        currentDeck === "marseille" ? "今日のあなたへの1枚（マルセイユ版）" : "今日のあなたへの1枚（ルーン）";
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
  if (deck === "rune") return RUNE_CARDS.find(c => c.id === id);
  if (deck === "marseille") return MARSEILLE_CARDS.find(c => c.id === id);
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
        <div class="jentry-name">${e.name}${e.deck === 'lenormand' ? '<span class="jentry-orient">ルノルマン</span>' : (e.deck === 'rune' ? '<span class="jentry-orient">ルーン</span>' : (e.mode === 'timing' ? '<span class="jentry-orient">時期読み</span>' : `<span class="jentry-orient ${e.reversed ? 'rv' : ''}">${e.reversed ? '逆位置' : '正位置'}</span>`))}</div>
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

// ---------- スプレッド ----------
let currentSpreadDeck = "tarot";
let currentSpread = null;
let spreadDrawnCards = [];

function spreadDeckArray(deck) {
  if (deck === "lenormand") return LENORMAND_CARDS;
  if (deck === "rune") return RUNE_CARDS;
  if (deck === "marseille") return MARSEILLE_CARDS;
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

  const positions = currentSpread.positions;
  const n = positions.length;

  positions.forEach((pos, i) => {
    const card = spreadDrawnCards[i];
    const slot = document.createElement("div");
    slot.className = "spread-slot";

    if (layout === "celtic") {
      const coords = [
        {x:230,y:180},{x:230,y:180,rot:1},{x:230,y:40},{x:230,y:320},
        {x:70,y:180},{x:390,y:180},
        {x:520,y:390},{x:520,y:270},{x:520,y:150},{x:520,y:30}
      ];
      const c = coords[i] || {x:0,y:0};
      slot.style.left = c.x + "px";
      slot.style.top = c.y + "px";
      if (c.rot) slot.style.transform = "rotate(90deg)";
    }
    if (layout === "horoscope") {
      const R = 220, cx = 280, cy = 280;
      const angle = (i * 30 - 90) * Math.PI / 180;
      slot.style.left = (cx + R * Math.cos(angle) - 39) + "px";
      slot.style.top = (cy + R * Math.sin(angle) - 60) + "px";
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
}

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
document.querySelectorAll("#comboModeRow .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#comboModeRow .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    document.getElementById("comboTwoPicker").style.display = chip.dataset.combo === "two" ? "block" : "none";
    document.getElementById("comboBoard").innerHTML = "";
  });
});

function setupComboDeckRow(rowId, otherRowId) {
  document.querySelectorAll(`#${rowId} .chip`).forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(`#${rowId} .chip`).forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });
}
setupComboDeckRow("comboDeckARow");
setupComboDeckRow("comboDeckBRow");

function drawOneFrom(deck) {
  const arr = spreadDeckArray(deck);
  return arr[Math.floor(Math.random() * arr.length)];
}
const DECK_LABEL = { tarot: "タロット", lenormand: "ルノルマン", rune: "ルーン" };

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
  const img = document.createElement("img");
  img.src = card.img;
  img.alt = spreadCardName(card);
  cardBox.appendChild(img);
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

document.getElementById("comboDealBtn").addEventListener("click", () => {
  const mode = document.querySelector("#comboModeRow .chip.active").dataset.combo;
  const board = document.getElementById("comboBoard");
  board.innerHTML = "";

  let decks;
  if (mode === "three") {
    decks = ["tarot", "lenormand", "rune"];
  } else {
    const deckA = document.querySelector("#comboDeckARow .chip.active").dataset.deck;
    const deckB = document.querySelector("#comboDeckBRow .chip.active").dataset.deck;
    if (deckA === deckB) {
      alert("2つのデッキは別々のものを選んでください。");
      return;
    }
    decks = [deckA, deckB];
  }

  decks.forEach(deck => {
    const card = drawOneFrom(deck);
    board.appendChild(renderComboCard(deck, card));
  });
});

document.getElementById("comboResetBtn").addEventListener("click", () => {
  document.getElementById("comboBoard").innerHTML = "";
});

// ---------- init ----------
renderGrid();
