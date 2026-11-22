import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dayOfYear, isLearned, localDateKey, migrateCard, newCard, planDay, reviewCard, stanzaOfDay } from "../site/srs.js";

test("dates stay on the local calendar", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  const jan1 = new Date(2026, 0, 1);
  assert.equal(dayOfYear(jan1), 1);
  assert.equal(stanzaOfDay(jan1), 1);
  const day165 = new Date(2026, 0, 1);
  day165.setDate(165);
  assert.equal(dayOfYear(day165), 165);
  assert.equal(stanzaOfDay(day165), 1);
});

test("good walks the four stages and then spaces out", () => {
  const start = new Date(2026, 5, 1, 9, 0, 0);
  let card = newCard(start, "on", 1);
  card = reviewCard(card, "good", start);
  assert.equal(card.learned, true);
  assert.equal(card.stage, 2);
  assert.equal(card.interval, 1);
  assert.equal(card.dueOn, "2026-06-02");
  card = reviewCard(card, "good", new Date(2026, 5, 2, 9));
  assert.equal(card.stage, 3);
  assert.equal(card.interval, 6);
  card = reviewCard(card, "good", new Date(2026, 5, 8, 9));
  assert.equal(card.stage, 4);
  assert.equal(card.interval, 15);
  card = reviewCard(card, "good", new Date(2026, 5, 23, 9));
  assert.equal(card.stage, 4);
  assert.equal(card.interval, 38);
});

test("again steps back and returns in ten minutes", () => {
  const now = new Date(2026, 5, 1, 9, 0, 0);
  const card = reviewCard({ ...newCard(now, "on", 4), stage: 3, reps: 2, interval: 6, status: "review" }, "again", now);
  assert.equal(card.stage, 2);
  assert.equal(card.status, "learning");
  assert.equal(card.interval, 0);
  assert.equal(card.reps, 0);
  assert.equal(card.dueAt, now.getTime() + 10 * 60 * 1000);
  assert.equal(card.lapses, 1);
  assert.equal(card.learned, true);
  assert.equal(card.stage, 2);
});

test("hard keeps the stage and lengthens a little", () => {
  const now = new Date(2026, 5, 1, 9);
  const card = reviewCard({ ...newCard(now, "sv", 8), stage: 4, reps: 3, interval: 10, ease: 2.5, status: "review" }, "hard", now);
  assert.equal(card.stage, 4);
  assert.equal(card.interval, 12);
  assert.ok(Math.abs(card.ease - 2.35) < 1e-9);
  assert.equal(card.dueOn, "2026-06-13");
});

test("easy from a new card waits four days and advances", () => {
  const now = new Date(2026, 5, 1, 9);
  const card = reviewCard(newCard(now, "en", 2), "easy", now);
  assert.equal(card.stage, 2);
  assert.equal(card.interval, 4);
  assert.equal(card.dueOn, "2026-06-05");
  assert.ok(card.ease > 2.5);
});

test("the day plan keeps the new-stanza limit", () => {
  const now = new Date(2026, 5, 1, 9);
  const first = planDay({ cards: {}, lang: "on", dailyNew: 2, now });
  assert.deepEqual(first.brandNew, [1, 2]);
  const prior = "2026-05-01";
  const studied = (card) => ({ ...card, learned: true });
  const cards = {
    "on:1": studied({ ...newCard(now, "on", 1), introducedOn: prior, status: "review", dueOn: "2026-06-01", stage: 2 }),
    "on:3": studied({ ...newCard(now, "on", 3), introducedOn: prior, status: "review", dueOn: "2026-06-02", stage: 2 }),
    "on:4": studied({ ...newCard(now, "on", 4), introducedOn: prior, status: "learning", dueAt: now.getTime() - 1000, stage: 1 }),
    "on:5": studied({ ...newCard(now, "on", 5), introducedOn: prior, status: "learning", dueAt: now.getTime() + 600000, stage: 2 }),
  };
  const plan = planDay({ cards, lang: "on", dailyNew: 2, now });
  assert.deepEqual(plan.learning.map((c) => c.n), [4]);
  assert.deepEqual(plan.waiting.map((c) => c.n), [5]);
  assert.deepEqual(plan.reviews.map((c) => c.n), [1]);
  assert.deepEqual(plan.started, []);
  assert.deepEqual(plan.toLearn, []);
  assert.deepEqual(plan.brandNew, [2, 6]);
  assert.equal(localDateKey(now), "2026-06-01");
});

