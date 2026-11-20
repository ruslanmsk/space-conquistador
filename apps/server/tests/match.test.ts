import {
  createMatch,
  dispatch,
  seededRng,
  type GameAction,
  type MatchState,
  type PlayerId,
} from "@space-conquistador/game-core";
import type { MatchSnapshot, RoomView } from "@space-conquistador/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadQuestions } from "../src/questions";
import { TestClient, guest, http, roomWith, startMatch, startServer, type TestServer } from "./helpers";

const questions = loadQuestions();

describe("online match (2 players)", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server?.dispose();
  });

  it("plays a full match, ends it for everyone and stores it", async () => {
    const { code, clients } = await roomWith(server, ["Алиса", "Борис"]);
    const [a, b] = clients as [TestClient, TestClient];

    const lobby = await http<RoomView>(server, "GET", `/api/rooms/${code}`);
    expect(lobby.body.members.map((m) => m.nickname)).toEqual(["Алиса", "Борис"]);
    expect(lobby.body.members.every((m) => m.connected)).toBe(true);
    expect(lobby.body.members[1]!.ready).toBe(false);

    const matchId = await startMatch(code, clients);
    expect(a.latest!.mySeat).toBe("p1");
    expect(b.latest!.mySeat).toBe("p2");
    expect(a.latest!.state.config.seats.map((s) => s.name)).toEqual(["Алиса", "Борис"]);
    expect(a.latest!.timing.answersAt).toBeTypeOf("number");
    const firstStep = a.latest!.state.step;
    if (firstStep.type !== "question") throw new Error("expected a question");
    expect(a.latest!.timing.deadline).toBe(a.latest!.timing.answersAt! + firstStep.q.timeLimitMs);

    a.autoplay();
    b.autoplay();
    await Promise.all(clients.map((c) => c.waitFor("match:ended", () => c.ended.length > 0, 45_000)));

    const ended = a.ended[0]!;
    expect(ended.matchId).toBe(matchId);
    expect(b.ended[0]).toEqual(ended);
    expect(ended.ranking).toHaveLength(2);
    expect(a.latest!.state.phase).toBe("finished");
    expect(a.latest!.state.winner).toBe(ended.winner);
    expect(a.leaks).toEqual([]);
    expect(b.leaks).toEqual([]);
    // Snapshot seq only grows.
    const seqs = a.snapshots.map((s) => s.seq);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);

    const room = await a.waitFor("room finished", () => a.rooms.find((r) => r.status === "finished"));
    expect(room.matchId).toBe(matchId);
    expect(room.members.map((m) => m.seat)).toEqual(["p1", "p2"]);

    // Database: match row, ranks, every accepted action in order.
    const [m] = await server.db`select * from matches where id = ${matchId}`;
    expect(m).toMatchObject({ status: "finished", room_code: code, winner: ended.winner });
    expect(m!.finished_at).toBeInstanceOf(Date);
    const players = await server.db`select * from match_players where match_id = ${matchId} order by seat`;
    expect(players.map((p) => p.player_id)).toEqual([a.id, b.id]);
    expect(players.every((p) => typeof p.rank === "number" && typeof p.final_score === "number")).toBe(true);
    const winnerRow = players.find((p) => p.seat === ended.ranking[0]);
    expect(winnerRow!.rank).toBe(1);
    const events = await server.db`select * from match_events where match_id = ${matchId} order by seq`;
    expect(events.length).toBeGreaterThan(10);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.some((e) => e.source === "player" && e.player_id === b.id)).toBe(true);
    const [roomRow] = await server.db`select status from rooms where code = ${code}`;
    expect(roomRow!.status).toBe("finished");

    // The seed plus the stored actions replay the match exactly.
    const ctx = { questions, rng: seededRng(Number(m!.rng_seed)) };
    const seats = (m!.seats as { seat: PlayerId; nickname: string }[]).map((s) => ({
      id: s.seat,
      kind: "human" as const,
      name: s.nickname,
    }));
    let replay: MatchState = createMatch(ctx, { seats });
    for (const e of events) {
      const next = dispatch(replay, e.action as GameAction, ctx);
      expect(next).not.toBe(replay);
      replay = next;
    }
    expect(JSON.parse(JSON.stringify(replay))).toEqual(m!.final_state);

    // Rematch: host resets, the room is a lobby again.
    expect((await b.emit("room:reset", { code })).ok).toBe(false);
    const reset = await a.ok("room:reset", { code });
    expect(reset.status).toBe("lobby");
    expect(reset.members.every((m) => m.seat === undefined)).toBe(true);
    expect(reset.members[1]!.ready).toBe(false);
    const again = await startMatch(code, clients);
    expect(again).not.toBe(matchId);

    for (const c of clients) c.disconnect();
  });

  it("rejects illegal, early and out-of-turn actions", async () => {
    const slow = await startServer({ timing: { readingMs: () => 400 } });
    try {
      const { code, clients } = await roomWith(slow, ["Вера", "Глеб"]);
      const [a, b] = clients as [TestClient, TestClient];

      // Lobby rules.
      expect(await b.emit("room:start", { code })).toMatchObject({ ok: false, error: "not_host" });
      expect(await a.emit("room:start", { code })).toMatchObject({ ok: false, error: "not_ready" });
      const third = new TestClient(slow, await guest(slow, "Дина"));
      await third.connect();
      expect(await third.emit("room:join", { code })).toMatchObject({ ok: false, error: "room_full" });
      expect(await third.emit("room:join", { code: "ZZZZ" })).toMatchObject({ ok: false, error: "not_found" });

      const matchId = await startMatch(code, clients);
      expect(await third.emit("room:join", { code })).toMatchObject({ ok: false, error: "room_started" });
      expect(await third.emit("match:action", { matchId, action: { type: "CONTINUE" } })).toMatchObject({
        ok: false,
        error: "not_in_match",
      });
      expect(await third.emit("match:sync", { matchId })).toMatchObject({ ok: false, error: "not_in_match" });
      expect(await a.emit("match:action", { matchId: "nope", action: { type: "CONTINUE" } })).toMatchObject({
        ok: false,
        error: "not_found",
      });

      // First expansion question: the answers are not open during the reading beat.
      const snap = a.latest!;
      expect(snap.state.step.type).toBe("question");
      expect(snap.timing.answersAt! - snap.timing.serverNow).toBeGreaterThan(200);
      expect(await a.act({ type: "ANSWER", value: 0 })).toMatchObject({ ok: false, error: "illegal_action" });
      expect(await a.act({ type: "PICK", planet: "earth" })).toMatchObject({ ok: false, error: "illegal_action" });
      expect(await a.act({ type: "CONTINUE" })).toMatchObject({ ok: false, error: "illegal_action" });
      expect(await a.act({ type: "WAGER", amount: Number.NaN })).toMatchObject({ ok: false, error: "bad_request" });
      expect(await a.act({ type: "BOOST", booster: "nope" as "fifty" })).toMatchObject({ ok: false, error: "bad_request" });

      await new Promise((r) => setTimeout(r, snap.timing.answersAt! - snap.timing.serverNow + 20));
      const before = a.latest!.seq;
      expect(await a.act({ type: "ANSWER", value: 1 })).toEqual({ ok: true, data: undefined });
      expect(await a.act({ type: "ANSWER", value: 2 })).toMatchObject({ ok: false, error: "illegal_action" });
      // b sees that a answered, but not what.
      await b.waitFor("a answered", () => b.latest!.seq > before && b.latest!.state.step.type === "question");
      const q = b.latest!.state.step;
      if (q.type !== "question") throw new Error("expected a question");
      expect(q.q.answers.p1).toEqual({ value: null, elapsedMs: 0 });
      const mine = a.latest!.state.step;
      if (mine.type !== "question") throw new Error("expected a question");
      expect(mine.q.answers.p1!.value).toBe(1);
      expect(mine.q.answers.p1!.elapsedMs).toBeGreaterThanOrEqual(0);

      // Play on until somebody has to pick / attack; there both hold still (the turn clock is 3 s).
      const isTurn = (x: MatchSnapshot) => x.state.step.type === "pick" || x.state.step.type === "attack";
      a.holdWhen = b.holdWhen = isTurn;
      a.autoplay();
      b.autoplay();
      const turn = await a.waitFor("a pick or attack step", () => (isTurn(a.latest!) ? a.latest! : undefined));
      const step = turn.state.step;
      const actor = step.type === "pick" ? step.queue[0] : step.type === "attack" ? step.player : undefined;
      const idle = actor === "p1" ? b : a;
      const planets = turn.state.map.planets.map((p) => p.id);
      for (const planet of planets) {
        const res = await idle.act(step.type === "pick" ? { type: "PICK", planet } : { type: "ATTACK", target: planet });
        expect(res).toMatchObject({ ok: false, error: "illegal_action" });
      }
      // Occupied/capital planets are never legal picks, even for the player in turn.
      const actorClient = actor === "p1" ? a : b;
      if (step.type === "pick") {
        const taken = planets.find((p) => turn.state.owners[p] !== null)!;
        expect(await actorClient.act({ type: "PICK", planet: taken })).toMatchObject({ ok: false, error: "illegal_action" });
      }
      expect(a.leaks).toEqual([]);
      expect(b.leaks).toEqual([]);
      for (const c of [...clients, third]) c.disconnect();
    } finally {
      await slow.dispose();
    }
  });

  it("refuses wrong protocol versions and unknown tokens", async () => {
    const g = await guest(server, "Ева");
    const c = new TestClient(server, g);
    await expect(c.connect(999)).rejects.toThrow("version_mismatch");
    await expect(c.connect(undefined, "bogus-token")).rejects.toThrow("unauthorized");
    await c.connect();
    c.disconnect();
    expect((await http(server, "GET", "/api/me")).status).toBe(401);
    expect((await http(server, "POST", "/api/guest", { nickname: "x" })).status).toBe(400);
    expect((await http(server, "POST", "/api/rooms", { maxPlayers: 5 }, g.token)).status).toBe(400);
    expect((await http(server, "GET", "/api/rooms/QQQQ")).status).toBe(404);
    const renamed = await http<{ nickname: string }>(server, "PATCH", "/api/me", { nickname: "  Ева  Л " }, g.token);
    expect(renamed.body.nickname).toBe("Ева Л");
    const [row] = await server.db`select token_hash from players where id = ${g.player.id}`;
    expect(row!.token_hash).not.toContain(g.token);
    expect(row!.token_hash).toHaveLength(64);
  });

  it("plays for a disconnected player and lets them rejoin", async () => {
    const { code, clients } = await roomWith(server, ["Жора", "Зина"]);
    const [a, b] = clients as [TestClient, TestClient];
    const matchId = await startMatch(code, clients);

    b.disconnect();
    a.autoplay();
    await a.waitFor("b offline", () => a.latest!.seats.find((s) => s.seat === "p2")?.connected === false);
    await a.waitFor("room shows b offline", () =>
      a.rooms.some((r) => r.members.find((m) => m.playerId === b.id)?.connected === false),
    );
    const offlineSeq = a.latest!.seq;
    // The match keeps going without b: the server answers / moves for p2.
    await a.waitFor("progress without b", () => a.latest!.seq > offlineSeq + 15 || a.ended.length > 0, 30_000);
    const auto = await server.db`
      select count(*)::int as n from match_events where match_id = ${matchId} and player_id = ${b.id} and source = 'timeout'`;
    expect(auto[0]!.n).toBeGreaterThan(0);

    // Same token, new socket: rejoin the room and get the current state.
    const b2 = new TestClient(server, b.session);
    await b2.connect();
    const view = await b2.ok("room:join", { code });
    expect(view.members.find((m) => m.playerId === b.id)!.connected).toBe(true);
    await b2.waitFor("snapshot after rejoin", () => b2.latest?.matchId === matchId);
    expect(b2.latest!.mySeat).toBe("p2");
    const synced = await b2.ok("match:sync", { matchId });
    expect(synced.mySeat).toBe("p2");
    expect(synced.seq).toBeGreaterThanOrEqual(b2.latest!.seq);
    await a.waitFor("b back online", () => a.latest!.seats.find((s) => s.seat === "p2")?.connected === true || a.ended.length > 0);

    b2.autoplay();
    await a.waitFor("match:ended", () => a.ended.length > 0, 45_000);
    // b2 either saw the end live or rejoined after it (then its snapshot is the finished match).
    await b2.waitFor("finished", () => b2.ended.length > 0 || b2.latest!.state.phase === "finished");
    expect(a.leaks).toEqual([]);
    expect(b2.leaks).toEqual([]);
    a.disconnect();
    b2.disconnect();
  });
});

describe("online match (3 players)", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server?.dispose();
  });

  it("starts with three seats and plays to the end", async () => {
    const { code, clients } = await roomWith(server, ["Игорь", "Катя", "Лёва"], 3);
    const matchId = await startMatch(code, clients);
    const first = clients[0]!.latest!;
    expect(first.state.players).toEqual(["p1", "p2", "p3"]);
    expect(first.seats.map((s) => s.nickname)).toEqual(["Игорь", "Катя", "Лёва"]);
    expect(clients.map((c) => c.latest!.mySeat)).toEqual(["p1", "p2", "p3"]);
    expect(first.state.map.planets.filter((p) => p.capitalOf).length).toBe(3);

    for (const c of clients) c.autoplay();
    await Promise.all(clients.map((c) => c.waitFor("match:ended", () => c.ended.length > 0, 60_000)));
    expect(clients[0]!.ended[0]!.ranking).toHaveLength(3);
    for (const c of clients) expect(c.leaks).toEqual([]);
    const ranks = await server.db`select rank from match_players where match_id = ${matchId} order by rank`;
    expect(ranks.map((r) => r.rank)[0]).toBe(1);
    for (const c of clients) c.disconnect();
  });
});
