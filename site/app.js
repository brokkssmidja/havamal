import { isLearned, localDateKey, migrateCard, newCard, planDay, reviewCard, stanzaOfDay } from "./srs.js";
import { parseBackup, parseTranslation } from "./import-text.js";

const KEY_SETTINGS = "havamal-v1:settings";
const KEY_CARDS = "havamal-v1:cards";
const KEY_TRANSLATION = "havamal-v1:translation";
const DB_NAME = "havamal-v1";

const SECTIONS = {
  counsels: "Counsels",
  love: "Love and Billing",
  mead: "The mead",
  loddfafnir: "Loddfáfnir",
  runes: "The runes",
  songs: "The songs",
  close: "Close",
};

const LANGS = [
  { id: "on", short: "Norse", label: "Old Norse" },
  { id: "en", short: "Bellows", label: "Bellows" },
  { id: "sv", short: "Brate", label: "Brate" },
  { id: "mine", short: "Mine", label: "My translation" },
];

const STAGE_NAME = {
  1: "First line",
  2: "Missing words",
  3: "First letters",
  4: "From the theme",
};

const LEARN_READS = 3;

const LEARN_HINT = "Read the whole stanza three times, then tap Try recalling it.";

const STAGE_HINT = {
  1: "Read the first line, say the rest from memory, then tap Show the answer and rate yourself.",
  2: "Say the missing words, then tap Show the answer and rate yourself.",
  3: "Say each word from its first letter, then tap Show the answer and rate yourself.",
  4: "Say the stanza from its number and theme, then tap Show the answer and rate yourself.",
};

const GRADE_HINT = "Again if you missed it. Hard, Good, or Easy for how well you recalled it.";

const STOP = new Set(
  `a an the of to and or in on for with his her is are was be as by if nor not but from that this who when than so it he she you thy thou thee
   och att en ett den det som på av till med är i om för ej du han hon de så än när var sin sitt sina man
   at en er ok um sem til af né eða ef ek þú á í of þá svá inn þat
   at en er ok um sem til af ne eda ef ek thu a i of tha sva inn that`.split(/\s+/),
);

const state = {
  data: null,
  settings: loadSettings(),
  cards: loadCards(),
  translation: null,
  session: null,
  message: "",
  importReport: null,
  confirmReset: false,
  confirmBackup: null,
};

const app = document.querySelector("#app");

boot();

async function boot() {
  applyTheme(state.settings.theme);
  try {
    const res = await fetch("./data/stanzas.json");
    if (!res.ok) throw new Error(String(res.status));
    state.data = await res.json();
  } catch {
    app.innerHTML = `<main class="sheet"><h1>Hávamál</h1><p>The texts did not load. Open the app once while you are online, then it can stay on the phone.</p></main>`;
    return;
  }
  state.translation = await loadTranslation();
  if (!location.hash) location.hash = "#/today";
  window.addEventListener("hashchange", render);
  app.addEventListener("click", onClick);
  app.addEventListener("change", onChange);
  app.addEventListener("touchstart", onTouchStart, { passive: true });
  app.addEventListener("touchend", onTouchEnd, { passive: true });
  render();
  registerWorker();
}

function loadSettings() {
  const defaults = { theme: "dark", memorize: "on", translation: "en", dailyNew: 2, lastRead: 1 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_SETTINGS) || "null");
    const next = { ...defaults, ...(raw || {}) };
    if (!LANGS.some((l) => l.id === next.memorize)) next.memorize = "on";
    if (!["en", "sv", "mine"].includes(next.translation)) next.translation = "en";
    next.dailyNew = clamp(Number(next.dailyNew) || 2, 0, 5);
    next.lastRead = clamp(Number(next.lastRead) || 1, 1, 164);
    next.theme = next.theme === "light" ? "light" : "dark";
    return next;
  } catch {
    return defaults;
  }
}

function loadCards() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_CARDS) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    let changed = false;
    for (const [key, card] of Object.entries(raw)) {
      if (!card || typeof card !== "object") {
        changed = true;
        continue;
      }
      const next = migrateCard(card);
      out[key] = next;
      if (JSON.stringify(next) !== JSON.stringify(card)) changed = true;
    }
    if (changed) localStorage.setItem(KEY_CARDS, JSON.stringify(out));
    return out;
  } catch {
    return {};
  }
}

