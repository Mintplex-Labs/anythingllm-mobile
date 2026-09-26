/* global process */
// `yarn translations:verify` - run in CI and before any PR that touches strings.
// 1. Every key the app source uses exists in the English dictionary.
// 2. Every language file has exactly the English keys (plural keys use that language's own categories).
// 3. Translated values keep the {{placeholders}} and <tags> of the English string.
// 4. src/locales/resources.ts lists exactly the language files that exist.
import fs from "fs";
import path from "path";
import {
  LANGUAGES,
  LOCALES_DIR,
  PLACEHOLDER_RE,
  PRIMARY,
  TAG_RE,
  brandWordsIn,
  expectedKeys,
  fail,
  flatten,
  keyExists,
  keysUsedInSource,
  log,
  readLocale,
  tokensOf,
  warn,
} from "./lib.mjs";

const errors = [];
const flatEn = flatten(readLocale(PRIMARY));

// 1. Keys used in code
for (const [key, files] of keysUsedInSource()) {
  if (!keyExists(key, flatEn))
    errors.push(`Key "${key}" is used in ${[...new Set(files)].join(", ")} but missing from en/common.json`);
}

for (const [key, value] of Object.entries(flatEn)) {
  if (typeof value !== "string" || !value.trim())
    errors.push(`en/common.json "${key}" must be a non-empty string`);
}

// 2 + 3. Language files
const knownCodes = new Set(LANGUAGES.map(lang => lang.code));
const presentCodes = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

for (const code of presentCodes) {
  if (!knownCodes.has(code)) {
    errors.push(`src/locales/${code} is not listed in src/locales/languages.json`);
    continue;
  }
  if (code === PRIMARY) continue;
  const data = readLocale(code);
  if (!data) {
    errors.push(`src/locales/${code} has no common.json`);
    continue;
  }

  const flat = flatten(data);
  const expected = expectedKeys(code, flatEn);
  const missing = [...expected.keys()].filter(key => !(key in flat));
  const extra = Object.keys(flat).filter(key => !expected.has(key));
  let untranslated = 0;
  const problems = [];

  if (missing.length) problems.push(`missing keys: ${missing.join(", ")}`);
  if (extra.length) problems.push(`keys not in English: ${extra.join(", ")}`);

  for (const [key, source] of expected) {
    if (!(key in flat)) continue;
    const value = flat[key];
    if (value === null || value === "") {
      untranslated++;
      continue;
    }
    if (typeof value !== "string") {
      problems.push(`"${key}" must be a string or null`);
      continue;
    }
    if (tokensOf(source, PLACEHOLDER_RE).join() !== tokensOf(value, PLACEHOLDER_RE).join())
      problems.push(`"${key}" placeholders differ from English: ${JSON.stringify(value)}`);
    if (tokensOf(source, TAG_RE).join() !== tokensOf(value, TAG_RE).join())
      problems.push(`"${key}" tags differ from English: ${JSON.stringify(value)}`);
    const lostBrands = brandWordsIn(source).filter(word => !value.includes(word));
    if (lostBrands.length) warn(`${code} "${key}" dropped brand word(s) ${lostBrands.join(", ")}: ${JSON.stringify(value)}`);
  }

  const status = problems.length ? "❌" : "✅";
  const coverage = `${expected.size - untranslated}/${expected.size} translated`;
  log(`${status} ${code} (${coverage})`);
  for (const problem of problems) errors.push(`${code}: ${problem}`);
}

// 4. Generated resource index
const resourcesSource = fs.readFileSync(path.join(LOCALES_DIR, "resources.ts"), "utf8");
const indexed = [...resourcesSource.matchAll(/from "\.\/([^/]+)\/common\.json"/g)].map(m => m[1]).sort();
const onDisk = presentCodes.filter(code => knownCodes.has(code) && readLocale(code)).sort();
if (indexed.join() !== onDisk.join())
  errors.push(`src/locales/resources.ts is out of date (lists ${indexed.join(", ")}; found ${onDisk.join(", ")}) - run yarn translations:normalize`);

if (errors.length) {
  for (const error of errors) fail(error);
  fail(`${errors.length} problem(s) found.`);
  process.exit(1);
}
log("👍 All translation files match the English dictionary.");
