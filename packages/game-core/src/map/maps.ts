import type { PlanetId, StarMap } from "../types";
import { SOL_SYSTEM, buildMap, type PlanetDef } from "./sol-system";

/**
 * Three players. Each seat owns an identical wedge (rotated by 120°): capital, outpost and two
 * worlds. Between neighbouring wedges sits a giant; Ceres is the shared hub in the centre.
 * Every capital is 4 jumps from both enemy capitals, and 2 jumps from the hub.
 */
const TRIAD_PLANETS: PlanetDef[] = [
  { id: "earth", name: "Земля", kind: "capital", x: 50, y: 129, capitalOf: "p1" },
  { id: "moon", name: "Луна", kind: "outpost", x: 34, y: 123 },
  { id: "mars", name: "Марс", kind: "world", x: 36, y: 102 },
  { id: "venus", name: "Венера", kind: "world", x: 64, y: 104 },
  { id: "neptune", name: "Нептун", kind: "capital", x: 87, y: 40, capitalOf: "p2" },
  { id: "triton", name: "Тритон", kind: "outpost", x: 91, y: 62 },
  { id: "pluto", name: "Плутон", kind: "world", x: 77, y: 70 },
  { id: "europa", name: "Европа", kind: "world", x: 64, y: 36 },
  { id: "titan", name: "Титан", kind: "capital", x: 13, y: 40, capitalOf: "p3" },
  { id: "io", name: "Ио", kind: "outpost", x: 24, y: 25 },
  { id: "mercury", name: "Меркурий", kind: "world", x: 36, y: 38 },
  { id: "callisto", name: "Каллисто", kind: "world", x: 21, y: 70 },
  { id: "saturn", name: "Сатурн", kind: "giant", x: 85, y: 98 },
  { id: "jupiter", name: "Юпитер", kind: "giant", x: 50, y: 15 },
  { id: "uranus", name: "Уран", kind: "giant", x: 15, y: 98 },
  { id: "ceres", name: "Церера", kind: "outpost", x: 50, y: 70 },
];

/** Per wedge: capital, outpost, world towards the previous wedge (A), world towards the next (B). */
const TRIAD_WEDGES = [
  { c: "earth", o: "moon", a: "mars", b: "venus", giant: "saturn" },
  { c: "neptune", o: "triton", a: "pluto", b: "europa", giant: "jupiter" },
  { c: "titan", o: "io", a: "mercury", b: "callisto", giant: "uranus" },
];

const TRIAD_EDGES: [PlanetId, PlanetId][] = TRIAD_WEDGES.flatMap((w, i) => {
  const prev = TRIAD_WEDGES[(i + 2) % 3]!;
  return [
    [w.c, w.o],
    [w.c, w.a],
    [w.c, w.b],
    [w.o, w.a],
    [w.a, prev.giant],
    [w.a, "ceres"],
    [w.b, w.giant],
    [w.b, "ceres"],
  ] as [PlanetId, PlanetId][];
});

export const TRIAD_SYSTEM: StarMap = buildMap(
  { id: "triad", name: "Тройная система", width: 100, height: 140 },
  TRIAD_PLANETS,
  TRIAD_EDGES,
);

/**
 * Four players in the corners: p1 bottom-left, p2 top-right, p3 top-left, p4 bottom-right.
 * Each corner has a capital, an outpost, a border world and an inner world. Bottom and top
 * neighbours touch outpost-to-outpost; left and right neighbours meet over a giant; inner worlds
 * lead to the Ceres hub. Every player has one neighbour 3 jumps away and two 4 jumps away.
 */
const QUAD_PLANETS: PlanetDef[] = [
  { id: "earth", name: "Земля", kind: "capital", x: 14, y: 124, capitalOf: "p1" },
  { id: "moon", name: "Луна", kind: "outpost", x: 38, y: 130 },
  { id: "mars", name: "Марс", kind: "world", x: 12, y: 98 },
  { id: "venus", name: "Венера", kind: "world", x: 34, y: 104 },
  { id: "neptune", name: "Нептун", kind: "capital", x: 86, y: 16, capitalOf: "p2" },
  { id: "triton", name: "Тритон", kind: "outpost", x: 62, y: 10 },
  { id: "pluto", name: "Плутон", kind: "world", x: 88, y: 42 },
  { id: "europa", name: "Европа", kind: "world", x: 66, y: 36 },
  { id: "titan", name: "Титан", kind: "capital", x: 14, y: 16, capitalOf: "p3" },
  { id: "phobos", name: "Фобос", kind: "outpost", x: 38, y: 10 },
  { id: "mercury", name: "Меркурий", kind: "world", x: 12, y: 42 },
  { id: "uranus", name: "Уран", kind: "world", x: 34, y: 36 },
  { id: "ganymede", name: "Ганимед", kind: "capital", x: 86, y: 124, capitalOf: "p4" },
  { id: "io", name: "Ио", kind: "outpost", x: 62, y: 130 },
  { id: "eris", name: "Эрида", kind: "world", x: 88, y: 98 },
  { id: "callisto", name: "Каллисто", kind: "world", x: 66, y: 104 },
  { id: "jupiter", name: "Юпитер", kind: "giant", x: 9, y: 70 },
  { id: "saturn", name: "Сатурн", kind: "giant", x: 91, y: 70 },
  { id: "ceres", name: "Церера", kind: "outpost", x: 50, y: 70 },
];

const QUAD_CORNERS = [
  { c: "earth", outpost: "moon", border: "mars", inner: "venus" },
  { c: "neptune", outpost: "triton", border: "pluto", inner: "europa" },
  { c: "titan", outpost: "phobos", border: "mercury", inner: "uranus" },
  { c: "ganymede", outpost: "io", border: "eris", inner: "callisto" },
];

const QUAD_EDGES: [PlanetId, PlanetId][] = [
  ...QUAD_CORNERS.flatMap(
    (k) =>
      [
        [k.c, k.outpost],
        [k.c, k.border],
        [k.c, k.inner],
        [k.outpost, k.inner],
        [k.border, k.inner],
        [k.inner, "ceres"],
      ] as [PlanetId, PlanetId][],
  ),
  ["moon", "io"],
  ["phobos", "triton"],
  ["mars", "jupiter"],
  ["mercury", "jupiter"],
  ["pluto", "saturn"],
  ["eris", "saturn"],
];

export const QUAD_SYSTEM: StarMap = buildMap(
  { id: "quad", name: "Четыре системы", width: 100, height: 140 },
  QUAD_PLANETS,
  QUAD_EDGES,
);

export const MAPS: Record<2 | 3 | 4, StarMap> = { 2: SOL_SYSTEM, 3: TRIAD_SYSTEM, 4: QUAD_SYSTEM };

/** The map for a match with this many players (2–4). */
export function mapForPlayers(count: number): StarMap {
  const map = MAPS[count as 2 | 3 | 4];
  if (!map) throw new Error(`No map for ${count} players`);
  return map;
}