function saveSettings() {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings));
}

function saveCards() {
  localStorage.setItem(KEY_CARDS, JSON.stringify(state.cards));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const color = theme === "light" ? "#f4efe6" : "#121614";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDel(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadTranslation() {
  try {
    const db = await openDb();
    const value = await idbGet(db, "translation");
    if (value && value.stanzas) return value;
  } catch {
    /* localStorage fallback below */
  }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_TRANSLATION) || "null");
    if (raw && raw.stanzas) return raw;
  } catch {
    /* ignore a broken backup copy */
  }
  return null;
}

async function saveTranslation(value) {
  if (!value) {
    localStorage.removeItem(KEY_TRANSLATION);
    try {
      const db = await openDb();
      await idbDel(db, "translation");
    } catch {
      /* already cleared from localStorage */
    }
    state.translation = null;
    return;
  }
  const stored = { name: value.name, stanzas: value.stanzas, importedAt: new Date().toISOString() };
  try {
    const db = await openDb();
    await idbSet(db, "translation", stored);
    localStorage.removeItem(KEY_TRANSLATION);
  } catch {
    localStorage.setItem(KEY_TRANSLATION, JSON.stringify(stored));
  }
  state.translation = stored;
}

function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  const had = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register("./sw.js").catch(() => {});
  if (had) {
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
  }
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [view, arg] = hash.split("/");
  if (view === "read") {
    const n = clamp(Number(arg) || state.settings.lastRead || 1, 1, 164);
    return { view: "read", n };
  }
  if (view === "practice") return { view: "practice" };
  if (view === "more") return { view: "more" };
  return { view: "today" };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const { view, n } = route();
  if (view === "read") {
    state.settings.lastRead = n;
    saveSettings();
  }
  if (view === "practice") ensureSession();
  const body =
    view === "today" ? viewToday() :
    view === "read" ? viewRead(n) :
    view === "practice" ? viewPractice() :
    viewMore();
  app.innerHTML = `${header(view)}${body}${nav(view)}`;
  const main = app.querySelector("main");
  if (main) main.focus();
}

function header(view) {
  return `<header class="top">
    <button class="word" data-action="go" data-hash="#/today">Hávamál</button>
    <button class="icon-btn ${view === "more" ? "is-on" : ""}" data-action="go" data-hash="#/more" aria-label="Settings">More</button>
  </header>`;
}

function nav(view) {
  const item = (id, hash, label) =>
    `<button class="${view === id ? "is-on" : ""}" data-action="go" data-hash="${hash}">${label}</button>`;
  return `<nav class="nav">${item("today", "#/today", "Today")}${item("read", "#/read/" + (state.settings.lastRead || 1), "Read")}${item("practice", "#/practice", "Practice")}</nav>`;
}

function viewToday() {
  const now = new Date();
  const plan = planDay({
    cards: state.cards,
    lang: state.settings.memorize,
    dailyNew: state.settings.dailyNew,
    now,
  });
  const items = studyItems(plan, state.settings.memorize);
  const dueCount = items.filter((item) => item.kind === "due").length;
  const newCount = items.filter((item) => item.kind === "new").length;
  const waiting = plan.waiting[0];
  const day = stanzaByNumber(stanzaOfDay(now));
  const dueItems = items.filter((item) => item.kind === "due");
  const newItems = items.filter((item) => item.kind === "new");
  const row = (item) => {
    const stanza = stanzaByNumber(item.n);
    return `<li><span class="num-mini">${item.n}</span><span>${esc(stanza.theme)}</span></li>`;
  };
  const list = dueItems.slice(0, 8).map(row).join("");
  const more = dueItems.length > 8 ? `<p class="quiet">and ${dueItems.length - 8} more</p>` : "";
  const newList = newItems.map(row).join("");
  const canStart = dueCount + newCount > 0;
  const summary = [
    dueCount ? `${dueCount} due` : "",
    newCount ? `${newCount} new` : "",
  ].filter(Boolean).join(" · ") || "Nothing is waiting";
  const wait = waiting
    ? `<p class="quiet">Stanza ${waiting.n} comes back in ${minutesUntil(waiting.dueAt)}.</p>`
    : "";
  const held = heldBackNote(plan.heldBack);
  const idle = plan.heldBack
    ? "Nothing is due today."
    : "Nothing is waiting today. The next new stanza stays for tomorrow.";
  return `<main class="sheet" tabindex="-1">
    ${langSwitch()}
    <p class="summary">${esc(summary)}</p>
    <p class="quiet explain">Due: learned in this version, and ready to review. New: not learned in this version yet. A new stanza starts with the full text.</p>
    ${canStart ? `<button class="primary" data-action="begin">Begin</button>` : `<p class="lead">${idle}</p>`}
    ${wait}
    ${held}
    ${list ? `<h2>Due</h2><ol class="due">${list}</ol>${more}` : ""}
    ${newList ? `<h2>New</h2><ol class="due">${newList}</ol>` : ""}
    <section class="day-card">
      <p class="label">Stanza of the day</p>
      <p class="day-num">${day.n}</p>
      <p class="theme">${esc(day.theme)}</p>
      <button class="text-btn" data-action="go" data-hash="#/read/${day.n}">Read it</button>
    </section>
  </main>`;
}

