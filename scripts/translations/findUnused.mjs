/* global process */
// `yarn translations:unused` lists English keys no source file references.
// `yarn translations:prune` also deletes them from en/common.json (then normalize drops them everywhere).
// Only literal keys are found - t("a.b"), i18n.t("a.b"), i18nKey="a.b" and tKey("a.b") - so never
// build keys dynamically; store them with tKey() instead.
import {
  PLURAL_SUFFIXES,
  PRIMARY,
  flatten,
  keysUsedInSource,
  log,
  readLocale,
  unflatten,
  warn,
  writeLocale,
} from "./lib.mjs";

const flatEn = flatten(readLocale(PRIMARY));
const used = keysUsedInSource();
const pluralBase = key => {
  const match = key.match(new RegExp(`^(.*)_(${PLURAL_SUFFIXES.join("|")})$`));
  return match ? match[1] : key;
};

const unused = Object.keys(flatEn).filter(key => !used.has(key) && !used.has(pluralBase(key)));
if (!unused.length) {
  log("No unused keys 🎉");
  process.exit(0);
}

for (const key of unused) warn(`unused: ${key}`);
if (process.argv.includes("--delete")) {
  for (const key of unused) delete flatEn[key];
  writeLocale(PRIMARY, unflatten(flatEn));
  log(`Removed ${unused.length} unused key(s) from en/common.json`);
} else log(`${unused.length} unused key(s). Run yarn translations:prune to delete them.`);
