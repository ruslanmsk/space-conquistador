import {
  activePlayers,
  getSeat,
  type MatchState,
  type Opponent,
  type PlayerId,
} from "@space-conquistador/game-core";
import { colors } from "../theme/colors";

/**
 * Seats as this device sees them. The local player is always "me" (vermilion); opponents get
 * cobalt, jade and plum in seat order after me. In the bot game I am p1 and the bot is p2.
 */
export const mySeat: PlayerId = "p1";

type SeatPalette = { color: string; deep: string; ink: string; soft: string; dash?: string };

/** By slot: 0 = me, 1 = first opponent after me, … Dash = second cue for the map ring. */
const PALETTES: SeatPalette[] = [
  { color: colors.human, deep: colors.humanDeep, ink: colors.humanInk, soft: colors.humanSoft },
  { color: colors.bot, deep: colors.botDeep, ink: colors.botInk, soft: colors.botSoft, dash: "2 0.8" },
  { color: colors.jade, deep: colors.jadeDeep, ink: colors.jadeInk, soft: colors.jadeSoft, dash: "0.7 0.7" },
  { color: colors.plum, deep: colors.plumDeep, ink: colors.plumInk, soft: colors.plumSoft, dash: "2.2 0.6 0.6 0.6" },
];

const NEUTRAL: SeatPalette = { color: colors.neutral, deep: colors.line, ink: colors.text, soft: "transparent" };

/** 0 for me, then 1.. for opponents in seat order starting after me. */
export function seatSlot(state: MatchState, seat: PlayerId, me: PlayerId = mySeat): number {
  const n = state.players.length;
  const i = state.players.indexOf(seat);
  const m = Math.max(0, state.players.indexOf(me));
  return i < 0 ? -1 : (i - m + n) % n;
}

function palette(state: MatchState, seat: PlayerId | null | undefined, me: PlayerId): SeatPalette {
  if (!seat) return NEUTRAL;
  return PALETTES[seatSlot(state, seat, me)] ?? NEUTRAL;
}

export const seatColor = (state: MatchState, seat: PlayerId | null | undefined, me = mySeat) => palette(state, seat, me).color;
export const seatDeep = (state: MatchState, seat: PlayerId | null | undefined, me = mySeat) => palette(state, seat, me).deep;
export const seatInk = (state: MatchState, seat: PlayerId | null | undefined, me = mySeat) => palette(state, seat, me).ink;
export const seatSoft = (state: MatchState, seat: PlayerId | null | undefined, me = mySeat) => palette(state, seat, me).soft;
/** Map ring dash pattern: solid for me, a distinct pattern per opponent. */
export const seatDash = (state: MatchState, seat: PlayerId | null | undefined, me = mySeat) => palette(state, seat, me).dash;

export const isMe = (seat: PlayerId | null | undefined, me = mySeat) => seat === me;

/** "Вы" for me, otherwise the seat's name (the bot's commander name). */
export function seatName(state: MatchState, seat: PlayerId, me = mySeat): string {
  if (seat === me) return "Вы";
  return getSeat(state, seat)?.name ?? seat;
}

/** Avatar look id: "you" for me, the commander id for bots. */
export function seatAvatarId(state: MatchState, seat: PlayerId, me = mySeat): string {
  if (seat === me) return "you";
  return getSeat(state, seat)?.opponent?.id ?? seat;
}

/** Everyone else, in seat order starting after me (slot 1, 2, …). */
export function opponentSeats(state: MatchState, me = mySeat): PlayerId[] {
  return state.players.filter((p) => p !== me).sort((a, b) => seatSlot(state, a, me) - seatSlot(state, b, me));
}

/** Me first, then opponents in slot order. */
export function seatsFromMe(state: MatchState, me = mySeat): PlayerId[] {
  return [me, ...opponentSeats(state, me)].filter((p) => state.players.includes(p));
}

/** Opponents still in the match. */
export function liveOpponents(state: MatchState, me = mySeat): PlayerId[] {
  const live = activePlayers(state);
  return opponentSeats(state, me).filter((p) => live.includes(p));
}

/** The campaign opponent of a bot game: profile of the first bot seat. */
export function mainOpponent(state: MatchState): Opponent | undefined {
  return state.config.seats.find((s) => s.kind === "bot" && s.opponent)?.opponent;
}
