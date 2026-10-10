// Lightweight i18n for the 2048 AI page (fork). No dependencies.
// Languages: English, 简体中文 (zh-Hans), 繁體中文 (zh-Hant).
// Add a language by extending TRANSLATIONS and the <select> in index.html.

const TRANSLATIONS = {
  "en": {
    pageTitle: "2048 AI — fork of ziap/2048-ai",
    forkBadge: "fork",
    intro: "Watch the AI get to the <strong>2048 tile!</strong>",
    newGame: "New Game",
    aiControls: "AI controls",
    oneStep: "One Step",
    startAI: "Start AI",
    stopAI: "Stop",
    keepGoing: "Keep going",
    tryAgain: "Try again",
    editBoard: "Edit Board",
    editDone: "Done",
    editHint: "Click a cell, then pick a value (powers of two, up to 32768)",
    clearCell: "Clear",
    depthLabel: "Search depth",
    coiHelp: "The AI engine could not start. Close this tab and reopen the page to retry.",
    note: 'This is an AI solver for the game 2048, originally created by <a href="https://ziap.github.io" target="_blank">Zap</a>. It\'s a WASM module running Expectimax search with transposition caching and memory-bounded depth allocation.',
    forkNotice: 'This page is an <strong>unofficial fork</strong> of <a href="https://github.com/ziap/2048-ai" target="_blank">ziap/2048-ai</a>. The fork lives at <a href="https://github.com/Hfugghg/2048-ai" target="_blank">Hfugghg/2048-ai</a>.',
    credits: 'Original game by <a href="http://gabrielecirulli.com" target="_blank">Gabriele Cirulli.</a> Based on <a href="https://itunes.apple.com/us/app/1024!/id823499224" target="_blank">1024 by Veewo Studio</a> and conceptually similar to <a href="http://asherv.com/threes/" target="_blank">Threes by Asher Vollmer.</a>',
  },
  "zh-Hans": {
    pageTitle: "2048 AI —— ziap/2048-ai 的 fork 版本",
    forkBadge: "fork 版本",
    intro: "看 AI 冲到 <strong>2048 方块！</strong>",
    newGame: "新游戏",
    aiControls: "AI 控制",
    oneStep: "走一步",
    startAI: "启动 AI",
    stopAI: "停止",
    keepGoing: "继续玩",
    tryAgain: "再试一次",
    editBoard: "编辑棋盘",
    editDone: "完成",
    editHint: "点击格子选中，再选择数值（2 的幂，最大 32768）",
    clearCell: "清空",
    depthLabel: "推演深度",
    coiHelp: "AI 引擎未能启动：请关闭本标签页后重新打开以重试。",
    note: '这是 2048 游戏的 AI 求解器，原版由 <a href="https://ziap.github.io" target="_blank">Zap</a> 开发。基于 WASM 模块运行 Expectimax（期望最大化）搜索，带置换表缓存和内存受限的深度分配。',
    forkNotice: '本页面是 <a href="https://github.com/ziap/2048-ai" target="_blank">ziap/2048-ai</a> 的<strong>非官方 fork 版本</strong>，fork 仓库：<a href="https://github.com/Hfugghg/2048-ai" target="_blank">Hfugghg/2048-ai</a>。',
    credits: '原版游戏由 <a href="http://gabrielecirulli.com" target="_blank">Gabriele Cirulli</a> 开发，基于 <a href="https://itunes.apple.com/us/app/1024!/id823499224" target="_blank">Veewo Studio 的 1024</a>，概念上类似 <a href="http://asherv.com/threes/" target="_blank">Asher Vollmer 的 Threes</a>。',
  },
  "zh-Hant": {
    pageTitle: "2048 AI —— ziap/2048-ai 的 fork 版本",
    forkBadge: "fork 版本",
    intro: "看 AI 衝到 <strong>2048 方塊！</strong>",
    newGame: "新遊戲",
    aiControls: "AI 控制",
    oneStep: "走一步",
    startAI: "啟動 AI",
    stopAI: "停止",
    keepGoing: "繼續玩",
    tryAgain: "再試一次",
    editBoard: "編輯棋盤",
    editDone: "完成",
    editHint: "點擊格子選中，再選擇數值（2 的冪，最大 32768）",
    clearCell: "清空",
    depthLabel: "推演深度",
    coiHelp: "AI 引擎未能啟動：請關閉本分頁後重新開啟以重試。",
    note: '這是 2048 遊戲的 AI 求解器，原版由 <a href="https://ziap.github.io" target="_blank">Zap</a> 開發。基於 WASM 模組執行 Expectimax（期望最大化）搜尋，帶置換表快取與記憶體受限的深度分配。',
    forkNotice: '本頁面是 <a href="https://github.com/ziap/2048-ai" target="_blank">ziap/2048-ai</a> 的<strong>非官方 fork 版本</strong>，fork 倉庫：<a href="https://github.com/Hfugghg/2048-ai" target="_blank">Hfugghg/2048-ai</a>。',
    credits: '原版遊戲由 <a href="http://gabrielecirulli.com" target="_blank">Gabriele Cirulli</a> 開發，基於 <a href="https://itunes.apple.com/us/app/1024!/id823499224" target="_blank">Veewo Studio 的 1024</a>，概念上類似 <a href="http://asherv.com/threes/" target="_blank">Asher Vollmer 的 Threes</a>。',
  },
};

const STORAGE_KEY = "2048-ai:lang";

function pickInitialLang() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (fromUrl && TRANSLATIONS[fromUrl]) return fromUrl;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && TRANSLATIONS[saved]) return saved;
  } catch {}

  for (const tag of navigator.languages || [navigator.language]) {
    if (!tag) continue;
    if (TRANSLATIONS[tag]) return tag;
    const lower = tag.toLowerCase();
    if (lower.startsWith("zh")) {
      return /hant|tw|hk|mo/.test(lower) ? "zh-Hant" : "zh-Hans";
    }
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

let current = pickInitialLang();

/** @param {string} key */
export function t(key) {
  return TRANSLATIONS[current][key] ?? TRANSLATIONS.en[key] ?? key;
}

export function getLang() {
  return current;
}

/** @param {string} lang */
export function setLang(lang) {
  if (!TRANSLATIONS[lang] || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  apply();
}

function apply() {
  document.documentElement.lang = current;
  document.title = t("pageTitle");

  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }

  const select = document.getElementById("lang-select");
  if (select) select.value = current;

  window.dispatchEvent(new CustomEvent("i18nchange", { detail: { lang: current } }));
}

document.getElementById("lang-select")?.addEventListener("change", (e) => {
  setLang(/** @type {HTMLSelectElement} */ (e.target).value);
});

apply();
