import {
  PROTOCOL_VERSION,
  type ClientAction,
  type ClientToServerEvents,
  type ErrorCode,
  type GuestSession,
  type MatchSnapshot,
  type RoomView,
  type ServerToClientEvents,
} from "@space-conquistador/protocol";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import { api, errorText, OnlineError } from "./api";
import { serverUrl } from "./config";
import { loadSession, saveSession } from "./session";

/** offline — no socket; connecting — first connect; online; reconnecting — lost the link, retrying. */
export type ConnStatus = "offline" | "connecting" | "online" | "reconnecting";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type AckRes<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };

const ACK_TIMEOUT_MS = 8000;
const CLOCK_SAMPLES = 8;

type OnlineStore = {
  session: GuestSession | null;
  sessionLoaded: boolean;
  status: ConnStatus;
  /** Last connection-level problem worth showing (cleared on connect). */
  error: string | null;
  /** serverClock − localClock, ms. Server time `t` is local `t - offset`. */
  offset: number;
  room: RoomView | null;
  snap: MatchSnapshot | null;

  init: () => Promise<GuestSession | null>;
  register: (nickname: string) => Promise<void>;
  rename: (nickname: string) => Promise<void>;
  createRoom: (maxPlayers: number) => Promise<string>;
  joinRoom: (code: string) => Promise<RoomView>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  start: () => Promise<void>;
  reset: () => Promise<void>;
  act: (action: ClientAction) => Promise<void>;
};

let socket: GameSocket | null = null;
let socketToken: string | null = null;
let clockSamples: number[] = [];

