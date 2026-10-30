#!/usr/bin/env node
// Checks a question translation against the shipped bank.
//
//   node scripts/check-i18n.mjs <lang>      e.g. de, hu
//
// Reads i18n/<lang>.json ({ id: { text, answers[4] } }) and, if present,
// i18n/<lang>-names.json ({ "English name": "translated name" }).
// Errors (exit 1): missing/extra ids, empty text, not exactly 4 non-empty
// distinct answers, leftover { or }, an answer identical to the English one
// that is not a number or a name listed unchanged in the glossary.
// Warnings: a glossary name appears in the English text/answers but its
// translated form is missing from the translation.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2];
if (!lang || !/^[a-z]{2,3}$/.test(lang)) {
  console.error('usage: node scripts/check-i18n.mjs <lang>   (e.g. de, hu)');
  process.exit(2);
}

const bank = JSON.parse(readFileSync(join(root, '../app/src/questions/bank.json'), 'utf8'));
const trPath = join(root, 'i18n', `${lang}.json`);
if (!existsSync(trPath)) {
  console.error(`missing ${trPath}`);
  process.exit(1);
}
const tr = JSON.parse(readFileSync(trPath, 'utf8'));
const namesPath = join(root, 'i18n', `${lang}-names.json`);
const names = existsSync(namesPath) ? JSON.parse(readFileSync(namesPath, 'utf8')) : {};

const errors = [];
const warnings = [];
const sameWord = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);

const norm = (s) => s.normalize('NFC').trim().toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// An answer may stay identical to English when it is a number/symbol-only
// string or consists only of glossary names that keep their English form.
const sameNames = new Set(
  Object.entries(names)
    .filter(([en, x]) => en === x)
    .map(([en]) => en),
);
// Returns 'ok', 'warn' (a single word: may be spelled the same, e.g. "Gold",
// "Manna" — listed for a human look) or 'error' (a phrase left in English).
function sameAsEnglish(a) {
  if (!/[A-Za-z]/.test(a)) return 'ok'; // numbers, symbols
  const words = a.split(/[\s,/()–-]+/).filter(Boolean);
  if (words.every((w) => sameNames.has(w.replace(/['’]s$/, '')) || /^\d/.test(w))) return 'ok';
  return words.length === 1 ? 'warn' : 'error';
}

const bankIds = new Set(bank.map((q) => q.id));
for (const id of Object.keys(tr)) if (!bankIds.has(id)) err(id, 'not in bank.json');

// Glossary lookup: longest names first so "John the Baptist" wins over "John".
const glossary = Object.entries(names)
  .filter(([en]) => en.length > 1)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([en, x]) => [en, x, new RegExp(`(^|[^A-Za-z])${escapeRe(en)}(?=$|[^A-Za-z])`)]);

let checked = 0;
for (const q of bank) {
  const t = tr[q.id];
  if (!t) {
    err(q.id, 'missing');
    continue;
  }
  checked++;
  if (typeof t.text !== 'string' || !t.text.trim()) err(q.id, 'empty text');
  if (!Array.isArray(t.answers) || t.answers.length !== 4) {
    err(q.id, 'needs exactly 4 answers');
    continue;
  }
  if (t.answers.some((a) => typeof a !== 'string' || !a.trim())) err(q.id, 'empty answer');
  else if (new Set(t.answers.map(norm)).size !== 4) err(q.id, `answers not distinct: ${JSON.stringify(t.answers)}`);
  const all = [t.text ?? '', ...t.answers];
  if (all.some((s) => typeof s === 'string' && /[{}]/.test(s))) err(q.id, 'leftover { or }');
  if (t.text && norm(t.text) === norm(q.text.en)) err(q.id, 'text identical to English');
  t.answers.forEach((a, i) => {
    const en = q.answers.en[i];
    if (typeof a !== 'string' || norm(a) !== norm(en)) return;
    const v = sameAsEnglish(en);
    if (v === 'error') err(q.id, `answer ${i} identical to English: "${a}"`);
    else if (v === 'warn') sameWord.push(`${q.id}: "${a}"`);
  });

  // Glossary consistency (warning only): every glossary name in the English
  // should show up in its translated form somewhere in the translation.
  const enAll = [q.text.en, ...q.answers.en].join(' \n ');
  const trAll = all.join(' \n ').normalize('NFC');
  let rest = enAll;
  for (const [en, x, re] of glossary) {
    if (!re.test(rest)) continue;
    rest = rest.replace(new RegExp(re.source, 'g'), '$1 ');
    // Compare on the stem (drop a trailing inflection like -s/-n/-en).
    const stem = x.normalize('NFC').replace(/^(der|die|das) /, '');
    const core = stem.length > 4 ? stem.slice(0, -1) : stem;
    if (!trAll.toLowerCase().includes(core.toLowerCase())) {
      warnings.push(`${q.id}: "${en}" → expected "${x}"`);
    }
  }
}

if (warnings.length) {
  console.log(`warnings (${warnings.length}): glossary name missing from translation`);
  for (const w of warnings) console.log('  ' + w);
}
if (sameWord.length) {
  console.log(`same single word as English (${sameWord.length}), check they are right in ${lang}:`);
  console.log('  ' + sameWord.join(', '));
}
if (errors.length) {
  console.log(`errors (${errors.length}):`);
  for (const e of errors) console.log('  ' + e);
}
console.log(
  `${lang}: ${checked}/${bank.length} translated, ${Object.keys(names).length} glossary names, ` +
    `${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
