# Question pipeline

Generates, verifies, and compiles the bundled question bank (PLAN.md §6).

```
data/web-bible.json     ground truth — World English Bible (public domain)
data/generated/*.json   candidate question batches (LLM- or hand-written)
data/verified.json      auto-passed all checks            ← verify.mjs
data/review-queue.json  needs a human eye (with verse)    ← verify.mjs
data/rejected.json      hard failures with reasons        ← verify.mjs
data/approved-manual.json  reviewed questions promoted from the queue
../app/src/questions/bank.json  shipped bank              ← compile.mjs
```

## Workflow

```bash
node scripts/fetch-bible.mjs   # once — downloads the WEB corpus
# add batches to data/generated/ (see format below)
node scripts/verify.mjs        # → verified / review-queue / rejected
# review data/review-queue.json: move good ones into data/approved-manual.json
node scripts/compile.mjs       # → app/src/questions/bank.json
```

## Batch format

One JSON array per file, `data/generated/batch-NNN-<topic>.json`:

```json
[
  {
    "id": "q_b01_001",
    "reference": "1 Samuel 17:50",
    "difficulty": 1,
    "category": "history",
    "text": { "en": "Who defeated the giant Goliath?" },
    "answers": { "en": ["David", "Saul", "Jonathan", "Samuel"] },
    "correctIndex": 0
  }
]
```

Rules (enforced by verify.mjs):
- `reference` must be `"Book C:V"` or `"Book C:V-V2"` and exist in the WEB
  corpus (book names as in WEB, e.g. "Psalms", "Song of Songs").
- 4 unique answers; question ≤ 160 chars; answers ≤ 50 chars.
- `category`: torah | history | wisdom | prophets | gospels | epistles
  (Acts counts as history; Daniel as prophets; Revelation as epistles).
- `difficulty`: 1 = Sunday-school famous → 5 = deep cuts.
- The correct answer should literally appear in the cited verse(s) ±2 verses;
  if it can't (paraphrase questions), it lands in the review queue — fine,
  just review it.

## Generation prompt (for an LLM, e.g. Claude)

> Write N multiple-choice Bible quiz questions for category «X», difficulty «D»
> (1 = famous Sunday-school facts, 5 = details only avid readers know).
> Every question MUST cite the verse reference that proves the correct answer,
> using World English Bible book names. 4 answers, exactly one correct;
> distractors must be plausible same-kind entities (people with people,
> places with places, numbers with numbers). No trick questions, no
> "all of the above", no theology/interpretation — facts stated in the text
> only. Keep questions short (fits a mobile card, ≤ 120 chars).
> Output as the JSON batch format above with ids q_bNN_001…
