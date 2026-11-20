import { getPlanet } from "../map/sol-system";
import type { MatchState, Opponent, PerPlayer, PlanetId, PlanetKind, PlayerId, Seat } from "../types";

export const POINTS = {
  /** Base value of an ordinary planet. */
  territory: 200,
  capital: 1000,
  /** Extra value a planet gains every time it is conquered in battle. */
  conquestBonus: 100,
  defense: 100,
} as const;

/** Points a free planet is worth when taken during expansion. */
export const KIND_VALUE: Record<PlanetKind, number> = {
  capital: POINTS.capital,
  world: 200,
  giant: 300,
  outpost: 100,
};

export function baseValue(state: MatchState, planet: PlanetId): number {
  return KIND_VALUE[getPlanet(state.map, planet).kind];
}

export function getSeat(state: Pick<MatchState, "config">, player: PlayerId): Seat | undefined {
  return state.config.seats.find((s) => s.id === player);
}

/** Bot profile of a seat (undefined for human seats). */
export function seatOpponent(state: Pick<MatchState, "config">, player: PlayerId): Opponent | undefined {
  return getSeat(state, player)?.opponent;
}

/** Players still in the match (not eliminated), in seat order. */
export function activePlayers(state: MatchState): PlayerId[] {
  return state.players.filter((p) => !state.eliminated.includes(p));
}

/** Everyone in the match except `player`. */
export function opponentsOf(state: MatchState, player: PlayerId): PlayerId[] {
  return state.players.filter((p) => p !== player);
}

/** Next player after `player` in seat order (wrapping around). */
export function nextInSeatOrder(state: MatchState, player: PlayerId): PlayerId {
  const i = state.players.indexOf(player);
  return state.players[(i + 1) % state.players.length]!;
}

/** Builds a per-player record for the seats in the match. */
export function perPlayer<T>(players: readonly PlayerId[], value: (p: PlayerId) => T): PerPlayer<T> {
  const out: PerPlayer<T> = {};
  for (const p of players) out[p] = value(p);
  return out;
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

/** Score of every player in the match: planet values + bonuses (defence, finale). */
export function getScores(state: MatchState): PerPlayer<number> {
  const scores = perPlayer(state.players, (p) => state.bonus[p] ?? 0);
  for (const p of state.map.planets) {
    const owner = state.owners[p.id];
    if (owner) scores[owner] = (scores[owner] ?? 0) + (state.planetValue[p.id] ?? 0);
  }
  return scores;
}

/** One player's score. */
export function scoreOf(state: MatchState, player: PlayerId): number {
  return getScores(state)[player] ?? 0;
}

/**
 * Players from first to last place: players still in the match by score (ties keep seat order),
 * then the eliminated ones, the last to fall first.
 */
export function getRanking(state: MatchState): PlayerId[] {
  const scores = getScores(state);
  const alive = activePlayers(state).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return [...alive, ...[...state.eliminated].reverse()];
}

/** Winner by score among players still in the match; "draw" if the top score is shared. */
export function leaderOrDraw(state: MatchState): PlayerId | "draw" {
  const scores = getScores(state);
  const [first, second] = getRanking(state);
  if (!first) return "draw";
  if (second && !state.eliminated.includes(second) && scores[second] === scores[first]) return "draw";
  return first;
}

/**
 * Whether the planet is a standing capital (held by the player it belongs to, so it has shields).
 * A capital taken from an eliminated player is an ordinary planet for its new owner.
 */
export function isCapital(state: MatchState, planet: PlanetId): boolean {
  const owner = getPlanet(state.map, planet).capitalOf;
  return !!owner && state.owners[planet] === owner;
}
