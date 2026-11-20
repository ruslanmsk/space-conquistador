type PlanetLook = { light: string; dark: string; r: number; ring?: boolean };

const LOOKS: Record<string, PlanetLook> = {
  earth: { light: "#7fd3ff", dark: "#1d5fae", r: 6.5 },
  moon: { light: "#e4e4ee", dark: "#7c7c92", r: 3.8 },
  venus: { light: "#ffe2a3", dark: "#c08a3e", r: 4.8 },
  mars: { light: "#ff9a6b", dark: "#a8321b", r: 4.4 },
  mercury: { light: "#d6cfc8", dark: "#6e655d", r: 3.8 },
  vesta: { light: "#c9bfb2", dark: "#6a6058", r: 3.4 },
  ceres: { light: "#c8c2dc", dark: "#5f5a78", r: 4.6 },
  jupiter: { light: "#f5cf9a", dark: "#a8693a", r: 6 },
  saturn: { light: "#fbe4a6", dark: "#b98c45", r: 5, ring: true },
  europa: { light: "#f4ead8", dark: "#a08f72", r: 3.8 },
  uranus: { light: "#b8fbf6", dark: "#3aa5b4", r: 5 },
  triton: { light: "#e0ecfa", dark: "#7f93ad", r: 3.6 },
  neptune: { light: "#8fa8ff", dark: "#2639b8", r: 6.5 },
};

const FALLBACK: PlanetLook = { light: "#c8c8e0", dark: "#555570", r: 4.5 };

export function planetLook(id: string): PlanetLook {
  return LOOKS[id] ?? FALLBACK;
}