function heldBackNote(count) {
  if (!count) return "";
  const noun = count === 1
    ? "1 stanza you have not learned yet waits"
    : `${count} stanzas you have not learned yet wait`;
  return `<p class="quiet">${noun} until another day.</p>`;
}

function langSwitch() {
  const buttons = LANGS.map((lang) => {
    const on = state.settings.memorize === lang.id ? " is-on" : "";
    return `<button class="seg${on}" data-action="memorize" data-lang="${lang.id}" aria-label="${esc(langAria(lang.id))}">${lang.short}</button>`;
  }).join("");
  return `<div class="lang-block"><p class="label">Version</p><div class="seg-row" role="group" aria-label="Version to learn">${buttons}</div><p class="quiet version-note">${esc(versionNote())}</p></div>`;
}

function langAria(lang) {
  if (lang === "on") return "Old Norse";
  if (lang === "en") return "Bellows English";
  if (lang === "sv") return "Brate Swedish";
  return "My translation";
}

function versionNote() {
  const lang = state.settings.memorize;
  if (lang === "mine" && !state.translation) {
    return "Mine is your own translation, stored only on this device. Add it under More. Each version keeps its own due and new stanzas.";
  }
  const which = {
    on: "Norse is the Old Norse text.",
    en: "Bellows is the English text.",
    sv: "Brate is the Swedish text.",
    mine: `Mine is “${state.translation?.name || "My translation"},” stored only on this device.`,
  }[lang];
  return `${which} Each version keeps its own due and new stanzas.`;
}

function viewRead(n) {
  const stanza = stanzaByNumber(n);
  const tr = state.settings.translation;
  const lines = textLines(stanza, tr);
  const caption = tr === "en" ? bellowsCaption(stanza) : "";
  const note = tr === "sv" && stanza.svNote ? stanza.svNote : "";
  return `<main class="sheet read" tabindex="-1">
    <p class="label">${esc(SECTIONS[stanza.section] || "")}</p>
    <p class="stanza-num">${stanza.n}</p>
    <p class="label">Old Norse</p>
    ${poemBlock(stanza.on, "non", "full")}
    <button class="label switch" data-action="cycle-translation">${esc(translationLabel(tr))}</button>
    ${lines ? poemBlock(lines, langAttr(tr), "full", tr === "en" ? stanza.enGapAfter : null) : `<p class="missing">${tr === "mine" ? "No lines for this stanza in your translation." : "This text is missing."}</p>`}
    ${caption ? `<p class="source-note">${esc(caption)}</p>` : ""}
    ${note ? `<p class="source-note">${esc(note)}</p>` : ""}
    <div class="pager">
      <button data-action="read-step" data-dir="-1" aria-label="Previous stanza">Prev</button>
      <label class="jump"> <span class="sr">Stanza number</span>
        <input id="jump" inputmode="numeric" pattern="[0-9]*" value="${stanza.n}" aria-label="Stanza number">
      </label>
      <button data-action="read-step" data-dir="1" aria-label="Next stanza">Next</button>
    </div>
  </main>`;
}

