// Parses a private translation the reader already owns.
// Nothing here is fetched, and nothing is written except by the caller.

const MAX_CHARS = 1_500_000;

export function parseTranslation(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, error: "Nothing to read yet." };
  if (text.length > MAX_CHARS) return { ok: false, error: "That file is too large for this app." };
  if (text.startsWith("{") || text.startsWith("[")) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: "That JSON could not be read." };
    }
    return fromJson(data);
  }
  return fromPlain(text);
}

function fromJson(data) {
  if (Array.isArray(data)) return collect(data, "My translation");
  if (!data || typeof data !== "object") {
    return { ok: false, error: "The JSON should be a list of stanzas, or an object with a stanzas field." };
  }
  const name = cleanName(data.name) || "My translation";
  if (Array.isArray(data.stanzas)) return collect(data.stanzas, name);
  if (data.stanzas && typeof data.stanzas === "object") {
    const entries = Object.entries(data.stanzas).map(([n, value]) => ({ n, text: value }));
    return collect(entries, name);
  }
  const keys = Object.keys(data).filter((k) => k !== "name" && k !== "language" && k !== "lang");
  if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
    const entries = keys.map((n) => ({ n, text: data[n] }));
    return collect(entries, name);
  }
  return { ok: false, error: "Put each stanza under “stanzas”, numbered from 1 to 164." };
}

function fromPlain(text) {
  const rows = text.split(/\r?\n/);
  const found = [];
  let current = null;
  let buf = [];
  let saw = false;

  const flush = () => {
    if (current == null) return;
    const lines = buf.map((s) => s.trim()).filter(Boolean);
    buf = [];
    if (lines.length) found.push({ n: current, lines });
    current = null;
  };

  for (const row of rows) {
    const headed = row.match(/^\s*(\d{1,3})\s*[\.\:\)]\s*(.*)$/);
    const bare = row.match(/^\s*(\d{1,3})\s*$/);
    const hit = headed || bare;
    if (hit) {
      const n = Number(hit[1]);
      if (n >= 1 && n <= 164) {
        flush();
        current = n;
        saw = true;
        if (headed && headed[2] && headed[2].trim()) buf.push(headed[2]);
        continue;
      }
    }
    if (current != null) buf.push(row);
  }
  flush();
  if (!saw) {
    return { ok: false, error: "Add a stanza number before each stanza, from 1 to 164." };
  }
  return collect(found, "My translation");
}

function collect(entries, name) {
  const stanzas = {};
  const ignored = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const n = Number(entry.n ?? entry.number ?? entry.stanza);
    const lines = linesFrom(entry.lines ?? entry.text ?? entry.verse ?? "");
    if (!Number.isInteger(n) || n < 1 || n > 164) {
      if (Number.isFinite(n)) ignored.push(n);
      continue;
    }
    if (!lines.length) continue;
    stanzas[n] = lines;
  }
  const count = Object.keys(stanzas).length;
  if (!count) return { ok: false, error: "No stanzas numbered 1–164 were found." };
  const missing = [];
  for (let i = 1; i <= 164; i += 1) if (!stanzas[i]) missing.push(i);
  return { ok: true, name, stanzas, count, missing, ignored };
}

function linesFrom(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function parseBackup(input) {
  let data;
  try {
    data = JSON.parse(String(input ?? ""));
  } catch {
    return { ok: false, error: "That backup could not be read." };
  }
  if (!data || data.format !== "havamal-v1" || typeof data !== "object") {
    return { ok: false, error: "This backup is not an havamal-v1 file." };
  }
  const cards = data.cards && typeof data.cards === "object" && !Array.isArray(data.cards) ? data.cards : {};
  const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  let translation = null;
  if (data.translation && typeof data.translation === "object") {
    const parsed = collect(
      Object.entries(data.translation.stanzas || {}).map(([n, lines]) => ({ n, lines })),
      cleanName(data.translation.name) || "My translation",
    );
    if (parsed.ok) {
      translation = { name: parsed.name, stanzas: parsed.stanzas, importedAt: data.translation.importedAt || null };
    }
  }
  return { ok: true, settings, cards, translation };
}
