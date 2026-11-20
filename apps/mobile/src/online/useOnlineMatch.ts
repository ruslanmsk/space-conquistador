import type { MatchState } from "@space-conquistador/game-core";
import type { MatchSnapshot } from "@space-conquistador/protocol";
import { useMemo } from "react";
import type { MatchController } from "../game/controller";
import { mySeat } from "../game/seats";
import { useOnlineStore } from "./onlineStore";

/** Seat names from the room's nicknames (the server may leave its own placeholders in the config). */
function withNicknames(snap: MatchSnapshot): MatchState {
  const names = new Map(snap.seats.map((s) => [s.seat, s.nickname]));
  const state = snap.state;
  return {
    ...state,
    config: { ...state.config, seats: state.config.seats.map((s) => ({ ...s, name: names.get(s.id) ?? s.name })) },
  };
}

const send = (p: Promise<unknown>) => void p.catch(() => undefined);

/** Adapts the latest server snapshot to the match screen. */
export function useOnlineMatch(): MatchController | null {
  const snap = useOnlineStore((s) => s.snap);
  const offset = useOnlineStore((s) => s.offset);
  const status = useOnlineStore((s) => s.status);
  const state = useMemo(() => (snap ? withNicknames(snap) : null), [snap]);

  return useMemo(() => {
    if (!snap || !state) return null;
    const act = useOnlineStore.getState().act;
    const t = snap.timing;
    const local = (x: number | undefined) => (x === undefined ? null : x - offset);
    const answersAt = local(t.answersAt) ?? Date.now();
    return {
      state,
      me: snap.mySeat ?? mySeat,
      questionKey: state.usedQuestionIds.length,
      questionShownAt: answersAt,
      answersAt,
      // The server times answers itself; "no answer" at the deadline just saves it the grace period.
      answer: (value) => send(act({ type: "ANSWER", value })),
      boost: (booster) => send(act({ type: "BOOST", booster })),
      pick: (planet) => send(act({ type: "PICK", planet })),
      attack: (target) => send(act({ type: "ATTACK", target })),
      wager: (amount) => send(act({ type: "WAGER", amount })),
      next: () => send(act({ type: "CONTINUE" })),
      online: {
        connected: status === "online",
        continued: snap.continued,
        turnUntil: local(t.turnUntil),
        offline: snap.seats.filter((s) => !s.connected).map((s) => s.seat),
      },
    } satisfies MatchController;
  }, [snap, state, offset, status]);
}