test("stage 1 is not due, and each version keeps its own queue", () => {
  const now = new Date(2026, 10, 22, 6, 1);
  const cards = {
    "sv:1": { lang: "sv", n: 1, stage: 1, ease: 2.3, interval: 0, reps: 0, lapses: 1, status: "learning", dueOn: "2026-11-22", dueAt: now.getTime() - 100000, introducedOn: "2026-11-20" },
    "sv:3": { lang: "sv", n: 3, stage: 1, ease: 2.3, interval: 0, reps: 0, lapses: 1, status: "learning", dueOn: "2026-11-21", dueAt: now.getTime() - 50000, introducedOn: "2026-11-21" },
    "sv:2": { lang: "sv", n: 2, stage: 1, ease: 2.5, interval: 1, reps: 1, lapses: 0, status: "review", dueOn: "2026-11-22", dueAt: null, introducedOn: "2026-11-19" },
    "on:1": { lang: "on", n: 1, stage: 3, ease: 2.5, interval: 6, reps: 2, lapses: 0, status: "review", dueOn: "2026-11-22", dueAt: null, introducedOn: "2026-11-16" },
  };

  assert.equal(isLearned(cards["sv:1"]), false);
  assert.equal(isLearned(cards["sv:2"]), false);
  assert.equal(isLearned(cards["on:1"]), true);
  assert.equal(isLearned(newCard(now, "sv", 9)), false);

  const sv = planDay({ cards, lang: "sv", dailyNew: 2, now });
  assert.deepEqual(sv.learning.map((c) => c.n), []);
  assert.deepEqual(sv.reviews.map((c) => c.n), []);
  assert.deepEqual(sv.toLearn.map((c) => c.n), [1, 2]);
  assert.equal(sv.heldBack, 1);
  assert.deepEqual(sv.brandNew, []);

  const on = planDay({ cards, lang: "on", dailyNew: 2, now });
  assert.deepEqual(on.reviews.map((c) => c.n), [1]);
  assert.deepEqual(on.toLearn, []);
  assert.deepEqual(on.learning, []);
  assert.deepEqual(on.brandNew, [2, 3]);
});

test("migration keeps a later stage and clears a quiz that never advanced", () => {
  const kept = migrateCard({ lang: "en", n: 8, stage: 2, status: "review", dueOn: "2026-11-22", interval: 1, reps: 1, ease: 2.35 });
  assert.equal(kept.learned, true);
  assert.equal(kept.status, "review");
  assert.equal(kept.stage, 2);
  assert.equal(kept.dueOn, "2026-11-22");
  assert.equal(kept.ease, 2.35);
  assert.equal(migrateCard(kept), kept);

  const cleared = migrateCard({ lang: "sv", n: 1, stage: 1, status: "learning", dueAt: 1, interval: 0, reps: 0, lapses: 2, ease: 2.1 });
  assert.equal(cleared.learned, false);
  assert.equal(cleared.status, "new");
  assert.equal(cleared.stage, 1);
  assert.equal(cleared.dueAt, null);
  assert.equal(cleared.lapses, 0);
  assert.equal(cleared.ease, 2.5);
  assert.equal(migrateCard(cleared), cleared);
});

test("a learned lapse stays due, and yesterday's unfinished recall still appears", () => {
  const now = new Date(2026, 10, 22, 6, 1);
  const cards = {
    "sv:5": { ...newCard(now, "sv", 5), learned: true, status: "learning", stage: 1, dueAt: now.getTime() - 1000, reps: 0, interval: 0, introducedOn: "2026-11-21" },
    "sv:4": { ...newCard(now, "sv", 4), learned: true, status: "new", stage: 1, introducedOn: "2026-11-21" },
  };
  const plan = planDay({ cards, lang: "sv", dailyNew: 2, now });
  assert.deepEqual(plan.learning.map((c) => c.n), [5]);
  assert.deepEqual(plan.started.map((c) => c.n), [4]);
  assert.deepEqual(plan.toLearn, []);
  assert.deepEqual(plan.brandNew, [1, 2]);
});
