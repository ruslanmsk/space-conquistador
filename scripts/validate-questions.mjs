import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "content/questions/ru.json");
const data = JSON.parse(readFileSync(path, "utf8"));

const ids = new Set();
const texts = new Set();
const errors = [];
const fail = (q, msg) => errors.push(`${q.id ?? "?"}: ${msg}`);

for (const q of data) {
  if (!q.id || !q.text || !q.type || !q.category) fail(q, "missing fields");
  if (ids.has(q.id)) fail(q, "duplicate id");
  ids.add(q.id);

  const norm = q.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (texts.has(norm)) fail(q, "duplicate text");
  texts.add(norm);

  if (![1, 2, 3].includes(q.difficulty)) fail(q, "difficulty must be 1..3");

  if (q.type === "mcq") {
    // Choices are shuffled at runtime, so the position of the correct answer in the file does not matter.
    if (!Array.isArray(q.choices) || q.choices.length !== 4) fail(q, "mcq needs exactly 4 choices");
    else if (new Set(q.choices).size !== q.choices.length) fail(q, "duplicate choices");
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= (q.choices?.length ?? 0))
      fail(q, "bad correctIndex");
  } else if (q.type === "numeric") {
    if (typeof q.correctValue !== "number") fail(q, "numeric correctValue");
    if (q.tolerance !== undefined && !(q.tolerance >= 0)) fail(q, "tolerance must be >= 0");
    if (q.choices || q.correctIndex !== undefined) fail(q, "numeric must not have choices");
  } else {
    fail(q, `unknown type ${q.type}`);
  }
}

const byType = data.reduce((acc, q) => ((acc[q.type] = (acc[q.type] ?? 0) + 1), acc), {});
for (const e of errors) console.error(e);
console.log(`questions: ${data.length} (${JSON.stringify(byType)}), errors: ${errors.length}`);
process.exit(errors.length ? 1 : 0);