export const useOnlineStore = create<OnlineStore>((set, get) => {
  function token(): string {
    const s = get().session;
    if (!s) throw new OnlineError("unauthorized", "Сначала представьтесь.");
    return s.token;
  }

  function sampleClock(serverNow: number) {
    clockSamples = [...clockSamples, serverNow - Date.now()].slice(-CLOCK_SAMPLES);
    // A sample is the true offset minus the one-way latency, so the largest one is the closest.
    set({ offset: Math.max(...clockSamples) });
  }

  async function forgetSession(message: string) {
    dropSocket();
    await saveSession(null);
    set({ session: null, status: "offline", error: message, room: null, snap: null });
  }

  /** HTTP call with the session token; an unknown token drops the session so the nickname is asked again. */
  async function authed<T>(call: (token: string) => Promise<T>): Promise<T> {
    try {
      return await call(token());
    } catch (e) {
      if (e instanceof OnlineError && e.code === "unauthorized") await forgetSession(e.message);
      throw e;
    }
  }

  function dropSocket() {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    socketToken = null;
  }

  /** One socket per session; reconnects by itself and resubscribes to the current room. */
  function ensureSocket(): GameSocket {
    const t = token();
    if (socket && socketToken === t) return socket;
    dropSocket();
    const s: GameSocket = io(serverUrl(), {
      auth: { token: t, protocol: PROTOCOL_VERSION },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    socket = s;
    socketToken = t;
    set({ status: "connecting" });

    let connectedBefore = false;
    s.on("connect", () => {
      set({ status: "online", error: null });
      if (!connectedBefore) {
        connectedBefore = true;
        return;
      }
      // After a reconnect the server no longer has us in the room's channel: rejoin and resync.
      const { room, snap } = get();
      if (room) void get().joinRoom(room.code).catch(() => undefined);
      else if (snap) void sync(snap.matchId);
    });
    s.on("disconnect", (reason) => {
      if (socket !== s) return;
      set({ status: "reconnecting" });
      // The server closed us on purpose (e.g. restart): socket.io will not retry by itself.
      if (reason === "io server disconnect") s.connect();
    });
    s.on("connect_error", (err) => {
      if (socket !== s) return;
      const data = (err as Error & { data?: { error?: string; message?: string } }).data;
      const code = data?.error ?? err.message;
      if (code === "unauthorized") {
        void forgetSession(errorText("unauthorized"));
        return;
      }
      if (code === "version_mismatch") {
        dropSocket();
        set({ status: "offline", error: errorText("version_mismatch") });
        return;
      }
      set({ status: get().status === "online" || get().status === "reconnecting" ? "reconnecting" : "connecting", error: "Нет связи с сервером…" });
    });

    s.on("room:update", (room) => onRoom(room));
    s.on("match:snapshot", (snap) => onSnapshot(snap));
    s.on("server:error", (e) => set({ error: errorText(e.error, e.message) }));
    return s;
  }

  function onRoom(room: RoomView) {
    const cur = get().room;
    if (cur && cur.code !== room.code) return;
    const snap = get().snap;
    // Back in the lobby (rematch) — the old match is over for good.
    const keepSnap = room.status !== "lobby" && snap && snap.matchId === room.matchId ? snap : null;
    set({ room, snap: keepSnap });
    if (room.status !== "lobby" && room.matchId && !keepSnap) void sync(room.matchId);
  }

  function onSnapshot(snap: MatchSnapshot) {
    sampleClock(snap.timing.serverNow);
    const cur = get().snap;
    if (cur && cur.matchId === snap.matchId && snap.seq <= cur.seq) return;
    const room = get().room;
    if (room && room.code !== snap.roomCode) return;
    set({ snap });
  }

  async function sync(matchId: string) {
    try {
      onSnapshot(await emit("match:sync", { matchId }));
    } catch {
      // The next snapshot or reconnect will fix it.
    }
  }

  /** Emits an event with an ack and turns the ack into a promise (rejects on error or timeout). */
  function emit<T>(event: keyof ClientToServerEvents, payload: unknown): Promise<T> {
    const s = ensureSocket();
    return new Promise<T>((resolve, reject) => {
      (s.timeout(ACK_TIMEOUT_MS) as unknown as { emit: (e: string, p: unknown, cb: (err: Error | null, res: AckRes<T>) => void) => void }).emit(
        event,
        payload,
        (err, res) => {
          if (err) reject(new OnlineError("network", "Сервер не ответил. Проверьте связь."));
          else if (!res.ok) reject(new OnlineError(res.error, errorText(res.error, res.message)));
          else resolve(res.data);
        },
      );
    });
  }

  function roomCode(): string {
    const code = get().room?.code;
    if (!code) throw new OnlineError("not_found", "Вы не в комнате.");
    return code;
  }

  return {
    session: null,
    sessionLoaded: false,
    status: "offline",
    error: null,
    offset: 0,
    room: null,
    snap: null,

    init: async () => {
      if (get().sessionLoaded) return get().session;
      const session = await loadSession();
      set({ session, sessionLoaded: true });
      return session;
    },

    register: async (nickname) => {
      const session = await api.guest({ nickname: nickname.trim() });
      await saveSession(session);
      dropSocket();
      set({ session, sessionLoaded: true, error: null });
    },

    rename: async (nickname) => {
      const player = await authed((t) => api.rename(t, { nickname: nickname.trim() }));
      const session = { ...get().session!, player };
      await saveSession(session);
      set({ session });
    },

    createRoom: async (maxPlayers) => {
      const room = await authed((t) => api.createRoom(t, { maxPlayers }));
      set({ room, snap: null });
      await get().joinRoom(room.code);
      return room.code;
    },

    joinRoom: async (code) => {
      const cur = get().room;
      if (cur && cur.code !== code) set({ room: null, snap: null });
      const room = await emit<RoomView>("room:join", { code });
      onRoom(room);
      return room;
    },

    leaveRoom: async () => {
      const room = get().room;
      set({ room: null, snap: null });
      if (room) await emit("room:leave", { code: room.code }).catch(() => undefined);
    },

    setReady: async (ready) => {
      onRoom(await emit<RoomView>("room:ready", { code: roomCode(), ready }));
    },

    start: async () => {
      await emit<{ matchId: string }>("room:start", { code: roomCode() });
    },

    reset: async () => {
      onRoom(await emit<RoomView>("room:reset", { code: roomCode() }));
    },

    act: async (action) => {
      const snap = get().snap;
      if (!snap) return;
      await emit("match:action", { matchId: snap.matchId, action });
    },
  };
});

/** Local Date.now() value of a server timestamp. */
export function toLocal(serverTime: number | undefined, offset: number): number | null {
  return serverTime === undefined ? null : serverTime - offset;
}

// Dev-only handle for poking at the online match from the browser console while testing.
if (__DEV__ && typeof globalThis !== "undefined") {
  Object.assign(globalThis, { __online: useOnlineStore, __onlineSocket: () => socket });
}
