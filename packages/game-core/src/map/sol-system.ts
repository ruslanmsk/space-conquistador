import type { Planet, PlanetId, PlayerId, StarMap } from "../types";

type PlanetDef = Omit<Planet, "neighbors">;

/** Point-symmetric layout (x, y) -> (100 - x, 140 - y) so both capitals are equally placed. */
const PLANETS: PlanetDef[] = [
  { id: "earth", name: "Земля", x: 50, y: 124, capitalOf: "human" },
  { id: "moon", name: "Луна", x: 22, y: 110 },
  { id: "venus", name: "Венера", x: 78, y: 108 },
  { id: "mars", name: "Марс", x: 34, y: 90 },
  { id: "mercury", name: "Меркурий", x: 84, y: 82 },
  { id: "vesta", name: "Веста", x: 14, y: 84 },
  { id: "ceres", name: "Церера", x: 50, y: 70 },
  { id: "saturn", name: "Сатурн", x: 86, y: 56 },
  { id: "jupiter", name: "Юпитер", x: 16, y: 58 },
  { id: "europa", name: "Европа", x: 66, y: 50 },
  { id: "uranus", name: "Уран", x: 22, y: 32 },
  { id: "triton", name: "Тритон", x: 78, y: 30 },
  { id: "neptune", name: "Нептун", x: 50, y: 16, capitalOf: "bot" },
];

const EDGES: [PlanetId, PlanetId][] = [
  ["earth", "moon"],
  ["earth", "venus"],
  ["earth", "mars"],
  ["moon", "vesta"],
  ["moon", "mars"],
  ["venus", "mercury"],
  ["venus", "ceres"],
  ["mars", "ceres"],
  ["vesta", "jupiter"],
  ["mercury", "ceres"],
  ["mercury", "saturn"],
  ["neptune", "triton"],
  ["neptune", "uranus"],
  ["neptune", "europa"],
  ["triton", "saturn"],
  ["triton", "europa"],
  ["uranus", "jupiter"],
  ["uranus", "ceres"],
  ["europa", "ceres"],
  ["jupiter", "ceres"],
];

function buildMap(): StarMap {
  const neighbors = new Map<PlanetId, PlanetId[]>(PLANETS.map((p) => [p.id, []]));
  for (const [a, b] of EDGES) {
    neighbors.get(a)!.push(b);
    neighbors.get(b)!.push(a);
  }
  return {
    id: "sol-system",
    name: "Солнечная система",
    width: 100,
    height: 140,
    planets: PLANETS.map((p) => ({ ...p, neighbors: neighbors.get(p.id)! })),
  };
}

export const SOL_SYSTEM: StarMap = buildMap();

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
