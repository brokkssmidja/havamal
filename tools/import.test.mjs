import assert from "node:assert/strict";
import test from "node:test";
import { parseBackup, parseTranslation } from "../site/import-text.js";

test("plain text with bare numbers", () => {
  const parsed = parseTranslation("1\nAlpha line\nsecond line\n\n2\nOnly one\n");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.count, 2);
  assert.deepEqual(parsed.stanzas[1], ["Alpha line", "second line"]);
  assert.deepEqual(parsed.stanzas[2], ["Only one"]);
  assert.equal(parsed.missing.length, 162);
});

test("plain text with dotted numbers", () => {
  const parsed = parseTranslation("12. First\nnext\n13) Other");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.stanzas[12], ["First", "next"]);
  assert.deepEqual(parsed.stanzas[13], ["Other"]);
});

test("JSON map and array", () => {
  const map = parseTranslation(JSON.stringify({
    name: "Desk copy",
    stanzas: { "4": "one\ntwo", "5": "three" },
  }));
  assert.equal(map.ok, true);
  assert.equal(map.name, "Desk copy");
  assert.deepEqual(map.stanzas[4], ["one", "two"]);

  const list = parseTranslation(JSON.stringify([
    { n: 1, lines: ["a", "b"] },
    { stanza: 2, text: "c" },
  ]));
  assert.equal(list.ok, true);
  assert.deepEqual(list.stanzas[1], ["a", "b"]);
  assert.deepEqual(list.stanzas[2], ["c"]);
});

test("rejects a file with no stanza numbers", () => {
  const parsed = parseTranslation("just a paragraph of verse");
  assert.equal(parsed.ok, false);
});

test("backup keeps the havamal-v1 shape", () => {
  const bad = parseBackup("{}");
  assert.equal(bad.ok, false);
  const good = parseBackup(JSON.stringify({
    format: "havamal-v1",
    settings: { dailyNew: 1 },
    cards: { "on:1": { lang: "on", n: 1, stage: 2 } },
    translation: { name: "Mine", stanzas: { "1": ["hello"] } },
  }));
  assert.equal(good.ok, true);
  assert.equal(good.settings.dailyNew, 1);
  assert.equal(good.cards["on:1"].stage, 2);
  assert.deepEqual(good.translation.stanzas[1], ["hello"]);
});
