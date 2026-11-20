import { getPlanet } from "../map/sol-system";
import type { MatchState, PlanetId, PlayerId } from "../types";

export const POINTS = {
  territory: 200,
  conquered: 300,
  capital: 1000,
  defense: 100,
} as const;

export function otherPlayer(p: PlayerId): PlayerId {
  return p === "human" ? "bot" : "human";
}

export function ownedPlanets(state: MatchState, player: PlayerId): PlanetId[] {
  return state.map.planets.filter((p) => state.owners[p.id] === player).map((p) => p.id);
}

export function freePlanets(state: MatchState): PlanetId[] {
  return state.map.planets.filter((p) => state.owners[p.id] === null).map((p) => p.id);
}

/** Free planets adjacent to the player's territory; if none border it, any free planet. */
export function getLegalPicks(state: MatchState, player: PlayerId): PlanetId[] {
  const adjacent = new Set<PlanetId>();
  for (const id of ownedPlanets(state, player)) {
    for (const n of getPlanet(state.map, id).neighbors) {
      if (state.owners[n] === null) adjacent.add(n);
    }
  }
  return adjacent.size ? [...adjacent] : freePlanets(state);
}

export function getLegalAttackTargets(state: MatchState, attacker: PlayerId): PlanetId[] {
  const targets = new Set<PlanetId>();
  for (const id of ownedPlanets(state, attacker)) {
    for (const n of getPlanet(state.map, id).neighbors) {
      const owner = state.owners[n];
      if (owner && owner !== attacker) targets.add(n);
    }
  }
  return [...targets];
}

export function getScores(state: MatchState): Record<PlayerId, number> {
  const scores: Record<PlayerId, number> = { human: state.bonus.human, bot: state.bonus.bot };
  for (const p of state.map.planets) {
    const owner = state.owners[p.id];
    if (owner) scores[owner] += state.planetValue[p.id] ?? 0;
  }
  return scores;
}

export function isCapital(state: MatchState, planet: PlanetId): boolean {
  return !!getPlanet(state.map, planet).capitalOf;
}
