/**
 * Poster-style planet looks: a flat base, 2–3 flat detail shapes and a halftone night side.
 * Colours are muted print inks so the players' vermilion/cobalt rings stay the loudest thing on the map.
 */
export type PlanetStyle =
  | { kind: "banded"; bands: string[]; spot?: string }
  | { kind: "cratered"; crater: string }
  | { kind: "earth"; land: string }
  | { kind: "lined"; line: string }
  | { kind: "heart"; patch: string };

export type PlanetLook = {
  base: string;
  shade: string;
  r: number;
  ring?: string;
  style: PlanetStyle;
};

const LOOKS: Record<string, PlanetLook> = {
  earth: { base: "#3F8E8C", shade: "#1F4D55", r: 7, style: { kind: "earth", land: "#E3D3A2" } },
  neptune: {
    base: "#4F6BC0",
    shade: "#243670",
    r: 7,
    style: { kind: "banded", bands: ["#6E8BDA", "#3B55A3"] },
  },
  moon: { base: "#CFC6B4", shade: "#6F695E", r: 3.8, style: { kind: "cratered", crater: "#A99F8C" } },
  triton: { base: "#C3CFD6", shade: "#66737D", r: 3.8, style: { kind: "cratered", crater: "#9FAEB8" } },
  ceres: { base: "#8E877B", shade: "#4A453D", r: 4.4, style: { kind: "cratered", crater: "#6F685D" } },
  venus: {
    base: "#E5B46E",
    shade: "#8E5F2A",
    r: 4.8,
    style: { kind: "banded", bands: ["#F2CF93", "#C99248"] },
  },
  uranus: {
    base: "#8CC7C0",
    shade: "#3F7A78",
    r: 4.8,
    style: { kind: "banded", bands: ["#A9DDD6"] },
  },
  mars: { base: "#B4643F", shade: "#5E2C1A", r: 4.3, style: { kind: "cratered", crater: "#8E4A2D" } },
  europa: { base: "#E8DCC2", shade: "#8A7A5B", r: 4.3, style: { kind: "lined", line: "#B07A4F" } },
  mercury: { base: "#9D928A", shade: "#4E4741", r: 4.3, style: { kind: "cratered", crater: "#7C726A" } },
  pluto: { base: "#CDB39C", shade: "#6B5644", r: 4.3, style: { kind: "heart", patch: "#F1E6D0" } },
  saturn: {
    base: "#DDBE86",
    shade: "#7E6337",
    r: 6,
    ring: "#EBD7A8",
    style: { kind: "banded", bands: ["#EAD2A0", "#C49F5F"] },
  },
  jupiter: {
    base: "#D39A66",
    shade: "#7A4B28",
    r: 6.2,
    style: { kind: "banded", bands: ["#EDCB9C", "#B26F42", "#EDCB9C"], spot: "#B4482C" },
  },
  // 3–4 player maps
  titan: {
    base: "#D99A4E",
    shade: "#7A4A1E",
    r: 7,
    style: { kind: "banded", bands: ["#E9B872", "#C07D36"] },
  },
  ganymede: { base: "#8F8A9C", shade: "#45414F", r: 7, style: { kind: "lined", line: "#C9C2B0" } },
  io: { base: "#E3CC5C", shade: "#7F6A22", r: 3.8, style: { kind: "cratered", crater: "#C4722F" } },
  phobos: { base: "#9A7E6A", shade: "#4C3D33", r: 3.6, style: { kind: "cratered", crater: "#7A6252" } },
  callisto: { base: "#6F665C", shade: "#36312B", r: 4.3, style: { kind: "cratered", crater: "#A89C8A" } },
  eris: { base: "#D9D6CE", shade: "#6F6C66", r: 4.3, style: { kind: "lined", line: "#A9A399" } },
};

const FALLBACK: PlanetLook = {
  base: "#A9A9B8",
  shade: "#55556A",
  r: 4.5,
  style: { kind: "cratered", crater: "#8A8A9C" },
};

export function planetLook(id: string): PlanetLook {
  return LOOKS[id] ?? FALLBACK;
}