function viewPractice() {
  const session = state.session;
  if (!session || session.index >= session.items.length) {
    return `<main class="sheet" tabindex="-1">
      <h1>Practice</h1>
      <p class="lead">${esc(state.message || "Nothing is waiting in this round.")}</p>
      <button class="text-btn" data-action="go" data-hash="#/today">Back to today</button>
    </main>`;
  }
  const item = session.items[session.index];
  const stanza = stanzaByNumber(item.n);
  const stage = item.stage;
  const lines = textLines(stanza, item.lang);
  const phase = item.learned ? session.phase : "learn";
  if (!item.learned) session.phase = "learn";
  const left = session.items.length - session.index;
  const round = left === 1 ? "1 stanza in this round" : `${left} stanzas in this round`;
  let body;
  if (!lines) {
    body = `<p class="missing">This stanza has no text in the version you are learning.</p>
      <button class="primary" data-action="skip-missing">Skip</button>`;
  } else if (phase === "learn") {
    body = learnBlock(stanza, lines, item.lang, session.learnReads || 1);
  } else if (phase === "prompt") {
    body = `${promptBlock(stanza, lines, stage, item.lang)}
      <button class="primary" data-action="reveal">Show the answer</button>`;
  } else {
    const companionLang = item.lang === "on" ? state.settings.translation : "on";
    const companion = textLines(stanza, companionLang);
    body = `<p class="label">Answer</p>
      ${poemBlock(lines, langAttr(item.lang), "full", item.lang === "en" ? stanza.enGapAfter : null)}
      ${companion ? `<p class="label companion">${esc(languageLabel(companionLang))}</p>${poemBlock(companion, langAttr(companionLang), "full", companionLang === "en" ? stanza.enGapAfter : null)}` : ""}
      <div class="grade-bar">
        <p class="label grade-label">How did it go?</p>
        <p class="hint">${esc(GRADE_HINT)}</p>
        <div class="grades">
          <button data-grade="again">Again</button>
          <button data-grade="hard">Hard</button>
          <button data-grade="good" class="good">Good</button>
          <button data-grade="easy" class="easy">Easy</button>
        </div>
      </div>`;
  }
  const hint = phase === "learn" ? LEARN_HINT : phase === "prompt" ? STAGE_HINT[stage] : "";
  return `<main class="sheet" tabindex="-1">
    <p class="label">${esc(stageLabel(item, phase))}</p>
    <p class="quiet">${round}</p>
    <p class="stanza-num ${phase !== "learn" && stage === 4 ? "" : "small"}">${stanza.n}</p>
    ${phase !== "learn" && stage === 4 ? `<p class="theme">${esc(stanza.theme)}</p>` : ""}
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
    ${body}
  </main>`;
}

function stageLabel(item, phase) {
  const version = LANGS.find((lang) => lang.id === item.lang)?.short || "";
  if (phase === "learn") return `${version} · Learn`;
  return `${version} · Stage ${item.stage} of 4 · ${STAGE_NAME[item.stage]}`;
}

function learnBlock(stanza, lines, lang, reads) {
  const count = clamp(reads || 1, 1, LEARN_READS);
  const ready = count >= LEARN_READS;
  const action = ready ? "start-recall" : "read-again";
  const label = ready ? "Try recalling it" : "Read it again";
  return `${poemBlock(lines, langAttr(lang), "full", lang === "en" ? stanza.enGapAfter : null)}
    <p class="quiet" aria-live="polite">Read ${count} of ${LEARN_READS}</p>
    <button class="primary" data-action="${action}">${label}</button>`;
}

