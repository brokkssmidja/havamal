// Anki-style SM-2 for one reader.
// A stanza is learned in one version only after the reader has studied it there.
// Due means learned, and scheduled for today. New means not learned in that version.
// Again: back in 10 minutes, one stage easier, ease down.
// Hard: same stage, interval × 1.2, ease down a little.
// Good: next stage (until stage 4), interval 1 day, then 6, then × ease.
// Easy: next stage, a longer interval, ease up a little.
// Day-based cards store dueOn as YYYY-MM-DD in the local calendar.
// Learning cards store dueAt as a timestamp.

const MIN_EASE = 1.3;
const MAX_EASE = 3;
const MAX_INTERVAL = 3650;

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateKey(dt);
}

export function dayOfYear(date) {
  const y = date.getFullYear();
  const start = Date.UTC(y, 0, 1);
  const today = Date.UTC(y, date.getMonth(), date.getDate());
  return Math.floor((today - start) / 86400000) + 1;
}

export function stanzaOfDay(date, count = 164) {
  const day = dayOfYear(date);
  return ((day - 1) % count) + 1;
}

export function newCard(now, lang, n) {
  return {
    lang,
    n,
    stage: 1,
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    learned: false,
    status: "new",
    dueOn: localDateKey(now),
    dueAt: null,
    introducedOn: localDateKey(now),
  };
}

// Learned is explicit once the reader finishes the learn step, or once an older
// card had already advanced past the first recall stage. A stage-1 card from
// before that step existed was quizzed without being taught, so it is not due.
export function isLearned(card) {
  if (!card || typeof card !== "object") return false;
  if (card.learned === true) return true;
  if (card.learned === false) return false;
  return (Number(card.stage) || 1) >= 2;
}

export function migrateCard(card) {
  if (!card || typeof card !== "object") return card;
  if (card.learned === true) return card;
  if (card.learned === false) {
    if (isFreshUnlearned(card)) return card;
    return normalizeUnlearned(card);
  }
  if ((Number(card.stage) || 1) >= 2) return { ...card, learned: true };
  return normalizeUnlearned(card);
}

function isFreshUnlearned(card) {
  return card.status === "new"
    && card.dueAt == null
    && (Number(card.stage) || 1) === 1
    && !(Number(card.interval) || 0)
    && !(Number(card.reps) || 0);
}

function normalizeUnlearned(card) {
  return {
    ...card,
    learned: false,
    status: "new",
    stage: 1,
    interval: 0,
    reps: 0,
    lapses: 0,
    ease: 2.5,
    dueAt: null,
  };
}

export function reviewCard(card, grade, now) {
  const ease0 = clamp(Number(card.ease) || 2.5, MIN_EASE, MAX_EASE);
  const interval = Number(card.interval) || 0;
  const reps = Number(card.reps) || 0;
  const stage = clamp(Number(card.stage) || 1, 1, 4);
  const today = localDateKey(now);

  if (grade === "again") {
    return {
      ...card,
      learned: true,
      stage: Math.max(1, stage - 1),
      ease: clamp(ease0 - 0.2, MIN_EASE, MAX_EASE),
      interval: 0,
      reps: 0,
      lapses: (Number(card.lapses) || 0) + 1,
      status: "learning",
      dueOn: today,
      dueAt: now.getTime() + 10 * 60 * 1000,
    };
  }

  let ease = ease0;
  let nextInterval = 1;
  let nextStage = stage;

  if (grade === "hard") {
    ease = clamp(ease0 - 0.15, MIN_EASE, MAX_EASE);
    nextInterval = Math.max(1, Math.round(interval * 1.2) || 1);
  } else if (grade === "good") {
    if (reps === 0) nextInterval = 1;
    else if (reps === 1) nextInterval = 6;
    else nextInterval = Math.max(1, Math.round(interval * ease));
    if (stage < 4) nextStage = stage + 1;
  } else if (grade === "easy") {
    ease = clamp(ease0 + 0.15, MIN_EASE, MAX_EASE);
    if (reps === 0) nextInterval = 4;
    else nextInterval = Math.max((interval || 1) + 1, Math.round((interval || 1) * ease * 1.3));
    if (stage < 4) nextStage = stage + 1;
  } else {
    throw new Error(`Unknown grade: ${grade}`);
  }

  return {
    ...card,
    learned: true,
    stage: nextStage,
    ease,
    interval: Math.min(nextInterval, MAX_INTERVAL),
    reps: reps + 1,
    status: "review",
    dueOn: addDays(today, Math.min(nextInterval, MAX_INTERVAL)),
    dueAt: null,
  };
}

export function planDay({ cards, lang, dailyNew, now, stanzaCount = 164 }) {
  const today = localDateKey(now);
  const learning = [];
  const waiting = [];
  const reviews = [];
  const fresh = [];
  const started = [];
  let introduced = 0;
  const have = new Set();

  for (const card of Object.values(cards || {})) {
    if (!card || card.lang !== lang || !Number.isInteger(card.n)) continue;
    have.add(card.n);
    const learned = isLearned(card);
    if (learned && card.introducedOn === today) introduced += 1;
    if (!learned) {
      fresh.push(card);
    } else if (card.status === "learning" && card.dueAt) {
      if (card.dueAt <= now.getTime()) learning.push(card);
      else waiting.push(card);
    } else if (card.status === "review" && card.dueOn && card.dueOn <= today) {
      reviews.push(card);
    } else if (card.status === "new" || (card.status === "learning" && !card.dueAt)) {
      started.push(card);
    }
  }

  learning.sort((a, b) => a.dueAt - b.dueAt || a.n - b.n);
  waiting.sort((a, b) => a.dueAt - b.dueAt || a.n - b.n);
  reviews.sort((a, b) => String(a.dueOn).localeCompare(String(b.dueOn)) || a.n - b.n);
  fresh.sort((a, b) => a.n - b.n);
  started.sort((a, b) => a.n - b.n);

  const slots = Math.max(0, (Number(dailyNew) || 0) - introduced);
  const toLearn = fresh.slice(0, slots);
  const heldBack = fresh.length - toLearn.length;
  const room = Math.max(0, slots - toLearn.length);
  const brandNew = [];
  for (let n = 1; n <= stanzaCount && brandNew.length < room; n += 1) {
    if (!have.has(n)) brandNew.push(n);
  }

  return {
    today,
    learning,
    waiting,
    reviews,
    started,
    toLearn,
    heldBack,
    brandNew,
    introduced,
    slots,
  };
}
