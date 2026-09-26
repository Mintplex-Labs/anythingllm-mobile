/* global process */
// `yarn translations:create` (all languages) or `node scripts/translations/translate.mjs <code>`
// Fills every null entry of a language file by translating the English string with a local
// Ollama model (translategemma by default). Existing translations are never touched.
// Run `yarn translations:normalize` first so new keys exist as null in every language file.
//
// Env: OLLAMA_HOST (default http://127.0.0.1:11434), TRANSLATE_MODEL (default translategemma:4b)
import {
  BRAND_WORDS,
  LANGUAGES,
  PLACEHOLDER_RE,
  PRIMARY,
  TAG_RE,
  brandRegex,
  brandWordsIn,
  expectedKeys,
  flatten,
  languageName,
  log,
  readLocale,
  tokensOf,
  unflatten,
  warn,
  writeLocale,
} from "./lib.mjs";

const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = process.env.TRANSLATE_MODEL || "translategemma:latest";
const MAX_ATTEMPTS = 3;
// Write progress to disk this often so an interrupted run keeps its work.
const SAVE_EVERY = 25;

/**
 * Swap {{placeholders}}, <tags> and brand words for opaque tokens the model is told to keep,
 * so "Download {{name}} from Hugging Face" cannot come back with a translated brand or variable.
 */
function protect(text) {
  const tokens = [];
  const stash = match => {
    tokens.push(match);
    return `__T${tokens.length - 1}__`;
  };
  let out = text.replace(PLACEHOLDER_RE, stash).replace(TAG_RE, stash);
  for (const word of BRAND_WORDS) out = out.replace(brandRegex(word), stash);
  return { text: out, tokens };
}

function restore(text, tokens) {
  return text.replace(/__T(\d+)__/g, (match, index) => tokens[Number(index)] ?? match);
}

function buildPrompt(text, code, hasTokens) {
  const source = languageName(PRIMARY);
  const target = languageName(code);
  const tokenRule = hasTokens
    ? `\nIMPORTANT: The text contains tokens like __T0__, __T1__. Keep every token exactly as written - do not translate, modify, reorder into words, or remove them.`
    : "";
  return `You are a professional ${source} (${PRIMARY}) to ${target} (${code.toLowerCase()}) translator for the user interface of a mobile AI chat app. Your goal is to accurately convey the meaning and nuances of the original ${source} text while adhering to ${target} grammar, vocabulary, and cultural sensitivities. Keep it concise, like UI text.${tokenRule}
Produce only the ${target} translation, without any additional explanations or commentary. Please translate the following ${source} text into ${target}:


${text}`;
}

function clean(text) {
  return text.replace(/<\|im_end\|>|<\|im_start\|>|<end_of_turn>|<start_of_turn>/g, "").trim();
}

async function ollamaTranslate(text, code) {
  const { text: protectedText, tokens } = protect(text);
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(protectedText, code, tokens.length > 0) }],
      options: { temperature: 0.1 },
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
  const data = await response.json();
  const output = restore(clean(data.message?.content ?? ""), tokens);
  // Keep the English string's surrounding whitespace (eg. separators like ", ") - clean() trims it.
  const [, lead, , trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return output ? `${lead}${output}${trail}` : output;
}

/** Why a translation cannot be used, or null when it keeps everything the English string needs. */
function rejectReason(source, output) {
  if (!output) return "empty output";
  if (/__T\d+__/.test(output)) return "left a token unrestored";
  if (tokensOf(source, PLACEHOLDER_RE).join() !== tokensOf(output, PLACEHOLDER_RE).join())
    return "placeholders changed";
  if (tokensOf(source, TAG_RE).join() !== tokensOf(output, TAG_RE).join()) return "tags changed";
  const lost = brandWordsIn(source).filter(word => !output.includes(word));
  if (lost.length) return `dropped brand word(s) ${lost.join(", ")}`;
  return null;
}

async function translateLanguage(code) {
  const flatEn = flatten(readLocale(PRIMARY));
  const current = readLocale(code);
  if (!current) throw new Error(`src/locales/${code}/common.json does not exist - run yarn translations:normalize first`);
  const flat = flatten(current);
  const expected = expectedKeys(code, flatEn);
  const todo = [...expected].filter(([key]) => flat[key] === null || flat[key] === "" || !(key in flat));

  log(`${languageName(code)} (${code}): ${todo.length} string(s) to translate`);
  let done = 0;
  let skipped = 0;
  const save = () => {
    const ordered = {};
    for (const key of expected.keys()) ordered[key] = flat[key] ?? null;
    writeLocale(code, unflatten(ordered));
  };

  for (const [key, source] of todo) {
    // Strings that are nothing but brand words / placeholders stay as they are.
    const { text: bare } = protect(source);
    if (!bare.replace(/__T\d+__/g, "").replace(/[\s\p{P}]/gu, "")) {
      flat[key] = source;
      continue;
    }

    let output = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const candidate = await ollamaTranslate(source, code);
      const reason = rejectReason(source, candidate);
      if (!reason) {
        output = candidate;
        break;
      }
      warn(`${code} "${key}" attempt ${attempt}: ${reason} -> ${JSON.stringify(candidate)}`);
    }

    if (output === null) {
      // Left null so the app falls back to English rather than showing a broken string.
      skipped++;
      continue;
    }
    flat[key] = output;
    done++;
    log(`${code} ${key}: ${JSON.stringify(source)} -> ${JSON.stringify(output)}`);
    if (done % SAVE_EVERY === 0) save();
  }

  save();
  log(`${code}: translated ${done}, left ${skipped} for a human to fix`);
}

const arg = process.argv[2];
if (!arg) throw new Error("Pass a language code (eg. de) or --all");
const codes =
  arg === "--all"
    ? LANGUAGES.map(lang => lang.code).filter(code => code !== PRIMARY && readLocale(code))
    : [arg];
for (const code of codes) {
  if (!LANGUAGES.some(lang => lang.code === code)) throw new Error(`${code} is not in src/locales/languages.json`);
  await translateLanguage(code);
}
