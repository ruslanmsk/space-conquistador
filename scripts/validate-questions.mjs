import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "content/questions/ru.json");
const data = JSON.parse(readFileSync(path, "utf8"));

const CATEGORIES = [
  "История",
  "География",
  "Наука",
  "Природа",
  "Космос",
  "Искусство",
  "Литература",
  "Кино и ТВ",
  "Музыка",
  "Спорт",
  "Язык",
  "Технологии",
  "Еда",
  "Разное",
];
const MAX_FACT_LENGTH = 160;

const ids = new Set();
const texts = new Set();
const errors = [];
const fail = (q, msg) => errors.push(`${q.id ?? "?"}: ${msg}`);

for (const q of data) {
  if (!q.id || !q.text || !q.type || !q.category) fail(q, "missing fields");
  if (ids.has(q.id)) fail(q, "duplicate id");
  ids.add(q.id);

  const norm = String(q.text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (texts.has(norm)) fail(q, "duplicate text");
  texts.add(norm);

  if (![1, 2, 3].includes(q.difficulty)) fail(q, "difficulty must be 1..3");
  if (!CATEGORIES.includes(q.category)) fail(q, `unknown category "${q.category}"`);
  if (typeof q.fact !== "string" || !q.fact.trim()) fail(q, "fact must be a non-empty string");
  else if (q.fact.length > MAX_FACT_LENGTH) fail(q, `fact longer than ${MAX_FACT_LENGTH} chars`);

  if (q.type === "mcq") {
    // Choices are shuffled at runtime, so the position of the correct answer in the file does not matter.
    if (!Array.isArray(q.choices) || q.choices.length !== 4) fail(q, "mcq needs exactly 4 choices");
    else if (q.choices.some((c) => typeof c !== "string" || !c.trim())) fail(q, "empty choice");
    else if (new Set(q.choices).size !== q.choices.length) fail(q, "duplicate choices");
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= (q.choices?.length ?? 0))
      fail(q, "bad correctIndex");
  } else if (q.type === "numeric") {
    // Answers are typed on a numeric pad: whole, non-negative numbers only.
    if (!Number.isInteger(q.correctValue) || q.correctValue < 0)
      fail(q, "numeric correctValue must be a non-negative integer");
    if (q.tolerance !== undefined && !(q.tolerance >= 0)) fail(q, "tolerance must be >= 0");
    if (q.unit !== undefined && (typeof q.unit !== "string" || !q.unit.trim())) fail(q, "unit must be a non-empty string");
    if (q.choices || q.correctIndex !== undefined) fail(q, "numeric must not have choices");
  } else {
    fail(q, `unknown type ${q.type}`);
  }
}

const countBy = (key) => data.reduce((acc, q) => ((acc[key(q)] = (acc[key(q)] ?? 0) + 1), acc), {});
for (const e of errors) console.error(e);
console.log(`questions: ${data.length}, errors: ${errors.length}`);
console.log(`by type: ${JSON.stringify(countBy((q) => q.type))}`);
console.log(`by difficulty: ${JSON.stringify(countBy((q) => q.difficulty))}`);
console.log(`by category: ${JSON.stringify(countBy((q) => `${q.category}/${q.type}`))}`);
process.exit(errors.length ? 1 : 0);
