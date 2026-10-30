#!/usr/bin/env node
// Checks a question translation against the shipped bank.
//
//   node scripts/check-i18n.mjs <lang>      e.g. hu, de
//
// Reads  ../app/src/questions/bank.json
//        i18n/<lang>.json        { "<id>": { "text": "…", "answers": ["…","…","…","…"] } }
//        i18n/<lang>-names.json  { "English name": "translated name" }  (optional glossary)
//
// Errors (exit 1): an id missing or unknown, empty text, not exactly 4 non-empty
// distinct answers, an answer left identical to the English one (unless it is a
// number or a name whose translation is spelled the same), leftover { or }.
// Warnings: a glossary name used in the English text/answers whose translated
// form doesn't show up in the translation (inflected forms are matched by stem).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lang = process.argv[2];
if (!lang || !/^[a-z]{2,3}$/.test(lang)) {
  console.error('usage: node scripts/check-i18n.mjs <lang>   (e.g. hu, de)');
  process.exit(2);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const bank = readJson(path.resolve(root, '../app/src/questions/bank.json'));
const trPath = path.join(root, 'i18n', `${lang}.json`);
const namesPath = path.join(root, 'i18n', `${lang}-names.json`);
if (!fs.existsSync(trPath)) {
  console.error(`missing ${path.relative(process.cwd(), trPath)}`);
  process.exit(1);
}
const tr = readJson(trPath);
const names = fs.existsSync(namesPath) ? readJson(namesPath) : {};

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);

// Translated names that may legitimately equal the English spelling.
const sameNames = new Set(
  Object.entries(names)
    .filter(([en, x]) => en.toLowerCase() === String(x).toLowerCase())
    .map(([en]) => en.toLowerCase()),
);
const allTranslated = new Set(Object.values(names).map((x) => String(x).toLowerCase()));
const isNumberLike = (s) => /^[\d\s.,:/%+–-]+$/.test(s) || /^[\d.,]+\s*(%|°)?$/.test(s);
const isSameName = (s) => {
  const k = s.toLowerCase().trim();
  if (sameNames.has(k) || allTranslated.has(k)) return true;
  // "Ruth and Naomi"-style pairs: every capitalised part must be a same-spelled name
  const parts = s.split(/\s*(?:,|&|\band\b|\bund\b|\bés\b)\s*/i).filter(Boolean);
  return parts.length > 1 && parts.every((p) => sameNames.has(p.toLowerCase()) || allTranslated.has(p.toLowerCase()));
};

const ids = new Set(bank.map((q) => q.id));
for (const id of Object.keys(tr)) if (!ids.has(id)) err(id, 'not in bank.json');

for (const q of bank) {
  const t = tr[q.id];
  if (!t) { err(q.id, 'missing'); continue; }
  if (typeof t.text !== 'string' || !t.text.trim()) err(q.id, 'empty text');
  if (!Array.isArray(t.answers) || t.answers.length !== 4) { err(q.id, 'needs exactly 4 answers'); continue; }
  const norm = t.answers.map((a) => (typeof a === 'string' ? a.trim() : ''));
  if (norm.some((a) => !a)) err(q.id, 'empty answer');
  if (new Set(norm.map((a) => a.toLowerCase())).size !== 4) err(q.id, `answers not distinct: ${JSON.stringify(norm)}`);
  for (const s of [t.text, ...norm]) if (/[{}]/.test(s ?? '')) err(q.id, `leftover brace: ${s}`);
  norm.forEach((a, i) => {
    const en = q.answers.en[i].trim();
    if (a === en && !isNumberLike(a) && !isSameName(a)) err(q.id, `answer ${i} untranslated: "${a}"`);
  });

  // glossary consistency (warning only)
  const enAll = [q.text.en, ...q.answers.en].join(' \n ');
  const trAll = [t.text, ...norm].join(' \n ').toLowerCase();
  for (const [en, x] of Object.entries(names)) {
    if (!x || en.length < 3) continue;
    const re = new RegExp(`(^|[^A-Za-z])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`);
    if (!re.test(enAll)) continue;
    // match by stem so inflected forms count (Mózes → Mózest, Sára → Sárát)
    const forms = String(x).toLowerCase().split(/\s*\/\s*/);
    const found = forms.some((f) => {
      const stem = f.length > 4 ? f.slice(0, Math.max(4, f.length - 3)) : f.slice(0, Math.max(2, f.length - 1));
      return trAll.includes(stem);
    });
    if (!found) warnings.push(`${q.id}: "${en}" → "${x}" not found`);
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(
  `${lang}: ${Object.keys(tr).length}/${bank.length} translated, ${Object.keys(names).length} glossary names, ` +
    `${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
