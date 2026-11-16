import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const doc = JSON.parse(fs.readFileSync(path.join(site, "data", "stanzas.json"), "utf8"));

assert.equal(doc.stanzas.length, 164);
const seen = new Map();
for (const stanza of doc.stanzas) {
  assert.equal(stanza.n, doc.stanzas.indexOf(stanza) + 1);
  for (const key of ["on", "sv", "en"]) {
    assert.ok(Array.isArray(stanza[key]) && stanza[key].length > 0, `${key} ${stanza.n}`);
    for (const line of stanza[key]) {
      assert.equal(typeof line, "string");
      assert.ok(line.trim().length > 0, `blank ${key} ${stanza.n}`);
      assert.ok(!/crawford|jackson|hrafn|simrock/i.test(line), line);
    }
  }
  assert.ok(stanza.theme && stanza.theme.length > 8);
  assert.ok(["counsels", "love", "mead", "loddfafnir", "runes", "songs", "close"].includes(stanza.section));
  for (const n of stanza.bellows) {
    assert.ok(!seen.has(n), `Bellows ${n} used twice`);
    seen.set(n, stanza.n);
  }
  if (stanza.enGapAfter != null) {
    assert.ok(stanza.enGapAfter >= 0 && stanza.enGapAfter < stanza.en.length - 1);
  }
}
for (let n = 1; n <= 165; n += 1) assert.ok(seen.has(n), `missing Bellows ${n}`);

assert.ok(doc.stanzas[0].on[0].startsWith("Gáttir"));
assert.ok(doc.stanzas[0].en[0].startsWith("Within the gates"));
assert.ok(doc.stanzas[0].sv[0].startsWith("Alla dörrar"));
assert.ok(doc.stanzas[137].on[0].startsWith("Veit ek"));
assert.ok(doc.stanzas[137].en[0].startsWith("I ween"));
assert.equal(doc.stanzas[137].bellows[0], 139);
assert.equal(doc.stanzas[163].bellows[0], 138);
assert.ok(doc.stanzas[163].en[0].startsWith("Now are Hor"));
assert.deepEqual(doc.stanzas[161].bellows, [163, 164]);
assert.equal(doc.stanzas[38].bellows[0], 40);
assert.equal(doc.stanzas[39].bellows[0], 39);
assert.equal(doc.stanzas[104].bellows[0], 106);
assert.equal(doc.stanzas[105].bellows[0], 105);

const sw = fs.readFileSync(path.join(site, "sw.js"), "utf8");
const files = [...sw.matchAll(/"([^"]+\.(?:html|css|js|json|webmanifest|woff2|txt|png|svg))"/g)].map((m) => m[1]);
assert.ok(files.includes("index.html"));
for (const file of files) {
  assert.ok(fs.existsSync(path.join(site, file)), `missing ${file}`);
}

const raw = JSON.stringify(doc);
assert.ok(!/jackson crawford/i.test(raw));
console.log("validate: 164 stanzas, Bellows 1–165 mapped once, shell files present");
