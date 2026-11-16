import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dayOfYear, localDateKey, newCard, planDay, reviewCard, stanzaOfDay } from "../site/srs.js";

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
  const cards = {
    "on:1": { ...newCard(now, "on", 1), introducedOn: prior, status: "review", dueOn: "2026-06-01", stage: 2 },
    "on:3": { ...newCard(now, "on", 3), introducedOn: prior, status: "review", dueOn: "2026-06-02" },
    "on:4": { ...newCard(now, "on", 4), introducedOn: prior, status: "learning", dueAt: now.getTime() - 1000, stage: 1 },
    "on:5": { ...newCard(now, "on", 5), introducedOn: prior, status: "learning", dueAt: now.getTime() + 600000 },
  };
  const plan = planDay({ cards, lang: "on", dailyNew: 2, now });
  assert.deepEqual(plan.learning.map((c) => c.n), [4]);
  assert.deepEqual(plan.waiting.map((c) => c.n), [5]);
  assert.deepEqual(plan.reviews.map((c) => c.n), [1]);
  assert.deepEqual(plan.brandNew, [2, 6]);
  assert.equal(localDateKey(now), "2026-06-01");
});
