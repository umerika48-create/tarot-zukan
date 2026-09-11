// ===== タロット図鑑 app logic =====
const SUIT_LABEL = {
  major: "大アルカナ", wands: "ワンド", cups: "カップ", swords: "ソード", pentacles: "ペンタクル"
};
const SUIT_JA_SHORT = { major:"", wands:"(火)", cups:"(水)", swords:"(風)", pentacles:"(地)" };

let currentSuit = "all";
let currentQuery = "";
let currentDictDeck = "tarot"; // "tarot" | "lenormand" | "rune"

// ---------- ナビゲーション ----------
const views = { dict: document.getElementById("view-dict"), draw: document.getElementById("view-draw"), timing: document.getElementById("view-timing"), spread: document.getElementById("view-spread"), combo: document.getElementById("view-combo"), about: document.getElementById("view-about"), courses: document.getElementById("view-courses"), journal: document.getElementById("view-journal") };
const titles = {
  dict: ["占いカード図鑑", "タロット・ルノルマン・ルーン。いつでも気軽に。"],
  draw: ["1枚引く", "今の自分に必要なメッセージを受け取りましょう。"],
  timing: ["時期読み", "カードが示す、物事が動くタイミングの目安。"],
  spread: ["スプレッド", "目的に合わせた展開方法で、深く読み解きましょう。"],
  combo: ["組み合わせ引き", "複数のデッキを組み合わせて、多角的に読み解きます。"],
  about: ["タロットとは", "カードの成り立ちを、少しだけ覗いてみましょう。"],
  courses: ["講座", "開催する講座の内容とメモを管理できます。"],
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
    if (v === "combo") { document.getElementById("comboDeckStage").style.display = "flex"; renderComboDeckStage(); }
    if (v === "courses") renderCourseList();
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

  if (c.deck === "lenormand" || c.deck === "rune" || c.deck === "heart_oracle" || c.deck === "step_oracle") {
    document.getElementById("mEyebrow").textContent =
      c.deck === "lenormand" ? "ルノルマン" :
      c.deck === "rune" ? "ルーン（エルダー・フサルク）" :
      c.deck === "step_oracle" ? "Sakuraco Step Oracle" : "Sakuraco Heart Oracle";
    document.getElementById("mCatchWrap").style.display = "none";
    document.getElementById("mTagRow").style.display = "none";
    document.getElementById("mStoryPopup").classList.remove("show");
    document.getElementById("mSituationPopup").classList.remove("show");
    document.getElementById("mPlacePopup").classList.remove("show");
    document.getElementById("mUpLabel").textContent = "意味";
    document.getElementById("mUp").textContent = c.meaning;
    document.getElementById("mRvSec").style.display = "none";
    document.getElementById("mLoveSec").style.display = "block";
    document.getElementById("mLoveLabel").textContent = c.deck === "step_oracle" ? "後押しのひとこと" : c.deck === "heart_oracle" ? "今のアプローチ" : "恋愛での視点";
    document.getElementById("mLove").textContent = c.love;
    modalBackdrop.classList.remove("hidden");
    return;
  }

  document.getElementById("mUpLabel").textContent = "正位置";
  document.getElementById("mRvSec").style.display = "block";
  document.getElementById("mLoveSec").style.display = "block";
  document.getElementById("mLoveLabel").textContent = "恋愛での視点";
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
    if (currentDeck === "lenormand" || currentDeck === "rune" || currentDeck === "marseille" || currentDeck === "heart_oracle" || currentDeck === "step_oracle") {
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
        currentDeck === "step_oracle" ? "今日のあなたへの1枚（Step Oracle）" : "今日のあなたへの1枚（ルーン）";
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

    if (currentDeck === "heart_oracle" || currentDeck === "step_oracle") {
      const source = currentDeck === "heart_oracle" ? HEART_ORACLE_CARDS : STEP_ORACLE_CARDS;
      drawnCard = source[Math.floor(Math.random() * source.length)];
      drawnReversed = false;

      document.getElementById("resultImg").src = drawnCard.img;
      rc.classList.remove("reversed");
      rc.classList.add("show");
      document.getElementById("resultOrient").textContent = "";
      document.getElementById("resultOrient").className = "result-orient up";

      document.getElementById("rEyebrow").textContent = currentDeck === "heart_oracle" ? "Sakuraco Heart Oracle" : "Sakuraco Step Oracle";
      document.getElementById("rTitle").textContent = drawnCard.name_jp;
      document.getElementById("rMeaningSec").style.display = "block";
      document.getElementById("rLoveSec").style.display = "block";
      document.getElementById("rLoveLabel").textContent = currentDeck === "step_oracle" ? "後押しのひとこと" : currentDeck === "heart_oracle" ? "今のアプローチ" : "恋愛での視点";
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
  if (deck === "heart_oracle") return HEART_ORACLE_CARDS.find(c => c.id === id);
  if (deck === "step_oracle") return STEP_ORACLE_CARDS.find(c => c.id === id);
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
  if (deck === "heart_oracle") return HEART_ORACLE_CARDS;
  if (deck === "step_oracle") return STEP_ORACLE_CARDS;
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
  const SLOT_W = 150, SLOT_H = 290; // カード本体＋ラベル・名前分の余裕を含む概算サイズ
  let maxX = 0, maxY = 0;

  positions.forEach((pos, i) => {
    const card = spreadDrawnCards[i];
    const slot = document.createElement("div");
    slot.className = "spread-slot";

    if (layout === "celtic") {
      const coords = [
        {x:383,y:300},{x:383,y:300,rot:1},{x:383,y:67},{x:383,y:533},
        {x:117,y:300},{x:650,y:300},
        {x:867,y:650},{x:867,y:450},{x:867,y:250},{x:867,y:50}
      ];
      const c = coords[i] || {x:0,y:0};
      slot.style.left = c.x + "px";
      slot.style.top = c.y + "px";
      if (c.rot) slot.style.transform = "rotate(90deg)";
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
      const R = 292, cx = 400, cy = 400;
      const angle = (i * 60 - 90) * Math.PI / 180;
      const left = cx + R * Math.cos(angle) - 65;
      const top = cy + R * Math.sin(angle) - 100;
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
      const picked = groupRowIds.map(id => document.querySelector(`#${id} .chip.active`).dataset.deck);
      const hasDupe = new Set(picked).size !== picked.length;
      if (hasDupe) return; // wait for the user to pick all-different decks before refreshing
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
const DECK_LABEL = { tarot: "タロット（RWS）", marseille: "タロット（マルセイユ）", lenormand: "ルノルマン", rune: "ルーン", heart_oracle: "Heart Oracle", step_oracle: "Step Oracle" };

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
    if (new Set([deckX, deckY, deckZ]).size !== 3) {
      alert("3つのデッキはそれぞれ別々のものを選んでください。");
      stage.dataset.drawn = "";
      return;
    }
    decks = [deckX, deckY, deckZ];
  } else {
    const deckA = document.querySelector("#comboDeckARow .chip.active").dataset.deck;
    const deckB = document.querySelector("#comboDeckBRow .chip.active").dataset.deck;
    if (deckA === deckB) {
      alert("2つのデッキは別々のものを選んでください。");
      stage.dataset.drawn = "";
      return;
    }
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
const COURSE_MEMO_KEY = "tarot_course_memo_v1";
function loadCourseMemos() {
  try { return JSON.parse(localStorage.getItem(COURSE_MEMO_KEY)) || {}; } catch (e) { return {}; }
}
function saveCourseMemo(courseId, text) {
  const memos = loadCourseMemos();
  memos[courseId] = text;
  localStorage.setItem(COURSE_MEMO_KEY, JSON.stringify(memos));
}

function renderCourseList() {
  const list = document.getElementById("courseList");
  list.innerHTML = "";
  COURSES.forEach(course => {
    const card = document.createElement("div");
    card.className = "course-card";
    card.innerHTML = `
      <div class="course-title">${course.title}</div>
      <div class="course-sub">${course.subtitle}</div>
      <div class="course-meta">${course.tags.map(t => `<span class="course-tag">${t}</span>`).join("")}</div>`;
    card.addEventListener("click", () => openCourseDetail(course));
    list.appendChild(card);
  });
}

let currentCourseId = null;
const courseDetailBackdrop = document.getElementById("courseDetailBackdrop");

function openCourseDetail(course) {
  currentCourseId = course.id;
  document.getElementById("courseDetailTitle").textContent = course.title;
  document.getElementById("courseDetailSubtitle").textContent = course.subtitle;

  const program = document.getElementById("courseProgram");
  program.innerHTML = "";
  course.program.forEach(item => {
    const row = document.createElement("div");
    row.className = "course-program-item";

    let descHtml = item.desc;
    if (item.labels && item.labels.length) {
      item.labels.forEach((label, idx) => {
        if (descHtml.includes(label.title)) {
          descHtml = descHtml.replace(
            label.title,
            `<span class="inline-glossary-label" data-label-idx="${idx}">${label.title}</span>`
          );
        }
      });
    }

    row.innerHTML = `
      <div class="course-program-time">${item.time}</div>
      <div class="course-program-body">
        <div class="cp-title">${item.title}</div>
        <div class="cp-desc">${descHtml}</div>
      </div>`;

    if (item.labels && item.labels.length) {
      row.querySelectorAll(".inline-glossary-label").forEach(span => {
        const idx = Number(span.dataset.labelIdx);
        span.addEventListener("click", () => openCourseGlossary(item.labels[idx]));
      });
    }

    program.appendChild(row);
  });

  const memos = loadCourseMemos();
  document.getElementById("courseMemoBox").value = memos[course.id] || "";
  document.getElementById("courseMemoStatus").textContent = "";

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
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { courseDetailBackdrop.classList.add("hidden"); courseGlossaryBackdrop.classList.add("hidden"); } });

let courseMemoTimer = null;
document.getElementById("courseMemoBox").addEventListener("input", (e) => {
  if (!currentCourseId) return;
  clearTimeout(courseMemoTimer);
  const status = document.getElementById("courseMemoStatus");
  status.textContent = "";
  courseMemoTimer = setTimeout(() => {
    saveCourseMemo(currentCourseId, e.target.value);
    status.textContent = "保存しました";
    setTimeout(() => { status.textContent = ""; }, 1500);
  }, 500);
});

// ---------- init ----------
renderGrid();
