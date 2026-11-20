#!/usr/bin/env node
// Generates content/questions/wikidata.ru.json from Wikidata (https://query.wikidata.org).
//
//   node scripts/wikidata-questions.mjs            # uses cached responses where available
//   node scripts/wikidata-questions.mjs --refresh  # re-downloads everything
//   node scripts/wikidata-questions.mjs --only=capital,film-director --dry   # debug a few templates, print, don't write
//
// Raw SPARQL responses are cached in scripts/.cache/wikidata/<sha1>.json, so re-runs are
// offline and reproducible. Queries run one at a time with a pause between them.
// No npm dependencies: Node 22+ (global fetch).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "scripts/.cache/wikidata");
const OUT = join(ROOT, "content/questions/wikidata.ru.json");
const BANK_DIR = join(ROOT, "content/questions");
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "space-conquistador-quiz/0.1 (local trivia generator)";
const PAUSE_MS = 2000;
const MAX_FACT = 140;
const THIS_YEAR = 2025; // events after this are ignored (data may be incomplete)

const argv = process.argv.slice(2);
const REFRESH = argv.includes("--refresh");
const DRY = argv.includes("--dry");
const ONLY = (argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

// ───────────────────────────── SPARQL + cache ─────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queryCount = 0;
let networkCount = 0;

async function sparql(query) {
  const hash = createHash("sha1").update(query).digest("hex");
  const file = join(CACHE_DIR, `${hash}.json`);
  queryCount++;
  let raw;
  if (!REFRESH && existsSync(file)) raw = readFileSync(file, "utf8");
  else {
    for (let attempt = 1; ; attempt++) {
      await sleep(networkCount++ ? PAUSE_MS : 0);
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ query }),
        });
        const text = await res.text();
        // WDQS reports query timeouts as 500 or (sometimes) 400 with a TimeoutException in the body.
        if (res.status === 429 || res.status >= 500 || /TimeoutException/.test(text)) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(-600)}`);
        JSON.parse(text); // a timeout mid-stream yields truncated JSON
        raw = text;
        break;
      } catch (e) {
        if (attempt >= 3 || /HTTP 4\d\d:/.test(e.message)) throw e;
        console.warn(`  retry ${attempt} after error: ${e.message.split("\n")[0]}`);
        await sleep(15000 * attempt);
      }
    }
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, raw);
  }
  const json = JSON.parse(raw);
  return json.results.bindings.map((b) =>
    Object.fromEntries(
      Object.entries(b).map(([k, v]) => [k, v.type === "uri" ? v.value.replace("http://www.wikidata.org/entity/", "") : v.value]),
    ),
  );
}

const RU_LABEL = `?s rdfs:label ?l. FILTER(lang(?l) = "ru")
  ?art schema:about ?s; schema:isPartOf <https://ru.wikipedia.org/>.`;

/** Items matching `where` (which must bind ?s and ?sl) that have a ru label and a ru Wikipedia article. */
async function baseSet(where) {
  const rows = await sparql(`SELECT DISTINCT ?s ?l ?sl WHERE { ${where} ${RU_LABEL} }`);
  const map = new Map();
  for (const r of rows) if (!map.has(r.s)) map.set(r.s, { id: r.s, label: r.l, sl: Number(r.sl) });
  return map;
}

/** Union of per-class base sets (one small query per class instead of one big VALUES query). */
async function baseSetUnion(classes, minSl, extra = "") {
  const all = new Map();
  for (const c of classes) {
    const part = await baseSet(`?s wdt:P31 wd:${c}; wikibase:sitelinks ?sl. FILTER(?sl >= ${minSl}) ${extra}`);
    for (const [k, v] of part) if (!all.has(k)) all.set(k, v);
  }
  return all;
}

/**
 * Statements of property `pid` for the given items.
 * kind: item | string | time | quantity. Returns Map id -> [{v, label, rank, end, prec, cal, circa}]
 */