function viewMore() {
  const report = state.importReport;
  const reportHtml = report
    ? `<p class="${report.ok ? "quiet" : "warn"}">${esc(report.text)}</p>`
    : "";
  const mine = state.translation
    ? `<p class="quiet">On this device: ${esc(state.translation.name)}, ${Object.keys(state.translation.stanzas).length} stanzas.</p>
       <button data-action="remove-translation">Remove my translation</button>`
    : `<p class="quiet">Nothing imported yet. The file stays on this phone.</p>`;
  const reset = state.confirmReset
    ? `<div class="confirm">
        <p>Erase all review history on this device? Your imported translation stays.</p>
        <button data-action="cancel-reset">Keep it</button>
        <button class="danger" data-action="do-reset">Erase progress</button>
      </div>`
    : `<button data-action="ask-reset">Reset progress</button>`;
  const backupConfirm = state.confirmBackup
    ? `<div class="confirm"><p>Replace progress on this device with the backup${state.confirmBackup.translation ? ", including the private translation in that file" : ""}?</p>
        <button data-action="cancel-backup">Cancel</button>
        <button class="danger" data-action="do-backup">Replace</button>
      </div>`
    : "";
  return `<main class="sheet" tabindex="-1">
    <h1>More</h1>
    <h2>Appearance</h2>
    <div class="seg-row" role="group" aria-label="Appearance">
      <button class="seg ${state.settings.theme === "dark" ? "is-on" : ""}" data-action="theme" data-theme="dark">Dark</button>
      <button class="seg ${state.settings.theme === "light" ? "is-on" : ""}" data-action="theme" data-theme="light">Light</button>
    </div>
    <h2>New stanzas per day</h2>
    <div class="stepper">
      <button data-action="daily" data-dir="-1" aria-label="Fewer new stanzas">−</button>
      <span>${state.settings.dailyNew}</span>
      <button data-action="daily" data-dir="1" aria-label="More new stanzas">+</button>
    </div>
    <p class="quiet">The usual number is 1 or 2. Stanzas you have already learned still come up when they are due.</p>
    <h2>My translation</h2>
    ${mine}
    <label class="field">Name
      <input id="tr-name" maxlength="80" placeholder="My translation" value="${esc(state.translation?.name || "")}">
    </label>
    <label class="field">Paste text or JSON
      <textarea id="tr-text" rows="8" placeholder="1&#10;[lines of stanza 1]&#10;&#10;2&#10;[lines of stanza 2]"></textarea>
    </label>
    <label class="file">Upload a file
      <input id="tr-file" type="file" accept=".json,.txt,text/plain,application/json">
    </label>
    <button class="primary" data-action="save-translation">Save on this device</button>
    ${reportHtml}
    <h2>Backup</h2>
    <p class="quiet">A file of your progress, and of a private translation if one is saved here. It is not uploaded anywhere.</p>
    <button data-action="export">Export backup</button>
    <label class="file">Import a backup
      <input id="backup-file" type="file" accept=".json,application/json">
    </label>
    ${backupConfirm}
    <h2>Reset</h2>
    ${reset}
    <details>
      <summary>How review works</summary>
      <p>A stanza you have not learned in the selected version is shown in full first. Read it three times, then recall it. Recall has four stages: the first line, missing words, first letters, then the number and theme alone. You grade yourself. Again brings the stanza back in about ten minutes and steps back a stage. Hard waits a little. Good moves to the next stage and spaces the review out. Easy waits longer. Due means you already learned that stanza in this version, and it is time to review it. Norse, Bellows, Brate, and Mine each keep their own schedule.</p>
    </details>
    <details>
      <summary>About the texts</summary>
      <p>Old Norse is Gustav Neckel’s 1914 text. English is Henry Adams Bellows, 1923. Swedish is Erik Brate, 1913. Stanza numbers follow Neckel and Brate. Where Bellows numbered a stanza differently, the English caption says so. Your own translation, if you add one, is stored only on this device. Nothing by Jackson Crawford is in this app.</p>
      <p>Add the site to your home screen to keep it offline.</p>
    </details>
  </main>`;
}

function promptBlock(stanza, lines, stage, lang) {
  if (stage === 1) {
    return `${poemBlock([lines[0]], langAttr(lang), "full")}<p class="rest" aria-hidden="true">· · ·</p>`;
  }
  if (stage === 2) return poemBlock(lines, langAttr(lang), "blanks", lang === "en" ? stanza.enGapAfter : null);
  if (stage === 3) return poemBlock(lines, langAttr(lang), "letters", lang === "en" ? stanza.enGapAfter : null);
  return "";
}

function poemBlock(lines, lang, mode, gapAfter = null) {
  const mask = mode === "blanks" ? blankMask(lines) : null;
  const html = lines.map((line, li) => {
    const gap = gapAfter != null && li === gapAfter ? " gap" : "";
    if (mode === "letters") {
      return `<p class="line${gap}">${letterLine(line)}</p>`;
    }
    if (mode === "blanks") {
      return `<p class="line${gap}">${blankLine(line, li, mask)}</p>`;
    }
    return `<p class="line${gap}">${esc(line)}</p>`;
  }).join("");
  return `<div class="poem" lang="${lang}">${html}</div>`;
}

