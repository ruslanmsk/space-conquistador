import type { PlayerId } from "@space-conquistador/game-core";
import { createContext, useContext } from "react";
import { mySeat } from "./seats";

/**
 * Whose eyes the match UI looks through. The bot game is always `p1`; online it is the seat the
 * server gave this client, so colours, "Вы" and verdicts follow the local player whatever their seat.
 */
export const MeContext = createContext<PlayerId>(mySeat);

export const useMe = () => useContext(MeContext);