async function props(ids, pid, kind) {
  const out = new Map();
  const list = [...new Set(ids)].filter((id) => /^Q\d+$/.test(id)); // "unknown value" comes back as a genid URI
  const value = {
    item: `?st ps:${pid} ?v. OPTIONAL { ?v rdfs:label ?vl. FILTER(lang(?vl) = "ru") }`,
    string: `?st ps:${pid} ?v.`,
    time: `?st psv:${pid} ?tv. ?tv wikibase:timeValue ?v; wikibase:timePrecision ?prec; wikibase:timeCalendarModel ?cal.
      OPTIONAL { ?st pq:P1480 ?circa }`,
    quantity: `?st psv:${pid}/wikibase:quantityAmount ?raw. OPTIONAL { ?st psn:${pid}/wikibase:quantityAmount ?v }`,
  }[kind];
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const rows = await sparql(`SELECT ?s ?st ?v ?vl ?rank ?end ?prec ?cal ?circa ?raw WHERE {
  VALUES ?s { ${chunk.map((id) => `wd:${id}`).join(" ")} }
  ?s p:${pid} ?st. ?st wikibase:rank ?rank. FILTER(?rank != wikibase:DeprecatedRank)
  ${value}
  OPTIONAL { ?st pq:P582 ?end }
}`);
    const seen = new Set();
    for (const r of rows) {
      const key = `${r.st}|${r.v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!out.has(r.s)) out.set(r.s, []);
      out.get(r.s).push({
        v: kind === "quantity" ? Number(r.v ?? r.raw) : r.v,
        label: r.vl,
        rank: r.rank.endsWith("PreferredRank") ? "preferred" : "normal",
        end: r.end,
        prec: r.prec ? Number(r.prec) : undefined,
        julian: r.cal ? r.cal.endsWith("Q1985786") : false,
        circa: !!r.circa,
      });
    }
  }
  return out;
}

/** Best-rank statements (preferred if any, otherwise normal); `current` drops ended ones. */
function best(list, { current = false } = {}) {
  let l = list ?? [];
  if (current) l = l.filter((x) => !x.end);
  const pref = l.filter((x) => x.rank === "preferred");
  return pref.length ? pref : l;
}
const uniq = (arr) => [...new Set(arr)];
/** Distinct ru labels of best item values; returns [] if any value lacks a ru label and strict. */
function labelsOf(list, opts = {}) {
  return uniq(
    best(list, opts)
      .map((x) => x.label)
      .filter(Boolean),
  );
}
function itemIds(list, opts) {
  return uniq(best(list, opts).map((x) => x.v));
}

function yearOf(t) {
  const m = /^([+-]?)(\d+)-(\d\d)-(\d\d)/.exec(t ?? "");
  if (!m) return null;
  const y = Number(m[2]);
  return m[1] === "-" ? -y : y;
}
/** A single, year-precise, AD year from time statements, or null if missing/ambiguous. */
function singleYear(list, { minPrec = 9 } = {}) {
  const b = best(list);
  if (!b.length) return null;
  if (b.some((x) => x.prec < minPrec || x.circa)) return null;
  const years = uniq(b.map((x) => yearOf(x.v)));
  if (years.length !== 1 || years[0] == null || years[0] < 1) return null;
  // Julian dates are converted to Gregorian in RDF: early January may belong to the previous year.
  if (b.some((x) => x.julian && x.prec >= 11 && /-01-(0\d|1[0-3])T/.test(x.v))) return null;
  return years[0];
}
function singleQuantity(list, tolerance = 0.01) {
  const vals = best(list)
    .map((x) => x.v)
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min <= 0 || (max - min) / max > tolerance) return null;
  return vals[0];
}

// ───────────────────────────── text helpers ─────────────────────────────

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const fmt = (n, digits = 0) =>
  Number(n)
    .toLocaleString("ru-RU", { maximumFractionDigits: digits })
    .replace(/\u00a0/g, " ");
function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
/** «Title» with inner guillemets turned into „“. */
const q = (s) => `«${s.replace(/«/g, "„").replace(/»/g, "“").replace(/"/g, "")}»`;
// Also rejects catalogue-style person labels ("Померанцев, Александр Никанорович").
const badLabel = (s) =>
  !s || /[()[\]{}]|^Q\d+$|https?:|[\u0590-\u07FF\u0900-\u0DFF\u3000-\u9FFF]|^[А-ЯЁ][а-яё-]+, [А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/.test(s) || s.length > 60;
/** Join sentences into a fact of at most MAX_FACT chars, dropping trailing parts if needed. */
function fact(...parts) {
  const ps = parts.filter(Boolean).map((p) => p.trim().replace(/\.$/, "") + ".");
  for (let n = ps.length; n > 0; n--) {
    const s = ps.slice(0, n).join(" ");
    if (s.length <= MAX_FACT) return s;
  }
  // try single later parts
  return ps.find((p) => p.length <= MAX_FACT) ?? null;
}
const listRu = (arr, max = 3) => arr.slice(0, max).join(", ");
const stripLang = (s) => s.replace(/\s+язык$/i, "");
const isFemale = (sexList) => best(sexList).some((x) => x.v === "Q6581072" || x.v === "Q1052281");

// ───────────────────────────── randomness ─────────────────────────────

function seedOf(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
function rng(seedStr) {
  let a = seedOf(seedStr);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Pick 3 distractor labels from `pool` (array of {label, ...}) excluding `wrong` (labels that are also correct).
 * `dist(c)` = how far the candidate is from the answer (smaller = more plausible); we take 3 at random
 * from the ~8 closest.
 */
function distractors(key, answer, pool, { exclude = [], dist = () => 0, n = 3, window = 8 } = {}) {
  const r = rng(key);
  const bad = new Set([answer, ...exclude].map((s) => s.toLowerCase()));
  const seen = new Set();
  const cands = [];
  for (const c of pool) {
    const l = c.label;
    if (!l || badLabel(l) || bad.has(l.toLowerCase()) || seen.has(l.toLowerCase())) continue;
    seen.add(l.toLowerCase());
    cands.push({ l, d: dist(c) + r() * 0.001 });
  }
  if (cands.length < n) return null;
  cands.sort((a, b) => a.d - b.d);
  const top = cands.slice(0, Math.max(window, n));
  const picked = [];
  while (picked.length < n) picked.push(top.splice(Math.floor(r() * top.length), 1)[0].l);
  return picked;
}
const mcq = (answer, ds) => (ds ? [answer, ...ds] : null);

// ───────────────────────────── shared data sets ─────────────────────────────

const RU_STATES = new Set(["Q159", "Q15180", "Q34266", "Q186096", "Q2184", "Q4459461"]);
// Partially recognised states: skipped to keep the game out of politics.
const DISPUTED = new Set(["Q1246", "Q219060", "Q865", "Q23427", "Q31354", "Q23681", "Q16746854", "Q15966495"]);
// Subjects that ru.json already covers under a different name (Everest = Джомолунгма, …).
const SKIP_IDS = new Set(["Q513"]);
const memo = new Map();
const once = (key, fn) => {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key);
};

const getCountries = () =>
  once("countries", async () => {
    const base = await baseSet(`?s wdt:P31 wd:Q3624078; wikibase:sitelinks ?sl. FILTER NOT EXISTS { ?s wdt:P576 [] }`);
    for (const id of DISPUTED) base.delete(id);
    const ids = [...base.keys()];
    const [cap_, cont, cur, lang, tld, code, area] = [
      await props(ids, "P36", "item"),
      await props(ids, "P30", "item"),
      await props(ids, "P38", "item"),
      await props(ids, "P37", "item"),
      await props(ids, "P78", "item"),
      await props(ids, "P474", "string"),
      await props(ids, "P2046", "quantity"),
    ];
    // labels for TLD items are like ".de"
    for (const c of base.values()) {
      c.capitals = best(cap_.get(c.id), { current: true });
      c.capital = c.capitals.length === 1 && c.capitals[0].label ? c.capitals[0] : null;
      c.continents = itemIds(cont.get(c.id));
      c.currencies = best(cur.get(c.id), { current: true });
      c.languages = best(lang.get(c.id), { current: true }).filter((x) => x.label && !/жестов/.test(x.label));
      c.tlds = labelsOf(tld.get(c.id), { current: true }).filter((l) => /^\.[a-zа-я]{2,3}$/.test(l));
      c.codes = uniq(best(code.get(c.id), { current: true }).map((x) => x.v.replace(/\s/g, "")));
      c.area = singleQuantity(area.get(c.id), 0.05); // m² normalized
    }
    return base;
  });
// Transcontinental countries (Russia, Turkey, Egypt…) only pair with each other, so that
// e.g. Moscow is not offered as a capital in the Middle East.
const sameContinent = (a, b) =>
  a.continents.length === 1 || b.continents.length === 1
    ? a.continents.length === 1 && b.continents.length === 1
      ? a.continents[0] === b.continents[0]
      : false
    : a.continents.some((x) => b.continents.includes(x));
const areaKm2 = (m2) =>
  m2 >= 1e12 ? `${fmt(m2 / 1e12, 1)} млн км²` : m2 >= 1e10 ? `${fmt(Math.round(m2 / 1e9))} тыс. км²` : m2 >= 1e9 ? `${fmt(m2 / 1e9, 1)} тыс. км²` : `${fmt(m2 / 1e6)} км²`;
const softLower = (s) => (/^[А-ЯЁ][а-яё]/.test(s) ? lowerFirst(s) : s);
function countryFacts(c, skip = []) {
  const parts = [];
  if (!skip.includes("capital") && c.capital) parts.push(`Столица — ${c.capital.label}`);
  if (!skip.includes("lang") && c.languages.length && c.languages.length <= 2)
    parts.push(`${c.languages.length > 1 ? "Официальные языки" : "Официальный язык"} — ${c.languages.map((l) => stripLang(l.label)).join(" и ")}`);
  if (!skip.includes("currency") && c.currencies.length === 1 && c.currencies[0].label) parts.push(`Валюта — ${softLower(c.currencies[0].label)}`);
  if (!skip.includes("area") && c.area) parts.push(`Площадь страны — ${areaKm2(c.area)}`);
  return parts;
}

const getCities = () =>
  once("cities", async () => {
    const base = await baseSet(
      `?s wikibase:sitelinks ?sl. hint:Prior hint:rangeSafe true. FILTER(?sl >= 80) ?s wdt:P31/wdt:P279* wd:Q515.`,
    );
    const ids = [...base.keys()];
    const [pop, country, inception, water, elev] = [
      await props(ids, "P1082", "quantity"),
      await props(ids, "P17", "item"),
      await props(ids, "P571", "time"),
      await props(ids, "P206", "item"),
      await props(ids, "P2044", "quantity"),
    ];
    const waterIds = uniq([...water.values()].flat().map((x) => x.v));
    const waterType = await props(waterIds, "P31", "item");
    for (const c of base.values()) {
      c.countries = itemIds(country.get(c.id), { current: true });
      c.year = singleYear(inception.get(c.id));
      c.rivers = best(water.get(c.id))
        .filter((w) => w.label && (waterType.get(w.v) ?? []).some((t) => t.v === "Q4022"))
        .map((w) => w.label.replace(/^река /i, ""));
      c.elev = singleQuantity(elev.get(c.id), 0.1);
      c.pop = Math.max(0, ...best(pop.get(c.id)).map((x) => x.v));
    }
    return base;
  });

const getPeople = () =>
  once("people", async () => {
    const world = await baseSet(
      `?s wikibase:sitelinks ?sl. hint:Prior hint:rangeSafe true. FILTER(?sl >= 100) ?s wdt:P31 wd:Q5.`,
    );
    const russian = await baseSet(
      `VALUES ?c { wd:Q34266 wd:Q15180 wd:Q159 wd:Q186096 } ?s wdt:P27 ?c; wdt:P31 wd:Q5; wikibase:sitelinks ?sl. FILTER(?sl >= 50)`,
    );
    const base = new Map([...world, ...russian]);
    const ids = [...base.keys()];
    const [birth, death, sex, occ, cit, place] = [
      await props(ids, "P569", "time"),
      await props(ids, "P570", "time"),
      await props(ids, "P21", "item"),
      await props(ids, "P106", "item"),
      await props(ids, "P27", "item"),
      await props(ids, "P19", "item"),
    ];
    for (const p of base.values()) {
      p.birth = singleYear(birth.get(p.id));
      p.birthDay = best(birth.get(p.id)).find((x) => x.prec >= 11)?.v;
      p.death = singleYear(death.get(p.id));
      p.deathDay = best(death.get(p.id)).find((x) => x.prec >= 11)?.v;
      p.dead = (death.get(p.id) ?? []).length > 0;
      p.female = isFemale(sex.get(p.id));
      p.occupations = labelsOf(occ.get(p.id));
      p.citizenship = itemIds(cit.get(p.id));
      p.ru = p.citizenship.some((c) => RU_STATES.has(c));
      p.birthPlace = labelsOf(place.get(p.id));
    }
    return base;
  });

/** Birth year + citizenship + sex for creators (authors, painters, directors...). */
async function personInfo(ids) {
  const [birth, cit, sex] = [await props(ids, "P569", "time"), await props(ids, "P27", "item"), await props(ids, "P21", "item")];
  const m = new Map();
  for (const id of ids)
    m.set(id, {
      birth: singleYear(birth.get(id)),
      cit: itemIds(cit.get(id)),
      female: isFemale(sex.get(id)),
    });
  return m;
}
const personDist = (a, b) => Math.abs((a?.birth ?? 1900) - (b?.birth ?? 1900)) + (a?.cit?.some((c) => b?.cit?.includes(c)) ? 0 : 25);

// ───────────────────────────── templates ─────────────────────────────
// Each template returns candidates: { key, sl, ru, bump?, dup: {words, kw}, q: {type, category, text, ...} }

const T = [];
const tpl = (name, capN, run) => T.push({ name, cap: capN, run });

tpl("capital", 90, async () => {
  const cs = [...(await getCountries()).values()];
  const out = [];
  for (const c of cs) {
    if (!c.capital || badLabel(c.label) || badLabel(c.capital.label)) continue;
    const answer = c.capital.label;
    if (answer.toLowerCase().startsWith(c.label.toLowerCase().slice(0, 5))) continue; // Сингапур/Сингапур, Гватемала/Гватемала
    const pool = cs.filter((o) => o !== c && o.capital && sameContinent(o, c)).map((o) => ({ label: o.capital.label, sl: o.sl }));
    const choices = mcq(answer, distractors(`cap-${c.id}`, answer, pool, { dist: (o) => -Math.log(o.sl), window: 15 }));
    const f = fact(...countryFacts(c, ["capital"]));
    if (!choices || !f) continue;
    out.push({
      key: c.id,
      sl: c.sl,
      ru: RU_STATES.has(c.id),
      dup: { words: [c.label], kw: ["столиц"] },
      q: { type: "mcq", category: "География", text: `Какой город является столицей государства ${c.label}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("city-country", 60, async () => {
  const countries = await getCountries();
  const cities = [...(await getCities()).values()];
  const capitalIds = new Set([...countries.values()].flatMap((c) => c.capitals.map((x) => x.v)));
  const labelCount = new Map();
  for (const c of cities) labelCount.set(c.label, (labelCount.get(c.label) ?? 0) + 1);
  const out = [];
  for (const city of cities) {
    if (capitalIds.has(city.id) || badLabel(city.label) || labelCount.get(city.label) > 1 || city.countries.length !== 1) continue;
    if (city.pop < 200000) continue; // sitelinks alone let in bot-generated obscure towns
    const country = countries.get(city.countries[0]);
    // Russian cities would be too easy for this audience ("В какой стране Барнаул?").
    if (!country || badLabel(country.label) || RU_STATES.has(country.id)) continue;
    if (city.label.toLowerCase().includes(country.label.toLowerCase().slice(0, 5))) continue;
    const pool = [...countries.values()].filter((o) => o !== country && sameContinent(o, country));
    const choices = mcq(country.label, distractors(`city-${city.id}`, country.label, pool, { dist: (o) => -Math.log(o.sl), window: 12 }));
    const f = fact(
      city.rivers.length === 1 && `Город стоит на реке ${city.rivers[0]}`,
      city.year && `Год основания — ${city.year}`,
      city.elev && city.elev > 100 && `Высота над уровнем моря — около ${fmt(Math.round(city.elev / 10) * 10)} м`,
    );
    if (!choices || !f) continue;
    out.push({
      key: city.id,
      sl: city.sl,
      ru: false,
      dup: { words: [city.label], kw: ["стран", "находит", "город"] },
      q: { type: "mcq", category: "География", text: `В какой стране находится город ${city.label}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("city-founded", 50, async () => {
  const countries = await getCountries();
  const cities = [...(await getCities()).values()];
  const labelCount = new Map();
  for (const c of cities) labelCount.set(c.label, (labelCount.get(c.label) ?? 0) + 1);
  const out = [];
  for (const city of cities) {
    if (!city.year || city.year < 700 || city.year > 1950 || badLabel(city.label) || labelCount.get(city.label) > 1) continue;
    const country = city.countries.length === 1 ? countries.get(city.countries[0]) : null;
    if (country && country.label === city.label) continue; // city-states (Ватикан, Монако)
    const f = fact(
      city.rivers.length === 1 && `Город стоит на реке ${city.rivers[0]}`,
      country && !RU_STATES.has(country.id) && `Сегодня это город в государстве ${country.label}`,
      city.elev && city.elev > 100 && `Высота над уровнем моря — около ${fmt(Math.round(city.elev / 10) * 10)} м`,
    );
    if (!f) continue;
    out.push({
      key: city.id,
      sl: city.sl,
      ru: city.countries.some((c) => RU_STATES.has(c)),
      dup: { words: [city.label], kw: ["основ"] },
      q: { type: "numeric", category: "История", text: `Какой год считается годом основания города ${city.label}?`, correctValue: city.year, unit: "год", fact: f },
    });
  }
  return out;
});

const GEN_PEAK = { пик: "пика", гора: "горы", вулкан: "вулкана", вершина: "вершины" };
tpl("mountain-height", 40, async () => {
  const base = await baseSet(
    `VALUES ?t { wd:Q8502 wd:Q8072 wd:Q169358 wd:Q207326 wd:Q1595289 } ?s wdt:P31 ?t; wikibase:sitelinks ?sl. FILTER(?sl >= 30)`,
  );
  const ids = [...base.keys()];
  const [elev, country, range, type] = [
    await props(ids, "P2044", "quantity"),
    await props(ids, "P17", "item"),
    await props(ids, "P4552", "item"),
    await props(ids, "P31", "item"),
  ];
  const out = [];
  for (const m of base.values()) {
    if (badLabel(m.label)) continue;
    const h = singleQuantity(elev.get(m.id), 0.005);
    if (!h || h < 500 || h > 9000) continue;
    const volcano = (type.get(m.id) ?? []).some((t) => ["Q8072", "Q169358"].includes(t.v));
    const first = m.label.split(" ")[0].toLowerCase();
    const subject = GEN_PEAK[first] ? `${GEN_PEAK[first]} ${m.label.split(" ").slice(1).join(" ")}` : `${volcano ? "вулкана" : "горы"} ${m.label}`;
    const cs = labelsOf(country.get(m.id), { current: true });
    const rs = labelsOf(range.get(m.id));
    const f = fact(
      cs.length && `${cs.length > 1 ? "Страны" : "Страна"}: ${listRu(cs)}`,
      rs.length === 1 && `Вершина входит в горную систему ${q(rs[0])}`,
    );
    if (!f) continue;
    out.push({
      key: m.id,
      sl: m.sl,
      ru: best(country.get(m.id)).some((x) => RU_STATES.has(x.v)),
      bump: true,
      dup: { words: [m.label], kw: ["высот"] },
      q: { type: "numeric", category: "География", text: `Какова высота ${subject} над уровнем моря в метрах?`, correctValue: Math.round(h), unit: "м", fact: f },
    });
  }
  return out;
});

tpl("river-length", 40, async () => {
  const base = await baseSet(`?s wdt:P31 wd:Q4022; wikibase:sitelinks ?sl. FILTER(?sl >= 40)`);
  const ids = [...base.keys()];
  const [len, mouth, country, basin] = [
    await props(ids, "P2043", "quantity"),
    await props(ids, "P403", "item"),
    await props(ids, "P17", "item"),
    await props(ids, "P2053", "quantity"),
  ];
  const out = [];
  for (const r of base.values()) {
    if (badLabel(r.label)) continue;
    const m = singleQuantity(len.get(r.id), 0.03);
    if (!m || m < 200e3) continue;
    const km = m / 1000;
    const value = km >= 1000 ? Math.round(km / 10) * 10 : Math.round(km);
    const mouths = labelsOf(mouth.get(r.id));
    const cs = labelsOf(country.get(r.id), { current: true });
    const b = singleQuantity(basin.get(r.id), 0.1);
    const f = fact(
      mouths.length === 1 && `Устье — ${mouths[0]}`,
      b && `Площадь бассейна — ${areaKm2(b)}`,
      cs.length && cs.length <= 4 && `Течёт по территории: ${listRu(cs, 4)}`,
    );
    if (!f) continue;
    out.push({
      key: r.id,
      sl: r.sl,
      ru: best(country.get(r.id)).some((x) => RU_STATES.has(x.v)),
      bump: value >= 1000,
      dup: { words: [r.label], kw: ["длин", "протяж"] },
      q: { type: "numeric", category: "География", text: `Какова длина реки ${r.label} в километрах (округлённо)?`, correctValue: value, unit: "км", fact: f },
    });
  }
  return out;
});

tpl("lake-depth", 20, async () => {
  const base = await baseSet(`?s wdt:P31 wd:Q23397; wikibase:sitelinks ?sl. FILTER(?sl >= 35)`);
  const ids = [...base.keys()];
  const [depth, area, country] = [await props(ids, "P4511", "quantity"), await props(ids, "P2046", "quantity"), await props(ids, "P17", "item")];
  const out = [];
  for (const l of base.values()) {
    if (badLabel(l.label)) continue;
    const d = singleQuantity(depth.get(l.id), 0.01);
    if (!d || d < 20) continue;
    const a = singleQuantity(area.get(l.id), 0.05);
    const cs = labelsOf(country.get(l.id), { current: true });
    const f = fact(a && `Площадь озера — ${areaKm2(a)}`, cs.length && cs.length <= 4 && `${cs.length > 1 ? "Страны" : "Страна"}: ${listRu(cs, 4)}`);
    if (!f) continue;
    const text = /озеро/i.test(l.label)
      ? `${l.label}: какова максимальная глубина этого озера в метрах?`
      : `Какова максимальная глубина озера ${l.label} в метрах?`;
    out.push({
      key: l.id,
      sl: l.sl,
      ru: best(country.get(l.id)).some((x) => RU_STATES.has(x.v)),
      bump: d >= 100,
      dup: { words: [l.label], kw: ["глубин"] },
      q: { type: "numeric", category: "География", text, correctValue: Math.round(d), unit: "м", fact: f },
    });
  }
  return out;
});

// Checked in this order: the first group with a matching occupation wins (a statesman who also
// wrote memoirs is History, a painter who also wrote poems is Art).
const OCC_CATEGORY = [
  [/космонавт|астронавт/, "Космос"],
  [/^(политик|государственный деятель|монарх|правитель|император|военачальник|революционер|дипломат|военный деятель|полководец|адвокат|юрист|офицер|монахиня|монах|священник|миссионер|богослов|католический священник)$/, "История"],
  [/композитор|дирижёр|пианист|певец|певица|музыкант|скрипач|автор-исполнитель/, "Музыка"],
  [/художник|живописец|скульптор|архитектор|график/, "Искусство"],
  [/кинорежиссёр|режиссёр|аниматор|мультипликатор/, "Кино и ТВ"],
  [/физик|химик|математик|биолог|астроном|естествоиспытатель|изобретатель|инженер|физиолог|натуралист|ботаник|психолог|врач|географ/, "Наука"],
  [/футболист|хоккеист|боксёр|теннисист|шахматист|спортсмен|гимнаст|баскетболист|легкоатлет|пловец|фигурист|гонщик/, "Спорт"],
  [/писател|поэт|драматург|прозаик|романист|баснописец/, "Литература"],
  [/актёр|актриса/, "Кино и ТВ"],
];
const occRank = (o) => {
  const i = OCC_CATEGORY.findIndex(([re]) => re.test(o));
  return i < 0 ? 99 : i;
};
// Occupation lists are noisy (a physicist who once sat in parliament, a philosopher who composed),
// so the category with the most matching occupations wins; ties and no match go to History.
const personCategory = (p) => {
  const score = {};
  for (const o of p.occupations) {
    const i = occRank(o);
    if (i === 99) continue;
    const cat = OCC_CATEGORY[i][1];
    score[cat] = (score[cat] ?? 0) + (cat === "История" ? 1.5 : 1);
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return "История";
  return ranked[0][0];
};
function exactAge(b, d) {
  const [by, bm, bd] = b.split("T")[0].replace(/^\+/, "").split("-").map(Number);
  const [dy, dm, dd] = d.split("T")[0].replace(/^\+/, "").split("-").map(Number);
  return dy - by - (dm < bm || (dm === bm && dd < bd) ? 1 : 0);
}

tpl("person-birth", 160, async () => {
  const people = [...(await getPeople()).values()];
  const out = [];
  for (const p of people) {
    if (!p.birth || p.birth < 1000 || !p.dead || !p.death || badLabel(p.label) || p.label.split(" ").length > 4) continue;
    const age = p.birthDay && p.deathDay ? exactAge(p.birthDay, p.deathDay) : null;
    if (/Дудаев/.test(p.label) || p.label.includes(",") || p.label.split(" ").length < 2 && !/I|V|X/.test(p.label) && p.sl < 150) continue;
    const occ = [...p.occupations].sort((a, b) => occRank(a) - occRank(b));
    const f = fact(
      age && age > 0 && `${p.female ? "Прожила" : "Прожил"} ${age} ${plural(age, ["год", "года", "лет"])}`,
      p.birthPlace.length === 1 && `Место рождения — ${p.birthPlace[0]}`,
      occ.length && `Род занятий: ${listRu(occ, 3)}`,
    );
    if (!f) continue;
    out.push({
      key: p.id,
      sl: p.sl,
      ru: p.ru,
      dup: { words: [p.label.split(" ").at(-1)], kw: ["родил", "рожд"] },
      q: { type: "numeric", category: personCategory(p), text: `В каком году ${p.female ? "родилась" : "родился"} ${p.label}?`, correctValue: p.birth, unit: "год", fact: f },
    });
  }
  return out;
});

const ATHLETE_OCC = /спортсмен|футболист|хоккеист|теннисист|боксёр|гонщик|атлет|пловец|баскетболист|шахматист|гимнаст|фигурист|лыжник|борец|бегун|бейсболист|гольфист|игрок|конькобежец|биатлонист|волейболист|пилот|велосипедист|прыгун|спринтер|дзюдоист|тяжелоатлет/;
tpl("athlete-sport", 55, async () => {
  const athletes = await baseSet(
    `?s wikibase:sitelinks ?sl. hint:Prior hint:rangeSafe true. FILTER(?sl >= 70) ?s wdt:P31 wd:Q5; wdt:P641 [].`,
  );
  const ids = [...athletes.keys()];
  const [occ, sport, sex, cit, birth] = [
    await props(ids, "P106", "item"),
    await props(ids, "P641", "item"),
    await props(ids, "P21", "item"),
    await props(ids, "P27", "item"),
    await props(ids, "P569", "time"),
  ];
  const all = [];
  for (const a of athletes.values()) {
    const ss = labelsOf(sport.get(a.id));
    if (ss.length !== 1 || badLabel(a.label)) continue;
    // P641 is also set on non-athletes (a president who plays golf): require a sports occupation.
    const occs = labelsOf(occ.get(a.id));
    if (!occs.some((o) => ATHLETE_OCC.test(o))) continue;
    // …and nothing else they are better known for (Niels Bohr played football, Nabokov composed chess problems).
    if (occs.some((o) => !ATHLETE_OCC.test(o) && OCC_CATEGORY.some(([re, cat]) => cat !== "Спорт" && re.test(o)) || /актёр|актриса|писател|политик/.test(o))) continue;
    if (/покер/i.test(ss[0])) continue;
    all.push({ ...a, sport: cap(ss[0]), female: isFemale(sex.get(a.id)), cit: labelsOf(cit.get(a.id), { current: false }), citIds: itemIds(cit.get(a.id)), birth: singleYear(birth.get(a.id)) });
  }
  const sports = [...new Set(all.map((a) => a.sport))].map((label) => ({ label, n: all.filter((a) => a.sport === label).length })).filter((s) => s.n >= 2);
  const perSport = new Map();
  const out = [];
  for (const a of all.sort((x, y) => y.sl - x.sl)) {
    const k = perSport.get(a.sport) ?? 0;
    if (k >= 15) continue; // keep football from taking over
    const choices = mcq(a.sport, distractors(`sport-${a.id}`, a.sport, sports, { dist: (s) => -Math.log(s.n + 1) }));
    const f = fact(a.birth && `${a.female ? "Родилась" : "Родился"} в ${a.birth} году`, a.cit.length === 1 && `Гражданство — ${a.cit[0]}`);
    if (!choices || !f) continue;
    perSport.set(a.sport, k + 1);
    out.push({
      key: a.id,
      sl: a.sl,
      ru: a.citIds.some((c) => RU_STATES.has(c)),
      dup: { words: [a.label.split(" ").at(-1)], kw: ["спорт"] },
      q: { type: "mcq", category: "Спорт", text: `${a.label} — в каком виде спорта ${a.female ? "она прославилась" : "он прославился"}?`, choices, fact: f },
    });
  }
  return out;
});

// Event head nouns → verb agreeing with them (year = start).
const EVENT_VERB = {
  битва: "произошла",
  сражение: "произошло",
  бой: "произошёл",
  побоище: "произошло",
  осада: "началась",
  оборона: "началась",
  блокада: "началась",
  операция: "началась",
  наступление: "началось",
  война: "началась",
  восстание: "вспыхнуло",
  революция: "началась",
  переворот: "произошёл",
  штурм: "произошёл",
  взятие: "произошло",
  мир: "был заключён",
  договор: "был подписан",
  кампания: "началась",
};
tpl("event-year", 110, async () => {
  const base = await baseSet(
    `VALUES ?t { wd:Q178561 wd:Q198 wd:Q645883 wd:Q188055 wd:Q10931 wd:Q124734 wd:Q131569 wd:Q103495 wd:Q1261499 } ?s wdt:P31 ?t; wikibase:sitelinks ?sl. FILTER(?sl >= 25)`,
  );
  const ids = [...base.keys()];
  const [pit, start, end, partOf, loc] = [
    await props(ids, "P585", "time"),
    await props(ids, "P580", "time"),
    await props(ids, "P582", "time"),
    await props(ids, "P361", "item"),
    await props(ids, "P276", "item"),
  ];
  // "Советско-финская война (1939—1940)" and "… (1941—1944)": a bare label would be ambiguous.
  const ambiguous = new Map();
  for (const e of base.values()) {
    const k = e.label.replace(/\s*\(.*\)\s*$/, "").toLowerCase();
    ambiguous.set(k, (ambiguous.get(k) ?? 0) + 1);
  }
  const out = [];
  for (const e of base.values()) {
    if (badLabel(e.label) || /\d/.test(e.label) || ambiguous.get(e.label.toLowerCase()) > 1) continue;
    const words = e.label.split(/\s+/);
    const headIdx = words.findIndex((w) => EVENT_VERB[w.toLowerCase()]);
    if (headIdx < 0) continue;
    const verb = EVENT_VERB[words[headIdx].toLowerCase()];
    const y0 = singleYear(pit.get(e.id)) ?? singleYear(start.get(e.id));
    const y1 = singleYear(end.get(e.id));
    if (!y0 || y0 > 1999) continue;
    if ((pit.get(e.id) ?? []).length === 0 && (start.get(e.id) ?? []).length && !(end.get(e.id) ?? []).length) continue; // ongoing?
    if (/произош/.test(verb) && y1 && y1 !== y0) continue;
    const label = headIdx === 0 ? lowerFirst(e.label) : e.label;
    const parts = labelsOf(partOf.get(e.id)).filter((p) => !badLabel(p) && /^[А-ЯЁ]/.test(p));
    const locs = labelsOf(loc.get(e.id)).filter((p) => !badLabel(p));
    const f = fact(
      y1 && y1 !== y0 && `Завершилось в ${y1} году`.replace("Завершилось", /^(война|революция|осада|оборона|блокада|операция|кампания)$/i.test(words[headIdx]) ? "Завершилась" : /^(наступление|восстание)$/i.test(words[headIdx]) ? "Завершилось" : "Завершился"),
      parts.length === 1 && `Часть событий: ${parts[0]}`,
      locs.length && locs.length <= 2 && `Место — ${locs.join(", ")}`,
    );
    if (!f) continue;
    out.push({
      key: e.id,
      sl: e.sl,
      ru: /русск|россий|советск|москв|петерб|ленингр|сталингр|бородин|полтав|куликов|ледов|курск/i.test(e.label),
      dup: { words: words.filter((w) => !EVENT_VERB[w.toLowerCase()]), kw: ["год"] },
      q: { type: "numeric", category: "История", text: `В каком году ${verb} ${label}?`, correctValue: y0, unit: "год", fact: f },
    });
  }
  return out;
});

// Literary works: noun (nominative, accusative, participle ending for "опубликован…").
const WORK_KIND = {
  Q8261: ["роман", "роман", ""],
  Q149537: ["повесть", "повесть", "а"],
  Q49084: ["рассказ", "рассказ", ""],
  Q25379: ["пьеса", "пьесу", "а"],
  Q80930: ["трагедия", "трагедию", "а"],
  Q40831: ["комедия", "комедию", "а"],
  Q37484: ["поэма", "поэму", "а"],
  Q699: ["сказка", "сказку", "а"],
  Q1371849: ["сказка", "сказку", "а"],
  Q5185279: ["стихотворение", "стихотворение", "о"],
};
const getBooks = () =>
  once("books", async () => {
    const base = await baseSetUnion(["Q7725634", "Q8261", "Q47461344", "Q49084", "Q25379", "Q571", "Q149537", "Q37484", "Q5185279"], 20);
    const ids = [...base.keys()];
    const [author, pub, genre, type, lang, form] = [
      await props(ids, "P50", "item"),
      await props(ids, "P577", "time"),
      await props(ids, "P136", "item"),
      await props(ids, "P31", "item"),
      await props(ids, "P407", "item"),
      await props(ids, "P7937", "item"),
    ];
    const authorIds = uniq([...author.values()].flat().map((x) => x.v));
    const info = await personInfo(authorIds);
    const books = [];
    for (const b of base.values()) {
      const as = best(author.get(b.id));
      if (as.length !== 1 || !as[0].label || badLabel(b.label) || badLabel(as[0].label)) continue;
      // Form of the work: P7937 ("form of creative work") first, then P31; P136 (genre) only for
      // prose forms — "tragedy" as a genre would turn «Отверженные» into a play.
      const kinds = [
        ...itemIds(form.get(b.id)),
        ...itemIds(type.get(b.id)),
        ...itemIds(genre.get(b.id)).filter((k) => ["Q8261", "Q149537", "Q49084", "Q699", "Q1371849"].includes(k)),
      ].filter((k) => WORK_KIND[k]);
      if (!kinds.length) continue; // non-fiction, scripture, essays…: hard to phrase and to pick distractors for
      const kind = WORK_KIND[kinds[0]];
      const surname = as[0].label.split(" ").at(-1);
      if (b.label.includes(surname) || /Рухнама|Майн кампф/i.test(b.label)) continue;
      if (!info.get(as[0].v)?.birth || info.get(as[0].v).birth < 1300) continue; // ancient authorship is often disputed
      books.push({
        ...b,
        author: as[0].label,
        authorId: as[0].v,
        info: info.get(as[0].v),
        year: singleYear(pub.get(b.id)),
        kind,
        lang: uniq(labelsOf(lang.get(b.id)).map((l) => stripLang(l.replace(/^.*вариант (\S+)ого языка$/, "$1ий")))),
      });
    }
    return books;
  });
const ruWork = (b) => b.info?.cit?.some((c) => RU_STATES.has(c));

tpl("book-author", 120, async () => {
  const books = await getBooks();
  const authors = new Map();
  for (const b of books) authors.set(b.authorId, { label: b.author, info: b.info });
  const labelCount = new Map();
  for (const b of books) labelCount.set(b.label, (labelCount.get(b.label) ?? 0) + 1);
  const out = [];
  for (const b of books) {
    if (labelCount.get(b.label) > 1) continue;
    const choices = mcq(b.author, distractors(`book-${b.id}`, b.author, [...authors.values()], { dist: (a) => personDist(a.info, b.info) }));
    const f = fact(
      b.year && `Впервые опубликован${b.kind[2]} в ${b.year} году`,
      b.lang.length === 1 && b.lang[0] !== "русский" && `Язык оригинала — ${b.lang[0]}`,
    );
    if (!choices || !f) continue;
    out.push({
      key: b.id,
      sl: b.sl,
      ru: ruWork(b),
      dup: { words: [b.label], kw: ["написал", "автор"] },
      q: { type: "mcq", category: "Литература", text: `Кто написал ${b.kind[1]} ${q(b.label)}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("book-year", 60, async () => {
  const books = await getBooks();
  const out = [];
  for (const b of books) {
    if (!b.year || b.year < 1000 || b.year > THIS_YEAR) continue;
    const f = fact(`Автор — ${b.author}`, b.lang.length === 1 && b.lang[0] !== "русский" && `Язык оригинала — ${b.lang[0]}`);
    out.push({
      key: b.id,
      sl: b.sl,
      ru: ruWork(b),
      dup: { words: [b.label], kw: ["году", "опубликов", "издан", "вышел"] },
      q: {
        type: "numeric",
        category: "Литература",
        text: `В каком году впервые опубликован${b.kind[2]} ${b.kind[0]} ${q(b.label)} (автор — ${b.author})?`,
        correctValue: b.year,
        unit: "год",
        fact: f,
      },
    });
  }
  return out;
});

const getPaintings = () =>
  once("paintings", async () => {
    const base = await baseSet(`?s wdt:P31 wd:Q3305213; wikibase:sitelinks ?sl. FILTER(?sl >= 15)`);
    const ids = [...base.keys()];
    const [creator, inception, coll] = [await props(ids, "P170", "item"), await props(ids, "P571", "time"), await props(ids, "P195", "item")];
    const creatorIds = uniq([...creator.values()].flat().map((x) => x.v));
    const info = await personInfo(creatorIds);
    const labelCount = new Map();
    for (const p of base.values()) labelCount.set(p.label, (labelCount.get(p.label) ?? 0) + 1);
    const res = [];
    for (const p of base.values()) {
      const cs = best(creator.get(p.id));
      if (cs.length !== 1 || !cs[0].label || badLabel(cs[0].label) || badLabel(p.label) || labelCount.get(p.label) > 1) continue;
      if (/неизвестн|мастер /i.test(cs[0].label) || p.label.includes(cs[0].label.split(" ").at(-1))) continue;
      const colls = labelsOf(coll.get(p.id), { current: true }).filter((c) => !badLabel(c));
      res.push({ ...p, author: cs[0].label, authorId: cs[0].v, info: info.get(cs[0].v), year: singleYear(inception.get(p.id)), coll: colls.length === 1 ? colls[0] : null });
    }
    return res;
  });

tpl("painting-author", 100, async () => {
  const ps = await getPaintings();
  const painters = new Map(ps.map((p) => [p.authorId, { label: p.author, info: p.info }]));
  const out = [];
  for (const p of ps) {
    const choices = mcq(p.author, distractors(`paint-${p.id}`, p.author, [...painters.values()], { dist: (a) => personDist(a.info, p.info) }));
    const f = fact(p.year && `Картина написана в ${p.year} году`, p.coll && `Хранится в собрании: ${p.coll}`);
    if (!choices || !f) continue;
    out.push({
      key: p.id,
      sl: p.sl,
      ru: p.info?.cit?.some((c) => RU_STATES.has(c)),
      dup: { words: [p.label], kw: ["написал", "картин", "автор"] },
      q: { type: "mcq", category: "Искусство", text: `Кто автор картины ${q(p.label)}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("painting-year", 40, async () => {
  const ps = await getPaintings();
  const out = [];
  for (const p of ps) {
    if (!p.year || p.year < 1300) continue;
    const f = fact(p.coll && `Хранится в собрании: ${p.coll}`);
    if (!f) continue;
    out.push({
      key: p.id,
      sl: p.sl,
      ru: p.info?.cit?.some((c) => RU_STATES.has(c)),
      dup: { words: [p.label], kw: ["году", "написал"] },
      q: { type: "numeric", category: "Искусство", text: `В каком году ${p.author} ${p.info?.female ? "написала" : "написал"} картину ${q(p.label)}?`, correctValue: p.year, unit: "год", fact: f },
    });
  }
  return out;
});

// Rebuilt buildings where Wikidata's single architect is not the one people know.
const REBUILT = /^(Большой театр|Храм Христа Спасителя|Зимний дворец)$/;
tpl("architect", 45, async () => {
  const base = await baseSet(`?s wdt:P84 []; wikibase:sitelinks ?sl. FILTER(?sl >= 35)`);
  const ids = [...base.keys()];
  const [arch, inception, opening, place, country] = [
    await props(ids, "P84", "item"),
    await props(ids, "P571", "time"),
    await props(ids, "P1619", "time"),
    await props(ids, "P131", "item"),
    await props(ids, "P17", "item"),
  ];
  const archIds = uniq([...arch.values()].flat().map((x) => x.v));
  const info = await personInfo(archIds);
  const archOcc = await props(archIds, "P106", "item");
  const isArchitect = (id) => labelsOf(archOcc.get(id)).some((o) => /архитектор|инженер/.test(o));
  const all = [];
  for (const b of base.values()) {
    const as = best(arch.get(b.id));
    if (as.length !== 1 || !as[0].label || badLabel(as[0].label) || badLabel(b.label)) continue;
    if (/^(Статуя|Памятник|Монумент|Скульптура)/i.test(b.label) || REBUILT.test(b.label)) continue; // P84 there is usually the engineer, not the author
    if (!info.get(as[0].v)?.birth || !isArchitect(as[0].v)) continue; // firms, or presidents who "designed" their estate
    if (b.label.includes(as[0].label.split(" ").at(-1))) continue;
    all.push({ ...b, arch: as[0].label, archId: as[0].v, info: info.get(as[0].v), year: singleYear(opening.get(b.id)) ?? singleYear(inception.get(b.id)), place: labelsOf(place.get(b.id), { current: true }), countryIds: itemIds(country.get(b.id)) });
  }
  const archs = new Map(all.map((b) => [b.archId, { label: b.arch, info: b.info }]));
  const out = [];
  for (const b of all) {
    const choices = mcq(b.arch, distractors(`arch-${b.id}`, b.arch, [...archs.values()], { dist: (a) => personDist(a.info, b.info) }));
    const f = fact(b.year && b.year >= 1500 && `Построено в ${b.year} году`, b.place.length === 1 && `Местоположение — ${b.place[0]}`);
    if (!choices || !f) continue;
    out.push({
      key: b.id,
      sl: b.sl,
      ru: b.countryIds.some((c) => RU_STATES.has(c)),
      dup: { words: [b.label], kw: ["архитект", "спроект", "построил"] },
      q: { type: "mcq", category: "Искусство", text: `Кто архитектор сооружения ${q(b.label)}?`, choices, fact: f },
    });
  }
  return out;
});

// Stage works: [kind nominative, "who wrote" phrase, genitive for "premiere of"]
const STAGE = {
  Q1344: ["опера", (t) => `Кто написал оперу ${t}?`, "оперы"],
  Q41425: ["балет", (t) => `Кто написал музыку к балету ${t}?`, "балета"],
  Q2743: ["мюзикл", (t) => `Кто написал музыку мюзикла ${t}?`, "мюзикла"],
};
const getStageWorks = () =>
  once("stage", async () => {
    // Operas/ballets are "dramatico-musical work" (Q58483083) with the genre in P136.
    const base = await baseSet(`VALUES ?g { wd:Q1344 wd:Q41425 wd:Q2743 } ?s wdt:P31 wd:Q58483083; wdt:P136 ?g; wikibase:sitelinks ?sl. FILTER(?sl >= 12)`);
    const ids = [...base.keys()];
    const [comp, premiere, libr, type, basedOn] = [
      await props(ids, "P86", "item"),
      await props(ids, "P1191", "time"),
      await props(ids, "P87", "item"),
      await props(ids, "P136", "item"),
      await props(ids, "P144", "item"),
    ];
    const compIds = uniq([...comp.values()].flat().map((x) => x.v));
    const info = await personInfo(compIds);
    const labelCount = new Map();
    for (const w of base.values()) labelCount.set(w.label, (labelCount.get(w.label) ?? 0) + 1);
    const res = [];
    for (const w of base.values()) {
      const cs = best(comp.get(w.id));
      const kind = itemIds(type.get(w.id)).find((t) => STAGE[t]);
      if (!kind || cs.length !== 1 || !cs[0].label || badLabel(cs[0].label) || badLabel(w.label) || labelCount.get(w.label) > 1) continue;
      if (w.label.includes(cs[0].label.split(" ").at(-1))) continue;
      const ls = labelsOf(libr.get(w.id));
      const bs = labelsOf(basedOn.get(w.id)).filter((x) => !badLabel(x) && /^[A-ZА-ЯЁ«]/.test(x) && x !== w.label);
      res.push({ ...w, kind: STAGE[kind], composer: cs[0].label, compId: cs[0].v, info: info.get(cs[0].v), year: singleYear(premiere.get(w.id)), librettist: ls.length === 1 && ls[0] !== cs[0].label ? ls[0] : null, basedOn: bs.length === 1 ? bs[0] : null });
    }
    return res;
  });

tpl("stage-composer", 70, async () => {
  const ws = await getStageWorks();
  const comps = new Map(ws.map((w) => [w.compId, { label: w.composer, info: w.info }]));
  const out = [];
  for (const w of ws) {
    const choices = mcq(w.composer, distractors(`stage-${w.id}`, w.composer, [...comps.values()], { dist: (a) => personDist(a.info, w.info) }));
    const f = fact(w.year && `Премьера состоялась в ${w.year} году`, w.basedOn && `В основе сюжета — ${q(w.basedOn)}`, w.librettist && `Либретто — ${w.librettist}`);
    if (!choices || !f) continue;
    out.push({
      key: w.id,
      sl: w.sl,
      ru: w.info?.cit?.some((c) => RU_STATES.has(c)),
      dup: { words: [w.label], kw: ["написал", "композит", "музык"] },
      q: { type: "mcq", category: "Музыка", text: w.kind[1](q(w.label)), choices, fact: f },
    });
  }
  return out;
});

tpl("stage-premiere", 30, async () => {
  const ws = await getStageWorks();
  const out = [];
  for (const w of ws) {
    if (!w.year || w.year < 1600 || w.year > THIS_YEAR) continue;
    const f = fact(`Композитор — ${w.composer}`, w.librettist && `Либретто — ${w.librettist}`, w.basedOn && `В основе сюжета — ${q(w.basedOn)}`);
    out.push({
      key: w.id,
      sl: w.sl,
      ru: w.info?.cit?.some((c) => RU_STATES.has(c)),
      dup: { words: [w.label], kw: ["премьер", "году"] },
      q: { type: "numeric", category: "Музыка", text: `В каком году состоялась премьера ${w.kind[2]} ${q(w.label)}?`, correctValue: w.year, unit: "год", fact: f },
    });
  }
  return out;
});

tpl("album-artist", 60, async () => {
  const base = await baseSet(`?s wdt:P31 wd:Q482994; wikibase:sitelinks ?sl. FILTER(?sl >= 35)`);
  const ids = [...base.keys()];
  const [perf, date, genre] = [await props(ids, "P175", "item"), await props(ids, "P577", "time"), await props(ids, "P136", "item")];
  const labelCount = new Map();
  for (const a of base.values()) labelCount.set(a.label.toLowerCase(), (labelCount.get(a.label.toLowerCase()) ?? 0) + 1);
  const all = [];
  for (const a of base.values()) {
    const ps = best(perf.get(a.id));
    if (ps.length !== 1 || !ps[0].label || badLabel(ps[0].label) || badLabel(a.label) || labelCount.get(a.label.toLowerCase()) > 1) continue;
    if (a.label.toLowerCase().includes(ps[0].label.toLowerCase()) || ps[0].label.toLowerCase().includes(a.label.toLowerCase())) continue; // self-titled
    all.push({ ...a, artist: ps[0].label, artistId: ps[0].v, year: singleYear(date.get(a.id)), genres: labelsOf(genre.get(a.id)) });
  }
  const artists = new Map();
  for (const a of all) if (!artists.has(a.artistId)) artists.set(a.artistId, { label: a.artist, year: a.year, genres: a.genres });
  const out = [];
  for (const a of all) {
    const choices = mcq(
      a.artist,
      distractors(`album-${a.id}`, a.artist, [...artists.values()], {
        dist: (o) => Math.abs((o.year ?? 1990) - (a.year ?? 1990)) + (o.genres.some((g) => a.genres.includes(g)) ? 0 : 15),
      }),
    );
    const f = fact(a.year && `Альбом вышел в ${a.year} году`, a.genres.length && `Жанр — ${listRu(a.genres, 2)}`);
    if (!choices || !f) continue;
    out.push({
      key: a.id,
      sl: a.sl,
      ru: false,
      dup: { words: [a.label], kw: ["альбом"] },
      q: { type: "mcq", category: "Музыка", text: `Чей альбом называется ${q(a.label)}?`, choices, fact: f },
    });
  }
  return out;
});

const getFilms = () =>
  once("films", async () => {
    const base = await baseSet(`VALUES ?t { wd:Q11424 wd:Q202866 } ?s wdt:P31 ?t; wikibase:sitelinks ?sl. FILTER(?sl >= 40)`);
    const ids = [...base.keys()];
    const [dir, date, composer, country, type, duration] = [
      await props(ids, "P57", "item"),
      await props(ids, "P577", "time"),
      await props(ids, "P86", "item"),
      await props(ids, "P495", "item"),
      await props(ids, "P31", "item"),
      await props(ids, "P2047", "quantity"),
    ];
    const dirIds = uniq([...dir.values()].flat().map((x) => x.v));
    const info = await personInfo(dirIds);
    const res = [];
    for (const f of base.values()) {
      const ds = best(dir.get(f.id));
      if (ds.length !== 1 || !ds[0].label || badLabel(ds[0].label) || badLabel(f.label)) continue;
      // earliest release year
      const years = best(date.get(f.id))
        .filter((x) => x.prec >= 9)
        .map((x) => yearOf(x.v))
        .filter(Boolean);
      if (!years.length) continue;
      const comps = labelsOf(composer.get(f.id));
      const mins = singleQuantity(duration.get(f.id), 0.15);
      res.push({
        ...f,
        director: ds[0].label,
        dirId: ds[0].v,
        info: info.get(ds[0].v),
        year: Math.min(...years),
        composer: comps.length === 1 && comps[0] !== ds[0].label ? comps[0] : null,
        countries: labelsOf(country.get(f.id)),
        ru: itemIds(country.get(f.id)).some((c) => RU_STATES.has(c)),
        animated: itemIds(type.get(f.id)).includes("Q202866"),
        minutes: mins && mins > 40 && mins < 300 ? Math.round(mins / 60) : null, // normalized to seconds
      });
    }
    return res;
  });

tpl("film-director", 100, async () => {
  const films = await getFilms();
  const dirs = new Map();
  for (const f of films) {
    const d = dirs.get(f.dirId) ?? { label: f.director, years: [], countries: f.countries };
    d.years.push(f.year);
    dirs.set(f.dirId, d);
  }
  const out = [];
  for (const f of films) {
    const choices = mcq(
      f.director,
      distractors(`film-${f.id}`, f.director, [...dirs.values()], {
        dist: (d) => Math.min(...d.years.map((y) => Math.abs(y - f.year))) + (d.countries.some((c) => f.countries.includes(c)) ? 0 : 12),
      }),
    );
    const ff = fact(f.composer && `Композитор фильма — ${f.composer}`, f.countries.length && f.countries.length <= 3 && `Страна производства — ${listRu(f.countries)}`, f.minutes && `Хронометраж — ${f.minutes} мин`);
    if (!choices || !ff) continue;
    out.push({
      key: f.id,
      sl: f.sl,
      ru: f.ru,
      dup: { words: [f.label], kw: ["режисс", "снял"] },
      q: { type: "mcq", category: "Кино и ТВ", text: `Кто режиссёр ${f.animated ? "мультфильма" : "фильма"} ${q(f.label)} (${f.year})?`, choices, fact: ff },
    });
  }
  return out;
});

tpl("film-year", 60, async () => {
  const films = await getFilms();
  const out = [];
  for (const f of films) {
    if (f.year < 1895 || f.year > THIS_YEAR) continue;
    const ff = fact(f.composer && `Композитор фильма — ${f.composer}`, f.countries.length && f.countries.length <= 3 && `Страна производства — ${listRu(f.countries)}`, f.minutes && `Хронометраж — ${f.minutes} мин`);
    if (!ff) continue;
    out.push({
      key: f.id,
      sl: f.sl,
      ru: f.ru,
      dup: { words: [f.label], kw: ["году", "вышел"] },
      q: { type: "numeric", category: "Кино и ТВ", text: `В каком году ${f.director} ${f.info?.female ? "сняла" : "снял"} ${f.animated ? "мультфильм" : "фильм"} ${q(f.label)}?`, correctValue: f.year, unit: "год", fact: ff },
    });
  }
  return out;
});

tpl("series-year", 40, async () => {
  const base = await baseSet(`?s wdt:P31 wd:Q5398426; wikibase:sitelinks ?sl. FILTER(?sl >= 40)`);
  const ids = [...base.keys()];
  const [start, end, seasons, episodes, country] = [
    await props(ids, "P580", "time"),
    await props(ids, "P582", "time"),
    await props(ids, "P2437", "quantity"),
    await props(ids, "P1113", "quantity"),
    await props(ids, "P495", "item"),
  ];
  const out = [];
  for (const s of base.values()) {
    const y0 = singleYear(start.get(s.id));
    const y1 = singleYear(end.get(s.id));
    if (!y0 || !y1 || y1 > THIS_YEAR - 1 || badLabel(s.label)) continue;
    const ns = singleQuantity(seasons.get(s.id), 0);
    const ne = singleQuantity(episodes.get(s.id), 0);
    const cs = labelsOf(country.get(s.id));
    const f = fact(
      ns && ne && `Всего ${fmt(ns)} ${plural(ns, ["сезон", "сезона", "сезонов"])} и ${fmt(ne)} ${plural(ne, ["серия", "серии", "серий"])}`,
      y1 !== y0 && `Последний сезон вышел в ${y1} году`,
      cs.length && cs.length <= 2 && `Страна — ${cs.join(", ")}`,
    );
    if (!f) continue;
    out.push({
      key: s.id,
      sl: s.sl,
      ru: itemIds(country.get(s.id)).some((c) => RU_STATES.has(c)),
      dup: { words: [s.label], kw: ["сериал"] },
      q: { type: "numeric", category: "Кино и ТВ", text: `В каком году вышел первый сезон сериала ${q(s.label)}?`, correctValue: y0, unit: "год", fact: f },
    });
  }
  return out;
});

const getElements = () =>
  once("elements", async () => {
    const base = await baseSet(`?s wdt:P31 wd:Q11344; wikibase:sitelinks ?sl.`);
    const ids = [...base.keys()];
    const [sym, num, disc, date, mass] = [
      await props(ids, "P246", "string"),
      await props(ids, "P1086", "quantity"),
      await props(ids, "P61", "item"),
      await props(ids, "P575", "time"),
      await props(ids, "P2067", "quantity"),
    ];
    const res = [];
    for (const e of base.values()) {
      const s = uniq(best(sym.get(e.id)).map((x) => x.v));
      const n = singleQuantity(num.get(e.id), 0);
      if (s.length !== 1 || !n || n > 118 || badLabel(e.label)) continue;
      const ds = best(disc.get(e.id));
      res.push({
        ...e,
        name: cap(e.label),
        symbol: s[0],
        z: n,
        discoverers: ds.every((x) => x.label) ? ds.map((x) => x.label) : [],
        year: singleYear(date.get(e.id)),
        mass: singleQuantity(mass.get(e.id), 0.01),
      });
    }
    return res;
  });
const elementFact = (e, skip = []) =>
  fact(
    !skip.includes("disc") && e.discoverers.length && e.discoverers.length <= 2 && `${e.discoverers.length > 1 ? "Первооткрыватели" : "Первооткрыватель"} — ${e.discoverers.join(" и ")}`,
    !skip.includes("year") && e.year && `Открыт в ${e.year} году`,
    !skip.includes("z") && `Порядковый номер — ${e.z}`,
  );

tpl("element-symbol", 60, async () => {
  const els = (await getElements()).filter((e) => e.z <= 100);
  const out = [];
  for (const e of els) {
    // Alternate direction: symbol → name for odd Z, name → symbol for even Z.
    const symbolToName = e.z % 2 === 1;
    const pool = els.map((o) => ({ label: symbolToName ? o.name : o.symbol, symbol: o.symbol, z: o.z }));
    const answer = symbolToName ? e.name : e.symbol;
    const choices = mcq(
      answer,
      distractors(`el-${e.id}`, answer, pool, { dist: (o) => (o.symbol[0] === e.symbol[0] ? 0 : 50) + Math.abs(o.z - e.z) / 10, window: 5 }),
    );
    const f = elementFact(e);
    if (!choices || !f) continue;
    out.push({
      key: e.id,
      sl: e.sl,
      ru: false,
      dup: { words: symbolToName ? [e.symbol] : [e.label], kw: ["символ", "обознач"] },
      q: {
        type: "mcq",
        category: "Наука",
        text: symbolToName ? `Какой химический элемент обозначается символом ${e.symbol}?` : `${e.name} — каким символом обозначается этот химический элемент?`,
        choices,
        fact: f,
      },
    });
  }
  return out;
});

tpl("element-number", 40, async () => {
  const els = await getElements();
  return els.map((e) => ({
    key: e.id,
    sl: e.sl,
    ru: false,
    dup: { words: [e.label], kw: ["номер"] },
    q: {
      type: "numeric",
      category: "Наука",
      text: `${e.name} — какой порядковый номер у этого элемента в таблице Менделеева?`,
      correctValue: e.z,
      fact: elementFact(e, ["z"]) ?? fact(`Химический символ — ${e.symbol}`),
    },
  }));
});

tpl("element-discoverer", 20, async () => {
  const els = await getElements();
  const pool = els.filter((e) => e.discoverers.length === 1).map((e) => ({ label: e.discoverers[0], year: e.year }));
  const out = [];
  for (const e of els) {
    // Before ~1800 priority disputes are common (oxygen: Scheele / Priestley / Lavoisier).
    if (e.discoverers.length !== 1 || !e.year || e.year < 1800 || e.year > 1950) continue;
    const choices = mcq(e.discoverers[0], distractors(`eldisc-${e.id}`, e.discoverers[0], pool, { dist: (o) => Math.abs((o.year ?? 1800) - e.year) }));
    const f = fact(`Открыт в ${e.year} году`, `Химический символ — ${e.symbol}`, `Порядковый номер — ${e.z}`);
    if (!choices) continue;
    out.push({
      key: e.id,
      sl: e.sl,
      ru: false,
      dup: { words: [e.label], kw: ["открыл"] },
      q: { type: "mcq", category: "Наука", text: `${e.name} — кто открыл этот химический элемент?`, choices, fact: f },
    });
  }
  return out;
});

const PLANETS = { Q111: ["Марс", "Марса"], Q319: ["Юпитер", "Юпитера"], Q193: ["Сатурн", "Сатурна"], Q324: ["Уран", "Урана"], Q332: ["Нептун", "Нептуна"], Q339: ["Плутон", "Плутона"] };
tpl("moon-planet", 35, async () => {
  // Moons are typed very specifically ("regular moon of Saturn"…), so select by parent body instead.
  const base = await baseSet(
    `VALUES ?p { ${Object.keys(PLANETS).map((x) => `wd:${x}`).join(" ")} } ?s wdt:P397 ?p; wdt:P575 []; wikibase:sitelinks ?sl. FILTER(?sl >= 25)`,
  );
  const ids = [...base.keys()];
  const [parent, disc, date] = [await props(ids, "P397", "item"), await props(ids, "P61", "item"), await props(ids, "P575", "time")];
  const out = [];
  for (const m of base.values()) {
    const ps = itemIds(parent.get(m.id));
    if (ps.length !== 1 || !PLANETS[ps[0]] || ps[0] === "Q339" || badLabel(m.label)) continue; // Pluto is not a planet
    const planet = PLANETS[ps[0]][0];
    const ds = labelsOf(disc.get(m.id));
    const y = singleYear(date.get(m.id));
    const pool = Object.entries(PLANETS).filter(([id]) => id !== "Q339").map(([, [label]]) => ({ label }));
    const choices = mcq(planet, distractors(`moon-${m.id}`, planet, pool));
    const f = fact(y && `Открыт в ${y} году`, ds.length && ds.length <= 2 && `${ds.length > 1 ? "Первооткрыватели" : "Первооткрыватель"} — ${ds.join(" и ")}`);
    if (!choices || !f) continue;
    out.push({
      key: m.id,
      sl: m.sl,
      ru: false,
      dup: { words: [m.label], kw: ["спутник"] },
      q: { type: "mcq", category: "Космос", text: `Спутником какой планеты является ${m.label}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("space-discovery", 30, async () => {
  const base = await baseSet(
    `VALUES ?p { wd:Q525 ${Object.keys(PLANETS).map((x) => `wd:${x}`).join(" ")} } ?s wdt:P397 ?p; wdt:P575 []; wikibase:sitelinks ?sl. FILTER(?sl >= 40)`,
  );
  const ids = [...base.keys()];
  const [type, parent, disc, date] = [await props(ids, "P31", "item"), await props(ids, "P397", "item"), await props(ids, "P61", "item"), await props(ids, "P575", "time")];
  const out = [];
  for (const o of base.values()) {
    const y = singleYear(date.get(o.id));
    if (!y || y < 1600 || badLabel(o.label)) continue;
    const ts = labelsOf(type.get(o.id)).join(" ").toLowerCase();
    const ps = itemIds(parent.get(o.id));
    let subject;
    if (ps.length === 1 && PLANETS[ps[0]]) subject = `был открыт спутник ${PLANETS[ps[0]][1]} ${o.label}`;
    else if (ps[0] !== "Q525" || /комет|гипотет/.test(ts) || /Девятая планета/.test(o.label)) continue;
    else if (/карликов/.test(ts)) subject = `была открыта карликовая планета ${o.label}`;
    else if (/планета/.test(ts) && !/малая/.test(ts)) subject = `была открыта планета ${o.label}`;
    else if (/астероид|малая планета/.test(ts)) subject = `был открыт астероид ${o.label}`;
    else continue;
    const ds = labelsOf(disc.get(o.id));
    const f = fact(ds.length && ds.length <= 2 && `${ds.length > 1 ? "Первооткрыватели" : "Первооткрыватель"} — ${ds.join(" и ")}`);
    if (!f) continue;
    out.push({
      key: o.id,
      sl: o.sl,
      ru: false,
      dup: { words: [o.label], kw: ["откры"] },
      q: { type: "numeric", category: "Космос", text: `В каком году ${subject}?`, correctValue: y, unit: "год", fact: f },
    });
  }
  return out;
});

tpl("star-constellation", 50, async () => {
  const base = await baseSet(
    `?s wikibase:sitelinks ?sl. hint:Prior hint:rangeSafe true. FILTER(?sl >= 30) ?s wdt:P59 ?c. FILTER NOT EXISTS { ?s wdt:P31 wd:Q8928 }`,
  );
  const ids = [...base.keys()];
  const [con, dist, mag, type] = [await props(ids, "P59", "item"), await props(ids, "P2583", "quantity"), await props(ids, "P1215", "quantity"), await props(ids, "P31", "item")];
  const all = [];
  for (const s of base.values()) {
    const cs = labelsOf(con.get(s.id));
    if (cs.length !== 1 || badLabel(s.label) || s.label.toLowerCase().includes(cs[0].toLowerCase().slice(0, 5))) continue;
    if (/^(M|NGC|IC|HD|HIP|HR|Gliese|Глизе|GJ|SN|PSR|Kepler|TRAPPIST)[ -]?\d/i.test(s.label)) continue; // catalogue numbers
    if (labelsOf(type.get(s.id)).some((t) => /сверхскоплен|скопление галактик|созвезди/.test(t))) continue;
    if (/^[a-zа-я]/.test(s.label)) s.label = cap(s.label); // «бета Пегаса» → «Бета Пегаса»
    all.push({ ...s, con: cs[0], types: labelsOf(type.get(s.id)), ly: singleQuantity(dist.get(s.id), 0.2), mag: singleQuantity(mag.get(s.id), 0.2) });
  }
  const pool = uniq(all.map((s) => s.con)).map((label) => ({ label }));
  const out = [];
  for (const s of all) {
    const choices = mcq(s.con, distractors(`star-${s.id}`, s.con, pool));
    // P2583 is normalized to metres; 1 ly = 9.4607e15 m
    const ly = s.ly ? s.ly / 9.4607e15 : null;
    const f = fact(
      s.types.length === 1 && `Тип объекта — ${s.types[0]}`,
      ly && ly > 1 && `Расстояние от Земли — около ${ly >= 1e6 ? `${fmt(Math.round(ly / 1e6))} млн` : fmt(ly >= 1000 ? Math.round(ly / 100) * 100 : Math.round(ly))} св. лет`,
    );
    if (!choices || !f) continue;
    out.push({
      key: s.id,
      sl: s.sl,
      ru: false,
      dup: { words: [s.label], kw: ["созвезд"] },
      q: { type: "mcq", category: "Космос", text: `В каком созвездии находится ${s.label}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("spacecraft-launch", 50, async () => {
  const base = await baseSet(`?s wdt:P619 []; wikibase:sitelinks ?sl. FILTER(?sl >= 25)`);
  const ids = [...base.keys()];
  const [launch, vehicle, operator, site] = [await props(ids, "P619", "time"), await props(ids, "P375", "item"), await props(ids, "P137", "item"), await props(ids, "P448", "item")];
  const out = [];
  for (const s of base.values()) {
    const y = singleYear(launch.get(s.id));
    if (!y || y > THIS_YEAR || badLabel(s.label)) continue;
    const vs = labelsOf(vehicle.get(s.id));
    const os = labelsOf(operator.get(s.id));
    const ss = labelsOf(site.get(s.id));
    const f = fact(vs.length === 1 && `Ракета-носитель — ${vs[0]}`, ss.length === 1 && `Место старта — ${ss[0]}`, os.length && os.length <= 2 && `Оператор — ${os.join(", ")}`);
    if (!f) continue;
    out.push({
      key: s.id,
      sl: s.sl,
      ru: os.some((o) => /СССР|Роскосмос|советск|ОКБ/i.test(o)) || ss.some((x) => /Байконур|Плесецк|Восточный/.test(x)),
      dup: { words: [s.label], kw: ["запуст", "запуск", "полет", "полёт"] },
      q: { type: "numeric", category: "Космос", text: `В каком году состоялся запуск космического аппарата ${q(s.label)}?`, correctValue: y, unit: "год", fact: f },
    });
  }
  // Keep series like Союз-1…Союз-40 from flooding the template: at most 2 per series.
  const perSeries = new Map();
  return out
    .sort((a, b) => b.sl * (b.ru ? 2.5 : 1) - a.sl * (a.ru ? 2.5 : 1))
    .filter((c) => {
      const series = c.q.text.match(/«(.*)»/)[1].replace(/[\s-]*[A-ZА-ЯЁ]*-?\d+[A-ZА-ЯЁa-zа-яё]*$/, "");
      const n = perSeries.get(series) ?? 0;
      perSeries.set(series, n + 1);
      return n < 2;
    });
});

// Animals: groups we query by traversing down from a taxon (keeps queries small).
const ANIMAL_GROUPS = [
  ["Q7377", "Млекопитающие", 50],
  ["Q5113", "Птицы", 45],
  ["Q10908", "Земноводные", 25],
  ["Q25371", "Рыбы", 25], // Chondrichthyes
  ["Q127282", "Рыбы", 35], // Actinopterygii
  ["Q1062226", "Пресмыкающиеся", 30], // Squamata
  ["Q223044", "Пресмыкающиеся", 25], // Testudines
  ["Q25363", "Пресмыкающиеся", 25], // Crocodilia
  ["Q1358", "Паукообразные", 25],
];
const getAnimals = () =>
  once("animals", async () => {
    const all = new Map();
    for (const [taxon, group, minSl] of ANIMAL_GROUPS) {
      let base;
      try {
        base = await baseSet(`?s wdt:P171+ wd:${taxon}. ?s wdt:P105 wd:Q7432; wikibase:sitelinks ?sl. FILTER(?sl >= ${minSl})`);
      } catch (e) {
        console.warn(`  animals ${taxon}: ${e.message.split("\n")[0]}`);
        continue;
      }
      for (const a of base.values()) if (!all.has(a.id)) all.set(a.id, { ...a, group });
    }
    const ids = [...all.keys()];
    const ranks = [];
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      ranks.push(
        ...(await sparql(`SELECT ?s ?anc ?rank ?al WHERE {
  hint:Query hint:optimizer "None".
  VALUES ?s { ${chunk.map((x) => `wd:${x}`).join(" ")} }
  ?s wdt:P171+ ?anc. ?anc wdt:P105 ?rank. FILTER(?rank IN (wd:Q36602, wd:Q35409))
  ?anc rdfs:label ?al. FILTER(lang(?al) = "ru")
}`)),
      );
    }
    const iucn = await props(ids, "P141", "item");
    for (const a of all.values()) {
      const mine = ranks.filter((r) => r.s === a.id);
      a.orders = uniq(mine.filter((r) => r.rank === "Q36602").map((r) => cap(r.al)));
      a.families = uniq(mine.filter((r) => r.rank === "Q35409").map((r) => cap(r.al)));
      a.iucn = labelsOf(iucn.get(a.id));
      a.label = cap(a.label);
    }
    return [...all.values()];
  });
const animalFact = (a, skip) =>
  fact(!skip.includes("family") && a.families.length === 1 && `Семейство — ${a.families[0]}`, a.iucn.length === 1 && `Охранный статус: ${a.iucn[0]}`);

tpl("animal-order", 100, async () => {
  const animals = (await getAnimals()).filter((a) => a.group === "Млекопитающие" || a.group === "Птицы");
  const out = [];
  for (const a of animals) {
    if (a.orders.length !== 1 || badLabel(a.label) || /[a-z]/i.test(a.orders[0])) continue;
    const pool = animals.filter((o) => o.group === a.group && o.orders.length === 1).map((o) => ({ label: o.orders[0] }));
    const choices = mcq(a.orders[0], distractors(`order-${a.id}`, a.orders[0], pool, { window: 12 }));
    const f = animalFact(a, []);
    if (!choices || !f) continue;
    out.push({
      key: a.id,
      sl: a.sl,
      ru: false,
      dup: { words: [a.label], kw: ["отряд"] },
      q: { type: "mcq", category: "Природа", text: `К какому отряду относится ${lowerFirst(a.label)}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("animal-class", 60, async () => {
  const animals = (await getAnimals()).filter((a) => a.group !== "Млекопитающие" && a.group !== "Птицы");
  const groups = ["Млекопитающие", "Птицы", "Пресмыкающиеся", "Земноводные", "Рыбы", "Паукообразные", "Насекомые"].map((label) => ({ label }));
  const out = [];
  for (const a of animals) {
    if (badLabel(a.label)) continue;
    const choices = mcq(a.group, distractors(`class-${a.id}`, a.group, groups.slice(0, 5)));
    const f = animalFact(a, []);
    if (!choices || !f) continue;
    out.push({
      key: a.id,
      sl: a.sl,
      ru: false,
      dup: { words: [a.label], kw: ["класс", "относ"] },
      q: { type: "mcq", category: "Природа", text: `К какой группе животных относится ${lowerFirst(a.label)}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("olympics", 56, async () => {
  // Editions point to the Games series via P3450 ("sports season of league or competition").
  const base = await baseSet(`VALUES ?t { wd:Q159821 wd:Q82414 } ?s wdt:P3450 ?t; wikibase:sitelinks ?sl.`);
  const ids = [...base.keys()];
  const [type, loc, start, part, country] = [
    await props(ids, "P3450", "item"),
    await props(ids, "P276", "item"),
    await props(ids, "P580", "time"),
    await props(ids, "P1132", "quantity"),
    await props(ids, "P17", "item"),
  ];
  // How many times each city hosted, counted over all editions (including ones skipped below).
  const hosted = new Map();
  for (const g of base.values())
    for (const c of labelsOf(loc.get(g.id))) {
      const k = `${itemIds(type.get(g.id)).includes("Q159821")}|${c}`;
      hosted.set(k, (hosted.get(k) ?? 0) + 1);
    }
  const games = [];
  for (const g of base.values()) {
    const summer = itemIds(type.get(g.id)).includes("Q159821");
    if (/юношеск|паралимп/i.test(g.label)) continue;
    const year = singleYear(start.get(g.id)) ?? Number(/\b(1[89]\d\d|20\d\d)\b/.exec(g.label)?.[1]);
    const cities = labelsOf(loc.get(g.id));
    if (!year || year > THIS_YEAR || cities.length !== 1 || badLabel(cities[0]) || /парк|стадион|олимпийск|курорт/i.test(cities[0])) continue;
    // P1132 holds both the number of countries and of athletes; the larger one is athletes.
    const ns = best(part.get(g.id)).map((x) => x.v);
    const n = ns.length && Math.max(...ns) > 250 ? Math.max(...ns) : null;
    if (!n) continue; // cancelled Games (1916, 1940, 1944) have no participants
    games.push({ ...g, summer, year, city: cities[0], n, countries: labelsOf(country.get(g.id)) });
  }
  const out = [];
  for (const g of games) {
    const season = g.summer ? "летние" : "зимние";
    const same = games.filter((o) => o.summer === g.summer);
    const pool = same.map((o) => ({ label: o.city, year: o.year }));
    const choices = mcq(g.city, distractors(`oly-${g.id}`, g.city, pool, { dist: (o) => Math.abs(o.year - g.year) }));
    const f = fact(g.n && `В Играх участвовали ${fmt(g.n)} ${plural(g.n, ["спортсмен", "спортсмена", "спортсменов"])}`, g.countries.length === 1 && `Страна-хозяйка — ${g.countries[0]}`);
    // One question per Games: "which year did X host" (only for one-time hosts, every other edition)
    // or "which city hosted in year Y" — asking both would give each other away.
    const asYear = hosted.get(`${g.summer}|${g.city}`) === 1 && g.year % 8 === 0;
    if (choices && f && !asYear)
      out.push({
        key: `${g.id}-city`,
        sl: g.sl,
        ru: g.countries.some((c) => /Россия|СССР/.test(c)),
        dup: { words: [String(g.year)], kw: ["олимп"] },
        q: { type: "mcq", category: "Спорт", text: `В каком городе прошли ${season} Олимпийские игры ${g.year} года?`, choices, fact: f },
      });
    if (asYear && f)
      out.push({
        key: `${g.id}-year`,
        sl: g.sl,
        ru: g.countries.some((c) => /Россия|СССР/.test(c)),
        dup: { words: [g.city], kw: ["олимп"] },
        q: {
          type: "numeric",
          category: "Спорт",
          text: `В каком году город ${g.city} принимал ${season} Олимпийские игры?`,
          correctValue: g.year,
          unit: "год",
          fact: f,
        },
      });
  }
  return out;
});

tpl("football-cups", 50, async () => {
  const base = await baseSet(`VALUES ?c { wd:Q19317 wd:Q260858 } ?s wdt:P3450 ?c; wikibase:sitelinks ?sl.`);
  const ids = [...base.keys()];
  const [comp, host, winner, start] = [await props(ids, "P3450", "item"), await props(ids, "P17", "item"), await props(ids, "P1346", "item"), await props(ids, "P580", "time")];
  const eds = [];
  for (const e of base.values()) {
    const world = itemIds(comp.get(e.id)).includes("Q19317");
    const year = singleYear(start.get(e.id)) ?? Number(/\b(19\d\d|20\d\d)\b/.exec(e.label)?.[1]);
    if (!year || year > THIS_YEAR) continue;
    const hosts = labelsOf(host.get(e.id));
    const winners = labelsOf(winner.get(e.id)).map((w) => w.replace(/^сборная /i, "").replace(/ по футболу$/i, "").trim());
    eds.push({ ...e, world, year, host: hosts.length === 1 ? hosts[0] : null, winner: winners.length === 1 ? winners[0] : null });
  }
  const out = [];
  const name = (w) => (w ? "чемпионат мира по футболу" : "чемпионат Европы по футболу");
  for (const e of eds) {
    const same = eds.filter((o) => o.world === e.world);
    if (e.host) {
      const pool = same.filter((o) => o.host).map((o) => ({ label: o.host, year: o.year }));
      const choices = mcq(e.host, distractors(`cup-host-${e.id}`, e.host, pool, { dist: (o) => Math.abs(o.year - e.year) }));
      const f = fact(e.winner && `Победителем турнира стала сборная ${e.winner}`);
      if (choices && f)
        out.push({ key: `${e.id}-host`, sl: e.sl, ru: e.host === "Россия", dup: { words: [String(e.year)], kw: ["чемпионат", "принима"] }, q: { type: "mcq", category: "Спорт", text: `Какая страна принимала ${name(e.world)} ${e.year} года?`, choices, fact: f } });
    }
    if (e.winner) {
      const pool = same.filter((o) => o.winner).map((o) => ({ label: o.winner, year: o.year }));
      const extra = ["Англии", "Нидерландов", "Португалии", "Хорватии", "Бельгии", "Швеции"].map((label) => ({ label, year: e.year + 40 }));
      const choices = mcq(cap(e.winner), distractors(`cup-win-${e.id}`, cap(e.winner), [...pool, ...extra].map((o) => ({ ...o, label: cap(o.label) })), { dist: (o) => Math.abs(o.year - e.year) }));
      const f = fact(e.host && `Турнир проходил в стране ${e.host}`);
      if (choices && f)
        out.push({ key: `${e.id}-win`, sl: e.sl, ru: false, dup: { words: [String(e.year)], kw: ["чемпион", "выиграл", "победил"] }, q: { type: "mcq", category: "Спорт", text: `Сборная какой страны выиграла ${name(e.world)} ${e.year} года?`, choices, fact: f } });
    }
  }
  return out;
});

// Names shared by many clubs in different cities.
const GENERIC_CLUBS = /^(Динамо|Спартак|Локомотив|Торпедо|Унион|Арсенал|Шахтёр|Металлист|Олимпик|Расинг|Атлетико|Спортинг|Насьональ|Индепендьенте|Униан)$/;
tpl("club-city", 60, async () => {
  const bigCities = await getCities();
  const base = await baseSet(`?s wdt:P31 wd:Q476028; wikibase:sitelinks ?sl. FILTER(?sl >= 50)`);
  const clubLabels = new Map();
  for (const c of base.values()) clubLabels.set(c.label, (clubLabels.get(c.label) ?? 0) + 1);
  const ids = [...base.keys()];
  const [hq, loc, country, inception] = [await props(ids, "P159", "item"), await props(ids, "P131", "item"), await props(ids, "P17", "item"), await props(ids, "P571", "time")];
  const all = [];
  for (const c of base.values()) {
    // Only well-known cities (the shared city set): a suburb like Cornellà would confuse players.
    const cityIds = [...itemIds(hq.get(c.id), { current: true }), ...itemIds(loc.get(c.id), { current: true })].filter((x) => bigCities.has(x));
    if (uniq(cityIds).length !== 1 || badLabel(c.label) || clubLabels.get(c.label) > 1 || GENERIC_CLUBS.test(c.label)) continue;
    const city = bigCities.get(cityIds[0]).label;
    if (badLabel(city)) continue;
    if (c.label.toLowerCase().includes(city.toLowerCase().slice(0, Math.max(4, city.length - 2)))) continue;
    all.push({ ...c, city, countries: itemIds(country.get(c.id)), countryLabels: labelsOf(country.get(c.id)), year: singleYear(inception.get(c.id)) });
  }
  const out = [];
  for (const c of all) {
    const pool = all.filter((o) => o.city !== c.city).map((o) => ({ label: o.city, same: o.countries.some((x) => c.countries.includes(x)) }));
    const choices = mcq(c.city, distractors(`club-${c.id}`, c.city, pool, { dist: (o) => (o.same ? 0 : 10) }));
    const f = fact(c.year && `Клуб основан в ${c.year} году`, c.countryLabels.length === 1 && `Страна — ${c.countryLabels[0]}`);
    if (!choices || !f) continue;
    out.push({
      key: c.id,
      sl: c.sl,
      ru: c.countries.some((x) => RU_STATES.has(x)),
      dup: { words: [c.label], kw: ["клуб"] },
      q: { type: "mcq", category: "Спорт", text: `В каком городе базируется футбольный клуб ${q(c.label)}?`, choices, fact: f },
    });
  }
  return out;
});

const FOOD_INDUSTRY = /напит|пищев|продовольств|ресторан|кондитер|пив|кофе|еда|питани|фастфуд|быстрого/i;
const getCompanies = () =>
  once("companies", async () => {
    const base = await baseSet(
      `?s wikibase:sitelinks ?sl. hint:Prior hint:rangeSafe true. FILTER(?sl >= 50) VALUES ?t { wd:Q4830453 wd:Q6881511 wd:Q891723 wd:Q783794 wd:Q1589009 } ?s wdt:P31 ?t.`,
    );
    const ids = [...base.keys()];
    const [founders, inception, hq, industry, country] = [
      await props(ids, "P112", "item"),
      await props(ids, "P571", "time"),
      await props(ids, "P159", "item"),
      await props(ids, "P452", "item"),
      await props(ids, "P17", "item"),
    ];
    const founderIds = uniq([...founders.values()].flat().map((x) => x.v));
    const finfo = await personInfo(founderIds);
    const res = [];
    for (const c of base.values()) {
      if (badLabel(c.label)) continue;
      const fs = best(founders.get(c.id)).filter((x) => finfo.get(x.v)?.birth); // humans only
      const inds = labelsOf(industry.get(c.id));
      res.push({
        ...c,
        founders: fs.every((x) => x.label) ? uniq(fs.map((x) => x.label)) : [],
        founderBirth: fs.length ? finfo.get(fs[0].v)?.birth : null,
        year: singleYear(inception.get(c.id)),
        hq: labelsOf(hq.get(c.id), { current: true }),
        industries: inds,
        ru: itemIds(country.get(c.id)).some((x) => RU_STATES.has(x)),
        category: inds.some((i) => FOOD_INDUSTRY.test(i)) ? "Еда" : "Технологии",
      });
    }
    return res;
  });

tpl("company-founder", 50, async () => {
  const cs = await getCompanies();
  const pool = cs.flatMap((c) => c.founders.map((label) => ({ label, birth: c.founderBirth })));
  const out = [];
  for (const c of cs) {
    if (!c.founders.length || c.founders.length > 4) continue;
    if (c.founders.some((f) => c.label.includes(f.split(" ").at(-1)))) continue; // "Ford" founded by Ford
    const answer = c.founders[0];
    const choices = mcq(answer, distractors(`founder-${c.id}`, answer, pool, { exclude: c.founders, dist: (o) => Math.abs((o.birth ?? 1900) - (c.founderBirth ?? 1900)) }));
    const f = fact(c.year && `Компания основана в ${c.year} году`, c.hq.length === 1 && `Штаб-квартира — ${c.hq[0]}`, c.founders.length > 1 && `Всего основателей: ${c.founders.length}`);
    if (!choices || !f) continue;
    out.push({
      key: c.id,
      sl: c.sl,
      ru: c.ru,
      dup: { words: [c.label], kw: ["основ"] },
      q: { type: "mcq", category: c.category, text: c.founders.length > 1 ? `Кто из этих людей был среди основателей компании ${q(c.label)}?` : `Кто основал компанию ${q(c.label)}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("company-year", 60, async () => {
  const cs = await getCompanies();
  const out = [];
  for (const c of cs) {
    if (!c.year || c.year < 1600 || c.year > 2015) continue;
    const f = fact(c.founders.length && c.founders.length <= 2 && `${c.founders.length > 1 ? "Основатели" : "Основатель"} — ${c.founders.join(" и ")}`, c.hq.length === 1 && `Штаб-квартира — ${c.hq[0]}`, c.industries.length && `Отрасль: ${listRu(c.industries, 2)}`);
    if (!f) continue;
    out.push({
      key: c.id,
      sl: c.sl,
      ru: c.ru,
      dup: { words: [c.label], kw: ["основ", "году"] },
      q: { type: "numeric", category: c.category, text: `В каком году основана компания ${q(c.label)}?`, correctValue: c.year, unit: "год", fact: f },
    });
  }
  return out;
});

const getLangs = () =>
  once("proglangs", async () => {
    const base = await baseSet(`?s wdt:P31 wd:Q9143; wikibase:sitelinks ?sl. FILTER(?sl >= 25)`);
    const ids = [...base.keys()];
    const [designer, inception, influenced] = [await props(ids, "P287", "item"), await props(ids, "P571", "time"), await props(ids, "P737", "item")];
    const designerIds = uniq([...designer.values()].flat().map((x) => x.v));
    const info = await personInfo(designerIds);
    return [...base.values()]
      .filter((l) => !badLabel(l.label))
      .map((l) => {
        const ds = best(designer.get(l.id)).filter((x) => info.get(x.v)?.birth);
        return { ...l, designers: ds.every((x) => x.label) ? uniq(ds.map((x) => x.label)) : [], year: singleYear(inception.get(l.id)), influences: labelsOf(influenced.get(l.id)).filter((x) => !badLabel(x)) };
      });
  });

tpl("proglang-author", 15, async () => {
  const ls = await getLangs();
  const pool = ls.flatMap((l) => l.designers.map((label) => ({ label, year: l.year })));
  const out = [];
  for (const l of ls) {
    if (l.designers.length !== 1) continue;
    const choices = mcq(l.designers[0], distractors(`pl-${l.id}`, l.designers[0], pool, { dist: (o) => Math.abs((o.year ?? 1990) - (l.year ?? 1990)) }));
    const f = fact(l.year && `Язык появился в ${l.year} году`, l.influences.length && `Создан под влиянием: ${listRu(l.influences, 3)}`);
    if (!choices || !f) continue;
    out.push({ key: l.id, sl: l.sl, ru: false, dup: { words: [l.label], kw: ["создал", "автор", "программир"] }, q: { type: "mcq", category: "Технологии", text: `Кто создал язык программирования ${l.label}?`, choices, fact: f } });
  }
  return out;
});

tpl("proglang-year", 38, async () => {
  const ls = await getLangs();
  const out = [];
  for (const l of ls) {
    if (!l.year || l.year < 1940 || l.year > THIS_YEAR) continue;
    const f = fact(l.designers.length && l.designers.length <= 2 && `${l.designers.length > 1 ? "Авторы" : "Автор"} — ${l.designers.join(" и ")}`, l.influences.length && `Создан под влиянием: ${listRu(l.influences, 3)}`);
    if (!f) continue;
    out.push({ key: l.id, sl: l.sl, ru: false, dup: { words: [l.label], kw: ["появил", "создан", "году"] }, q: { type: "numeric", category: "Технологии", text: `В каком году появился язык программирования ${l.label}?`, correctValue: l.year, unit: "год", fact: f } });
  }
  return out;
});

tpl("official-language", 88, async () => {
  const cs = [...(await getCountries()).values()];
  const perLang = new Map();
  const out = [];
  const langCount = new Map();
  for (const c of cs) for (const l of c.languages) langCount.set(cap(stripLang(l.label)), (langCount.get(cap(stripLang(l.label))) ?? 0) + 1);
  for (const c of cs.sort((a, b) => b.sl - a.sl)) {
    if (!c.languages.length || c.languages.length > 2 || badLabel(c.label)) continue;
    // With two official languages ask about the more widespread one (Jamaica: English, not Patois).
    const mine = c.languages.map((l) => cap(stripLang(l.label))).sort((a, b) => (langCount.get(b) ?? 0) - (langCount.get(a) ?? 0));
    const answer = mine[0];
    const k = perLang.get(answer) ?? 0;
    if (k >= 6) continue;
    const pool = cs.filter((o) => o !== c && sameContinent(o, c)).flatMap((o) => o.languages.map((l) => ({ label: cap(stripLang(l.label)) })));
    const choices = mcq(answer, distractors(`lang-${c.id}`, answer, pool, { exclude: mine, window: 8, dist: (o) => -(langCount.get(o.label) ?? 0) }));
    const f = fact(...countryFacts(c, ["lang", "area"]));
    if (!choices || !f) continue;
    perLang.set(answer, k + 1);
    out.push({
      key: c.id,
      sl: c.sl,
      ru: RU_STATES.has(c.id),
      dup: { words: [c.label], kw: ["язык"] },
      q: { type: "mcq", category: "Язык", text: `Какой язык является официальным в государстве ${c.label}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("language-script", 48, async () => {
  const base = await baseSet(`?s wdt:P31 wd:Q1288568; wdt:P282 []; wikibase:sitelinks ?sl. FILTER(?sl >= 80)`);
  const ids = [...base.keys()];
  const [script, country, parent] = [await props(ids, "P282", "item"), await props(ids, "P17", "item"), await props(ids, "P279", "item")];
  const all = [];
  for (const l of base.values()) {
    const ss = labelsOf(script.get(l.id)).filter((x) => !/брайл/i.test(x)); // Braille is listed for many languages
    if (ss.length !== 1 || !/язык$/.test(l.label) || badLabel(ss[0])) continue;
    all.push({ ...l, script: cap(ss[0]), countries: labelsOf(country.get(l.id)), parents: labelsOf(parent.get(l.id)).filter((p) => /языки$/.test(p)) });
  }
  // Only scripts shared by several languages: "армянский язык → армянский алфавит" would be a giveaway.
  const pool = uniq(all.map((l) => l.script))
    .map((label) => ({ label, n: all.filter((l) => l.script === label).length }))
    .filter((p) => p.n >= 2);
  const shared = new Set(pool.map((p) => p.label));
  const out = [];
  for (const l of all.filter((x) => shared.has(x.script))) {
    const choices = mcq(l.script, distractors(`script-${l.id}`, l.script, pool, { dist: (o) => -o.n }));
    const f = fact(l.parents.length === 1 && `Входит в группу: ${l.parents[0]}`, l.countries.length && l.countries.length <= 3 && `На нём говорят в стране: ${listRu(l.countries)}`.replace("в стране:", l.countries.length > 1 ? "в странах:" : "в стране:"));
    if (!choices || !f) continue;
    out.push({ key: l.id, sl: l.sl, ru: false, dup: { words: [l.label], kw: ["письм", "алфавит"] }, q: { type: "mcq", category: "Язык", text: `Какую письменность использует ${lowerFirst(l.label)}?`, choices, fact: f } });
  }
  return out;
});

// Cuisine adjectives that don't start like the country name.
const CUISINE_STEMS = { Q183: ["нем"], Q30: ["амер"], Q145: ["брит", "англ", "шотл", "валл"], Q159: ["рус"], Q55: ["нидерл", "голл"], Q794: ["перс"], Q29: ["испан"], Q28: ["венг"], Q36: ["польс"] };
const FOOD_KIND = { Q10943: ["сыра", "Сыр"], Q40050: ["напитка", "Напиток"], Q746549: ["блюда", "Блюдо"], Q2095: ["блюда", "Блюдо"], Q1056831: ["блюда", "Блюдо"] };
tpl("food-origin", 110, async () => {
  const countries = await getCountries();
  const base = await baseSetUnion(["Q746549", "Q10943", "Q2095", "Q1056831", "Q40050", "Q19861951"], 20, "?s wdt:P495 [].");
  const ids = [...base.keys()];
  const [origin, type, ingr, mat, cuisine] = [
    await props(ids, "P495", "item"),
    await props(ids, "P31", "item"),
    await props(ids, "P527", "item"),
    await props(ids, "P186", "item"),
    await props(ids, "P2012", "item"),
  ];
  const all = [];
  for (const d of base.values()) {
    const os = itemIds(origin.get(d.id));
    if (os.length !== 1 || !countries.get(os[0]) || badLabel(d.label)) continue;
    const country = countries.get(os[0]);
    if (d.label.toLowerCase().includes(country.label.toLowerCase().slice(0, 5))) continue;
    const kind = FOOD_KIND[itemIds(type.get(d.id)).find((t) => FOOD_KIND[t])] ?? FOOD_KIND.Q746549;
    const ingredients = uniq([...labelsOf(ingr.get(d.id)), ...labelsOf(mat.get(d.id))].map((x) => lowerFirst(x))).filter((x) => !badLabel(x) && !/[a-z]/i.test(x) && x !== d.label.toLowerCase());
    // P495 on dishes is noisy (симит → Египет): if the dish names a national cuisine, it must match the country.
    const cuisines = labelsOf(cuisine.get(d.id)).filter((c) => /кухня/.test(c));
    const stems = [country.label.slice(0, 3).toLowerCase(), ...(CUISINE_STEMS[country.id] ?? [])];
    if (cuisines.length && !cuisines.some((c) => stems.some((st) => c.toLowerCase().startsWith(st)))) continue;
    const types = labelsOf(type.get(d.id)).filter((t) => !/^(блюдо|пища|еда|тип блюда|продукт|напиток|сыр|ингредиент)/i.test(t));
    all.push({ ...d, label: cap(d.label), country, kind, ingredients, types });
  }
  const out = [];
  for (const d of all) {
    const pool = [...countries.values()].filter((c) => all.some((o) => o.country === c) && c !== d.country);
    const choices = mcq(d.country.label, distractors(`food-${d.id}`, d.country.label, pool, { dist: (c) => (sameContinent(c, d.country) ? 0 : 5) - c.sl / 100, window: 10 }));
    const f = fact(d.ingredients.length && `Основные ингредиенты: ${listRu(d.ingredients, 4)}`, d.types.length === 1 && `${d.kind[1]} относится к категории: ${d.types[0]}`);
    if (!choices || !f) continue;
    out.push({
      key: d.id,
      sl: d.sl,
      ru: RU_STATES.has(d.country.id),
      dup: { words: [d.label], kw: ["стран", "родин", "кухн"] },
      q: { type: "mcq", category: "Еда", text: `Какая страна считается родиной ${d.kind[0]} ${q(d.label)}?`, choices, fact: f },
    });
  }
  return out;
});

tpl("currency", 50, async () => {
  const cs = [...(await getCountries()).values()];
  const perCur = new Map();
  const out = [];
  for (const c of cs.sort((a, b) => b.sl - a.sl)) {
    if (c.currencies.length !== 1 || !c.currencies[0].label || badLabel(c.label)) continue;
    const answer = cap(c.currencies[0].label);
    const k = perCur.get(answer) ?? 0;
    if (k >= 3) continue;
    const pool = cs.filter((o) => o !== c && o.currencies.length === 1 && o.currencies[0].label && sameContinent(o, c)).map((o) => ({ label: cap(o.currencies[0].label) }));
    const choices = mcq(answer, distractors(`cur-${c.id}`, answer, pool, { window: 12 }));
    const f = fact(...countryFacts(c, ["currency", "area"]));
    if (!choices || !f) continue;
    perCur.set(answer, k + 1);
    out.push({ key: c.id, sl: c.sl, ru: RU_STATES.has(c.id), dup: { words: [c.label], kw: ["валют"] }, q: { type: "mcq", category: "Разное", text: `Какая валюта официально используется в государстве ${c.label}?`, choices, fact: f } });
  }
  return out;
});

tpl("country-codes", 70, async () => {
  const cs = [...(await getCountries()).values()];
  const codeCount = new Map();
  for (const c of cs) for (const code of c.codes) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  const out = [];
  for (const c of cs) {
    if (badLabel(c.label)) continue;
    const pool = cs.filter((o) => o !== c && sameContinent(o, c));
    if (c.tlds.length === 1) {
      const choices = mcq(c.label, distractors(`tld-${c.id}`, c.label, pool, { dist: (o) => -o.sl / 50 }));
      const f = fact(...countryFacts(c, ["area"]));
      if (choices && f) out.push({ key: `${c.id}-tld`, sl: c.sl, ru: RU_STATES.has(c.id), dup: { words: [c.tlds[0]], kw: ["домен"] }, q: { type: "mcq", category: "Разное", text: `Какой стране принадлежит национальный интернет-домен ${c.tlds[0]}?`, choices, fact: f } });
    }
    const codes = c.codes.filter((x) => /^\+\d{1,3}$/.test(x) && codeCount.get(x) === 1);
    if (codes.length === 1 && c.codes.length === 1) {
      const choices = mcq(c.label, distractors(`tel-${c.id}`, c.label, pool, { dist: (o) => -o.sl / 50 }));
      const f = fact(c.tlds.length === 1 && `Национальный интернет-домен — ${c.tlds[0]}`, ...countryFacts(c, ["area", "currency"]));
      if (choices && f) out.push({ key: `${c.id}-tel`, sl: c.sl * 0.8, ru: RU_STATES.has(c.id), dup: { words: [codes[0].slice(1)], kw: ["телефон"] }, q: { type: "mcq", category: "Разное", text: `Какой стране принадлежит международный телефонный код ${codes[0]}?`, choices, fact: f } });
    }
  }
  return out;
});

// ───────────────────────────── pipeline ─────────────────────────────

// Every other bank in content/questions (hand-written ru.json and the adapted ones): generated questions
// must not repeat them, since the validator requires unique texts across all files.
const ruBank = readdirSync(BANK_DIR)
  .filter((f) => f.endsWith(".json") && join(BANK_DIR, f) !== OUT)
  .flatMap((f) => JSON.parse(readFileSync(join(BANK_DIR, f), "utf8")));
const norm = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}.+]+/gu, " ");
const ruTexts = ruBank.map((x) => ` ${norm(x.text)} `);
const stem = (w) => {
  const n = norm(w).trim();
  return n.length >= 5 ? n.slice(0, n.length - 2) : n;
};
/** True if some hand-written question mentions all subject words and one of the keywords. */
// «Titles» quoted in hand-written questions: a generated question about the same work would either
// repeat it or give its answer away ("В каком году Тарковский снял «Сталкер»?" vs "Кто снял «Сталкер»?").
const titlesOf = (text) => [...text.matchAll(/«([^»]+)»/g)].map((m) => norm(m[1]).trim());
const ruTitles = new Set(ruBank.flatMap((x) => titlesOf(x.text)));
function inRuBank(dup, text) {
  if (titlesOf(text).some((t) => ruTitles.has(t))) return true;
  const all = dup.words.flatMap((w) => norm(w).split(/\s+/)).filter(Boolean);
  const long = all.filter((w) => w.length >= 3 || /\d/.test(w));
  const words = (long.length ? long : all).map(stem);
  if (!words.length) return false;
  const kws = dup.kw.map((k) => norm(k).trim());
  return ruTexts.some((t) => words.every((w) => t.includes(w)) && kws.some((k) => t.includes(k)));
}

function assignDifficulty(items) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  sorted.forEach((it, i) => {
    const p = i / sorted.length;
    let d = p < 0.35 ? 1 : p < 0.8 ? 2 : 3;
    if (it.bump) d = Math.min(3, d + 1);
    it.q.difficulty = d;
  });
}

function check(q) {
  if (!q.text.endsWith("?")) return "no ?";
  if (!q.fact || q.fact.length > MAX_FACT) return "fact";
  if (q.type === "mcq") {
    if (q.choices.length !== 4 || new Set(q.choices.map((c) => c.toLowerCase())).size !== 4) return "choices";
    if (q.choices.some((c) => q.text.toLowerCase().includes(c.toLowerCase()) && c.length > 3)) return "answer in text";
  } else if (!Number.isInteger(q.correctValue) || q.correctValue < 0) return "value";
  return null;
}

// Pairs of templates about the same subjects where one question's text reveals the other's answer
// (a year question names the author; a director question shows the release year).
const EXCLUDE_FROM = {
  "book-year": ["book-author"],
  "film-year": ["film-director"],
  "painting-year": ["painting-author"],
  "stage-premiere": ["stage-composer"],
  "space-discovery": ["moon-planet"],
};
const usedKeys = new Map();
const results = [];
const texts = new Set(ruBank.map((x) => norm(x.text)));
const stats = [];
for (const t of T) {
  if (ONLY.length && !ONLY.includes(t.name)) continue;
  process.stdout.write(`${t.name}… `);
  let cands;
  try {
    cands = await t.run();
  } catch (e) {
    console.log(`FAILED: ${e.message.split("\n")[0]}`);
    stats.push({ name: t.name, candidates: 0, kept: 0, error: e.message.split("\n")[0] });
    continue;
  }
  let dropped = { dup: 0, check: 0 };
  const seenKeys = new Set();
  const ok = [];
  for (const c of cands) {
    if (seenKeys.has(c.key) || SKIP_IDS.has(c.key.split("-")[0])) continue;
    seenKeys.add(c.key);
    const err = check(c.q);
    if (err) {
      dropped.check++;
      continue;
    }
    if (inRuBank(c.dup, c.q.text) || texts.has(norm(c.q.text)) || EXCLUDE_FROM[t.name]?.some((n) => usedKeys.get(n)?.has(c.key))) {
      dropped.dup++;
      continue;
    }
    c.score = c.sl * (c.ru ? 2.5 : 1);
    ok.push(c);
  }
  ok.sort((a, b) => b.score - a.score);
  const kept = ok.slice(0, t.cap);
  for (const c of kept) texts.add(norm(c.q.text));
  assignDifficulty(kept);
  kept.forEach((c, i) => (c.id = `wd-${t.name}-${String(i + 1).padStart(4, "0")}`));
  results.push(...kept);
  usedKeys.set(t.name, new Set(kept.map((c) => c.key)));
  stats.push({ name: t.name, candidates: cands.length, kept: kept.length, ...dropped });
  console.log(`${cands.length} candidates → ${kept.length} kept (dup ${dropped.dup}, bad ${dropped.check})`);
}

const out = results.map(({ id, q: x }) => {
  const base = { id, type: x.type, category: x.category, difficulty: x.difficulty, text: x.text };
  if (x.type === "mcq") Object.assign(base, { choices: x.choices, correctIndex: 0 });
  else Object.assign(base, { correctValue: x.correctValue }, x.unit ? { unit: x.unit } : {});
  return { ...base, fact: x.fact, source: "wikidata" };
});

const countBy = (f) => out.reduce((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});
console.log(`\n${out.length} questions (${queryCount} queries, ${networkCount} from network)`);
console.log("by category:", countBy((x) => x.category));
console.log("by type:", countBy((x) => x.type));
console.log("by difficulty:", countBy((x) => x.difficulty));

if (DRY) {
  for (const x of out) console.log(JSON.stringify(x));
} else {
  writeFileSync(OUT, "[\n" + out.map((x) => JSON.stringify(x)).join(",\n") + "\n]\n");
  console.log(`written ${OUT}`);
}