function blankMask(lines) {
  const tokens = [];
  lines.forEach((line, li) => {
    if (isLacuna(line)) return;
    line.split(/(\s+)/).forEach((tok, ti) => {
      if (/\s/.test(tok) || !tok) return;
      const word = normWord(tok);
      if (letters(tok) >= 4 && !STOP.has(word)) tokens.push(`${li}:${ti}`);
    });
  });
  const hide = new Set();
  tokens.forEach((id, i) => {
    if (i % 3 === 1) hide.add(id);
  });
  if (!hide.size && tokens.length) hide.add(tokens[0]);
  return hide;
}

function blankLine(line, li, mask) {
  if (isLacuna(line)) return esc(line);
  return line.split(/(\s+)/).map((tok, ti) => {
    if (/\s/.test(tok) || !tok) return esc(tok);
    if (!mask.has(`${li}:${ti}`)) return esc(tok);
    const width = Math.max(3, letters(tok));
    return `<span class="blank" style="width:${width}ch" aria-label="missing word"></span>`;
  }).join("");
}

function letterLine(line) {
  if (isLacuna(line)) return esc(line);
  return line.split(/(\s+)/).map((tok) => {
    if (/\s/.test(tok) || !tok) return esc(tok);
    let seen = false;
    const out = [...tok].map((ch) => {
      if (!/\p{L}/u.test(ch)) return esc(ch);
      if (!seen) {
        seen = true;
        return esc(ch);
      }
      return "·";
    }).join("");
    return out;
  }).join("");
}

function studyItems(plan, lang) {
  const items = [];
  const push = (n, stage, kind, learned) => {
    if (!hasText(n, lang)) return;
    items.push({ lang, n, stage: stage || 1, kind, learned: Boolean(learned), retried: false });
  };
  plan.learning.forEach((card) => push(card.n, card.stage, "due", true));
  plan.reviews.forEach((card) => push(card.n, card.stage, "due", true));
  plan.started.forEach((card) => push(card.n, card.stage, "new", true));
  plan.toLearn.forEach((card) => push(card.n, 1, "new", false));
  plan.brandNew.forEach((n) => push(n, 1, "new", false));
  return items;
}

function hasText(n, lang) {
  return Boolean(textLines(stanzaByNumber(n), lang));
}

function ensureSession() {
  const today = localDateKey(new Date());
  const lang = state.settings.memorize;
  const finished = state.session && state.session.index >= state.session.items.length;
  if (state.session && state.session.day === today && state.session.lang === lang && !finished) return;
  const plan = planDay({
    cards: state.cards,
    lang,
    dailyNew: state.settings.dailyNew,
    now: new Date(),
  });
  const items = studyItems(plan, lang);
  const first = items[0];
  state.session = {
    day: today,
    lang,
    items,
    index: 0,
    phase: first && !first.learned ? "learn" : "prompt",
    learnReads: 1,
  };
  state.message = items.length ? "" : waitingMessage(plan);
}

function waitingMessage(plan) {
  if (plan.waiting.length) {
    const card = plan.waiting[0];
    return `Stanza ${card.n} comes back in ${minutesUntil(card.dueAt)}.`;
  }
  return "Nothing is waiting today.";
}

function completeLearn(item) {
  const now = new Date();
  const id = cardId(item.lang, item.n);
  const prev = state.cards[id];
  if (prev && isLearned(prev)) {
    item.learned = true;
    item.stage = prev.stage || item.stage || 1;
    return;
  }
  state.cards[id] = {
    ...(prev || newCard(now, item.lang, item.n)),
    lang: item.lang,
    n: item.n,
    learned: true,
    stage: 1,
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    status: "new",
    dueOn: localDateKey(now),
    dueAt: null,
    introducedOn: localDateKey(now),
  };
  saveCards();
  item.learned = true;
  item.stage = 1;
}

