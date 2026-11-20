import type { Planet, PlanetId, PlayerId, StarMap } from "../types";

export type PlanetDef = Omit<Planet, "neighbors">;

/**
 * Point-symmetric layout (x, y) -> (100 - x, 140 - y): every planet has a twin of the same kind
 * on the other side, so both capitals start in equal positions. Ceres sits in the contested centre.
 */
const PLANETS: PlanetDef[] = [
  { id: "earth", name: "Земля", kind: "capital", x: 50, y: 124, capitalOf: "p1" },
  { id: "moon", name: "Луна", kind: "outpost", x: 22, y: 110 },
  { id: "venus", name: "Венера", kind: "world", x: 78, y: 108 },
  { id: "mars", name: "Марс", kind: "world", x: 34, y: 90 },
  { id: "saturn", name: "Сатурн", kind: "giant", x: 84, y: 82 },
  { id: "mercury", name: "Меркурий", kind: "world", x: 14, y: 84 },
  { id: "ceres", name: "Церера", kind: "outpost", x: 50, y: 70 },
  { id: "pluto", name: "Плутон", kind: "world", x: 86, y: 56 },
  { id: "jupiter", name: "Юпитер", kind: "giant", x: 16, y: 58 },
  { id: "europa", name: "Европа", kind: "world", x: 66, y: 50 },
  { id: "uranus", name: "Уран", kind: "world", x: 22, y: 32 },
  { id: "triton", name: "Тритон", kind: "outpost", x: 78, y: 30 },
  { id: "neptune", name: "Нептун", kind: "capital", x: 50, y: 16, capitalOf: "p2" },
];

const EDGES: [PlanetId, PlanetId][] = [
  ["earth", "moon"],
  ["earth", "venus"],
  ["earth", "mars"],
  ["moon", "mercury"],
  ["moon", "mars"],
  ["venus", "saturn"],
  ["venus", "ceres"],
  ["mars", "ceres"],
  ["mercury", "jupiter"],
  ["saturn", "ceres"],
  ["saturn", "pluto"],
  ["neptune", "triton"],
  ["neptune", "uranus"],
  ["neptune", "europa"],
  ["triton", "pluto"],
  ["triton", "europa"],
  ["uranus", "jupiter"],
  ["uranus", "ceres"],
  ["europa", "ceres"],
  ["jupiter", "ceres"],
];

export function buildMap(
  meta: Omit<StarMap, "planets">,
  planets: PlanetDef[],
  edges: [PlanetId, PlanetId][],
): StarMap {
  const neighbors = new Map<PlanetId, PlanetId[]>(planets.map((p) => [p.id, []]));
  for (const [a, b] of edges) {
    neighbors.get(a)!.push(b);
    neighbors.get(b)!.push(a);
  }
  return { ...meta, planets: planets.map((p) => ({ ...p, neighbors: neighbors.get(p.id)! })) };
}

/** Two players: p1 = Earth (bottom), p2 = Neptune (top). */
export const SOL_SYSTEM: StarMap = buildMap(
  { id: "sol-system", name: "Солнечная система", width: 100, height: 140 },
  PLANETS,
  EDGES,
);

export function getPlanet(map: StarMap, id: PlanetId): Planet {
  const p = map.planets.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown planet ${id}`);
  return p;
}

export function capitalOf(map: StarMap, player: PlayerId): Planet {
  const p = map.planets.find((x) => x.capitalOf === player);
  if (!p) throw new Error(`Map ${map.id} has no capital for ${player}`);
  return p;
}
