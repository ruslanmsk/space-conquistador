import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { QuestionRecord } from "@space-conquistador/game-core";

export const DEFAULT_QUESTIONS_DIR = fileURLToPath(new URL("../../../content/questions/", import.meta.url));

/** Whole question bank: every JSON file in content/questions (same set as the mobile client). */
export function loadQuestions(dir = DEFAULT_QUESTIONS_DIR): QuestionRecord[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const all: QuestionRecord[] = [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as QuestionRecord[];
    all.push(...data);
  }
  if (!all.length) throw new Error(`No questions in ${dir}`);
  return all;
}