function onClick(event) {
  const gradeBtn = event.target.closest("[data-grade]");
  if (gradeBtn) {
    grade(gradeBtn.dataset.grade);
    return;
  }
  const btn = event.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "go") go(btn.dataset.hash);
  else if (action === "memorize") setMemorize(btn.dataset.lang);
  else if (action === "begin") go("#/practice");
  else if (action === "cycle-translation") cycleTranslation();
  else if (action === "read-step") stepRead(Number(btn.dataset.dir));
  else if (action === "reveal") {
    state.session.phase = "answer";
    render();
  } else if (action === "read-again") {
    const session = state.session;
    if (!session) return;
    session.learnReads = Math.min(LEARN_READS, (session.learnReads || 1) + 1);
    render();
  } else if (action === "start-recall") {
    const session = state.session;
    if (!session) return;
    const item = session.items[session.index];
    if (!item) return;
    completeLearn(item);
    session.phase = "prompt";
    render();
  } else if (action === "skip-missing") advance();
  else if (action === "theme") setTheme(btn.dataset.theme);
  else if (action === "daily") setDaily(Number(btn.dataset.dir));
  else if (action === "save-translation") saveImport();
  else if (action === "remove-translation") removeTranslation();
  else if (action === "export") exportBackup();
  else if (action === "ask-reset") {
    state.confirmReset = true;
    render();
  } else if (action === "cancel-reset") {
    state.confirmReset = false;
    render();
  } else if (action === "do-reset") {
    state.cards = {};
    saveCards();
    state.session = null;
    state.confirmReset = false;
    state.message = "Progress erased on this device.";
    go("#/today");
  } else if (action === "cancel-backup") {
    state.confirmBackup = null;
    render();
  } else if (action === "do-backup") applyBackup();
}

function onChange(event) {
  const t = event.target;
  if (t.id === "jump") {
    const n = clamp(Number(t.value) || 1, 1, 164);
    go(`#/read/${n}`);
  } else if (t.id === "tr-file") {
    readFile(t.files?.[0], (text) => {
      const box = document.querySelector("#tr-text");
      if (box) box.value = text;
    });
  } else if (t.id === "backup-file") {
    readFile(t.files?.[0], (text) => {
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        state.importReport = { ok: false, text: parsed.error };
        render();
        return;
      }
      state.confirmBackup = parsed;
      render();
    });
  }
}

let touch = null;
function onTouchStart(event) {
  if (!event.target.closest(".read")) return;
  const p = event.changedTouches[0];
  touch = { x: p.clientX, y: p.clientY };
}
function onTouchEnd(event) {
  if (!touch || route().view !== "read") {
    touch = null;
    return;
  }
  const p = event.changedTouches[0];
  const dx = p.clientX - touch.x;
  const dy = p.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
  stepRead(dx < 0 ? 1 : -1);
}

function setMemorize(lang) {
  if (!LANGS.some((item) => item.id === lang)) return;
  state.settings.memorize = lang;
  saveSettings();
  state.session = null;
  render();
}

function setTheme(theme) {
  state.settings.theme = theme === "light" ? "light" : "dark";
  saveSettings();
  applyTheme(state.settings.theme);
  render();
}

function setDaily(dir) {
  state.settings.dailyNew = clamp(state.settings.dailyNew + dir, 0, 5);
  saveSettings();
  state.session = null;
  render();
}

function cycleTranslation() {
  const order = ["en", "sv", "mine"];
  const i = order.indexOf(state.settings.translation);
  state.settings.translation = order[(i + 1) % order.length];
  saveSettings();
  render();
}

function stepRead(dir) {
  const n = route().n || state.settings.lastRead;
  const next = clamp(n + dir, 1, 164);
  go(`#/read/${next}`);
}

function grade(gradeName) {
  const session = state.session;
  if (!session) return;
  const item = session.items[session.index];
  const id = cardId(item.lang, item.n);
  const card = state.cards[id] || newCard(new Date(), item.lang, item.n);
  const updated = reviewCard(card, gradeName, new Date());
  state.cards[id] = updated;
  saveCards();
  if (gradeName === "again" && !item.retried) {
    session.items.push({
      lang: item.lang,
      n: item.n,
      stage: updated.stage,
      kind: "due",
      learned: true,
      retried: true,
    });
  }
  advance();
}

function advance() {
  const session = state.session;
  session.index += 1;
  session.learnReads = 1;
  if (session.index < session.items.length) {
    const next = session.items[session.index];
    const card = state.cards[cardId(next.lang, next.n)];
    if (card && next.retried) next.stage = card.stage;
    else if (card && next.learned) next.stage = card.stage || next.stage;
    session.phase = next.learned ? "prompt" : "learn";
  } else {
    session.phase = "prompt";
    state.message = "That is the round.";
  }
  render();
}

