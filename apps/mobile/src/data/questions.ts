import type { QuestionRecord } from "@space-conquistador/game-core";
import chgk from "../../../../content/questions/chgk.ru.json";
import sites from "../../../../content/questions/quiz-sites.ru.json";
import core from "../../../../content/questions/ru.json";
import wikidata from "../../../../content/questions/wikidata.ru.json";

/** Whole question bank: hand-written core + generated + adapted sets (validated by scripts/validate-questions.mjs). */
export const RU_QUESTIONS = [...core, ...wikidata, ...sites, ...chgk] as QuestionRecord[];
