// Shared helpers for the `yarn translations:*` scripts.
// The English file (src/locales/en/common.json) is the ground truth for which keys exist.
// Every other language mirrors its structure; a null value means "not translated yet" and the app
// shows the English string instead.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const LOCALES_DIR = path.join(ROOT, "src/locales");
export const SRC_DIR = path.join(ROOT, "src");
export const PRIMARY = "en";

export const LANGUAGES = JSON.parse(
  fs.readFileSync(path.join(LOCALES_DIR, "languages.json"), "utf8"),
);
export const BRAND_WORDS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "brandWords.json"), "utf8"),
)
  // Longest first so "AnythingLLM Desktop" is protected before "AnythingLLM".
  .sort((a, b) => b.length - a.length);

export const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];
const PLURAL_RE = new RegExp(`^(.*)_(${PLURAL_SUFFIXES.join("|")})$`);

export function localeFile(code) {
  return path.join(LOCALES_DIR, code, "common.json");
}

export function readLocale(code) {
  const file = localeFile(code);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeLocale(code, data) {
  const file = localeFile(code);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function languageName(code) {
  return LANGUAGES.find(lang => lang.code === code)?.englishName ?? code;
}

/** Plural categories CLDR defines for a language, eg. ru -> [one, few, many, other], ja -> [other]. */
export function pluralCategories(code) {
  return new Intl.PluralRules(code).resolvedOptions().pluralCategories;
}

/** Flatten a nested dictionary into { "a.b.c": value } in file order. */
export function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

export function unflatten(flat) {
  const out = {};
  for (const [full, value] of Object.entries(flat)) {
    const parts = full.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = value;
  }
  return out;
}

/**
 * Split an English flat key list into plain keys and plural groups.
 * A plural group is any base with `_one`/`_other` style siblings, eg. chats.count_one + chats.count_other.
 */
export function groupKeys(flatEn) {
  const plurals = new Map();
  const plain = [];
  for (const key of Object.keys(flatEn)) {
    const match = key.match(PLURAL_RE);
    if (match && `${match[1]}_other` in flatEn) {
      if (!plurals.has(match[1])) plurals.set(match[1], {});
      plurals.get(match[1])[match[2]] = flatEn[key];
    } else plain.push(key);
  }
  return { plain, plurals };
}

/**
 * The flat keys a language must have, in English file order. Plural groups expand to that
 * language's own CLDR categories. Each entry carries the English source text to translate from.
 */
export function expectedKeys(code, flatEn) {
  const { plurals } = groupKeys(flatEn);
  const categories = pluralCategories(code);
  const expected = new Map();
  const emitted = new Set();
  for (const key of Object.keys(flatEn)) {
    const match = key.match(PLURAL_RE);
    const base = match && plurals.has(match[1]) ? match[1] : null;
    if (!base) {
      expected.set(key, flatEn[key]);
      continue;
    }
    if (emitted.has(base)) continue;
    emitted.add(base);
    const forms = plurals.get(base);
    for (const category of categories)
      expected.set(`${base}_${category}`, forms[category] ?? forms.other);
  }
  return expected;
}

export const PLACEHOLDER_RE = /\{\{\s*[^}]+?\s*\}\}/g;
export const TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9]*\s*\/?>/g;

export function tokensOf(text, re) {
  return (text.match(re) ?? []).map(token => token.replace(/\s+/g, "")).sort();
}

/** Matches a brand word only as a whole word, so "Llama" does not match inside "Llamas" etc. */
export function brandRegex(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "gu");
}

export function brandWordsIn(text) {
  let remaining = text;
  const found = [];
  for (const word of BRAND_WORDS) {
    const re = brandRegex(word);
    if (re.test(remaining)) {
      found.push(word);
      remaining = remaining.replace(brandRegex(word), " ");
    }
  }
  return found;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "locales" || entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

// t("key"), i18n.t("key"), i18nKey="key" and keys wrapped in tKey("key") for deferred lookups.
const KEY_PATTERNS = [
  /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g,
  /\bi18nKey=\{?\s*["'`]([a-zA-Z0-9_.]+)["'`]/g,
  /\btKey\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g,
];

/** Every literal translation key referenced in the app source, with where it is used. */
export function keysUsedInSource() {
  const used = new Map();
  for (const file of [...walk(SRC_DIR), path.join(ROOT, "App.tsx"), path.join(ROOT, "index.js")]) {
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const re of KEY_PATTERNS) {
      for (const match of source.matchAll(re)) {
        const key = match[1];
        if (!key.includes(".")) continue;
        if (!used.has(key)) used.set(key, []);
        used.get(key).push(path.relative(ROOT, file).replace(/\\/g, "/"));
      }
    }
  }
  return used;
}

/** Resolve a key used in code against the English dictionary (plural keys resolve via `_other`). */
export function keyExists(key, flatEn) {
  return key in flatEn || `${key}_other` in flatEn;
}

export const log = (...args) => console.log("\x1b[32m[translations]\x1b[0m", ...args);
export const warn = (...args) => console.warn("\x1b[33m[translations]\x1b[0m", ...args);
export const fail = (...args) => console.error("\x1b[31m[translations]\x1b[0m", ...args);