async function saveImport() {
  const text = document.querySelector("#tr-text")?.value || "";
  const nameField = document.querySelector("#tr-name")?.value || "";
  const parsed = parseTranslation(text);
  if (!parsed.ok) {
    state.importReport = { ok: false, text: parsed.error };
    render();
    return;
  }
  const name = nameField.trim().slice(0, 80) || parsed.name;
  await saveTranslation({ name, stanzas: parsed.stanzas });
  const missing = parsed.missing.length
    ? ` Missing ${formatMissing(parsed.missing)}.`
    : " All 164 stanzas are present.";
  state.importReport = { ok: true, text: `Saved ${parsed.count} stanzas as “${name}”.${missing}` };
  render();
}

async function removeTranslation() {
  await saveTranslation(null);
  if (state.settings.translation === "mine") state.settings.translation = "en";
  if (state.settings.memorize === "mine") state.settings.memorize = "on";
  saveSettings();
  state.session = null;
  state.importReport = { ok: true, text: "The private translation was removed from this device." };
  render();
}

function exportBackup() {
  const payload = {
    format: "havamal-v1",
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    cards: state.cards,
    translation: state.translation,
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `havamal-v1-backup-${localDateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function applyBackup() {
  const parsed = state.confirmBackup;
  if (!parsed) return;
  const settings = loadSettings();
  const incoming = parsed.settings || {};
  state.settings = {
    ...settings,
    theme: incoming.theme === "light" ? "light" : incoming.theme === "dark" ? "dark" : settings.theme,
    memorize: LANGS.some((l) => l.id === incoming.memorize) ? incoming.memorize : settings.memorize,
    translation: ["en", "sv", "mine"].includes(incoming.translation) ? incoming.translation : settings.translation,
    dailyNew: clamp(Number(incoming.dailyNew ?? settings.dailyNew), 0, 5),
    lastRead: clamp(Number(incoming.lastRead ?? settings.lastRead), 1, 164),
  };
  state.cards = sanitizeCards(parsed.cards);
  saveSettings();
  saveCards();
  if (parsed.translation) await saveTranslation(parsed.translation);
  state.confirmBackup = null;
  state.session = null;
  state.importReport = { ok: true, text: "Backup restored on this device." };
  applyTheme(state.settings.theme);
  render();
}

function sanitizeCards(cards) {
  const out = {};
  for (const [id, card] of Object.entries(cards || {})) {
    if (!card || typeof card !== "object") continue;
    const lang = card.lang;
    const n = Number(card.n);
    if (!LANGS.some((l) => l.id === lang) || !Number.isInteger(n) || n < 1 || n > 164) continue;
    out[cardId(lang, n)] = migrateCard({ ...card, lang, n });
  }
  return out;
}

function readFile(file, done) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result || ""));
  reader.readAsText(file);
}

function stanzaByNumber(n) {
  return state.data.stanzas[n - 1];
}

function textLines(stanza, lang) {
  if (lang === "on") return stanza.on;
  if (lang === "en") return stanza.en;
  if (lang === "sv") return stanza.sv;
  const lines = state.translation?.stanzas?.[stanza.n] || state.translation?.stanzas?.[String(stanza.n)];
  return lines && lines.length ? lines : null;
}

function translationLabel(lang) {
  if (lang === "mine") return state.translation?.name || "My translation";
  return languageLabel(lang);
}

function languageLabel(lang) {
  return LANGS.find((item) => item.id === lang)?.label || lang;
}

function langAttr(lang) {
  if (lang === "on") return "non";
  if (lang === "sv") return "sv";
  if (lang === "en") return "en";
  return "und";
}

function bellowsCaption(stanza) {
  const nums = stanza.bellows || [stanza.n];
  if (nums.length === 1 && nums[0] === stanza.n) return "";
  if (nums.length === 1) return `Bellows numbers this stanza ${nums[0]}.`;
  return `Bellows numbers these lines ${nums[0]} and ${nums[1]}.`;
}

function formatMissing(list) {
  if (list.length > 12) return `${list.length} stanza numbers`;
  return list.join(", ");
}

function minutesUntil(ts) {
  const mins = Math.max(1, Math.round((ts - Date.now()) / 60000));
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}

function cardId(lang, n) {
  return `${lang}:${n}`;
}

function letters(token) {
  return [...token].filter((ch) => /\p{L}/u.test(ch)).length;
}

function normWord(token) {
  return token.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

function isLacuna(line) {
  return /^[\s.·…]+$/.test(line);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
