import {
  getPlanet,
  type BoosterType,
  type MatchState,
  type PlanetKind,
  type PlayerId,
  type Reveal,
} from "@space-conquistador/game-core";
import { isMe, mySeat, opponentSeats, seatName } from "./seats";

export const LEVEL_LABELS = { easy: "Лёгкий", normal: "Средний", hard: "Сильный" } as const;

export const KIND_LABELS: Record<PlanetKind, string> = {
  capital: "Столица",
  world: "Планета",
  giant: "Газовый гигант",
  outpost: "Аванпост",
};

export const KIND_HINTS: Record<PlanetKind, string> = {
  capital: "3 щита. Падение столицы — конец матча",
  world: "Обычная планета",
  giant: "Стоит больше очков",
  outpost: "Даёт бустер тому, кто её займёт",
};

export const BOOSTER_LABELS: Record<BoosterType, { name: string; hint: string }> = {
  fifty: { name: "50/50", hint: "Убирает два неверных варианта" },
  range: { name: "Вилка", hint: "Показывает диапазон, где лежит ответ" },
};

export function planetName(state: MatchState, id: string): string {
  return getPlanet(state.map, id).name;
}

/** Russian plural: plural(5, ["планета", "планеты", "планет"]). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function phaseLabel(state: MatchState): { title: string; detail: string } {
  if (state.phase === "expansion") return { title: "Раздел системы", detail: `вопрос ${state.round}` };
  if (state.phase === "battle")
    return { title: "Битва", detail: `ход ${Math.min(state.round, state.config.battleTurns)} из ${state.config.battleTurns}` };
  if (state.phase === "finale") return { title: "Ва-банк", detail: "финальный вопрос" };
  return { title: "Матч окончен", detail: "" };
}

/**
 * Bottom hint for map steps (questions have their own stage). `seat` is the opponent who is
 * acting when tone is "other".
 */
export function stepHint(state: MatchState): { text: string; tone: "you" | "other" | "info"; seat?: PlayerId } {
  const step = state.step;
  if (step.type === "pick") {
    const who = step.queue[0];
    if (!who) return { text: "", tone: "info" };
    if (isMe(who)) {
      let left = 0;
      while (step.queue[left] === mySeat) left++;
      return {
        text: `Выберите свободную планету рядом со своими · ещё ${left}`,
        tone: "you",
      };
    }
    return { text: `${seatName(state, who)} выбирает планету…`, tone: "other", seat: who };
  }
  if (step.type === "attack") {
    return isMe(step.player)
      ? { text: "Ваш ход. Выберите вражескую планету — вопрос будет из её сектора", tone: "you" }
      : { text: `${seatName(state, step.player)} выбирает цель…`, tone: "other", seat: step.player };
  }
  return { text: "", tone: "info" };
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} с`;
}

export function formatNumber(n: number): string {
  const s = Number.isInteger(n) ? String(Math.abs(n)) : String(Math.abs(n)).replace(".", ",");
  const [int, frac] = s.split(",");
  const grouped = int!.length > 4 ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : int!;
  return `${n < 0 ? "−" : ""}${grouped}${frac ? `,${frac}` : ""}`;
}

export function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : n < 0 ? formatNumber(n) : "±0";
}

/**
 * Verdict line of a reveal, from my point of view. `seat` is whose colour paints the verdict:
 * me when it went my way, the opponent who got the better of me when it did not, none if neutral.
 */
export function revealTitle(
  state: MatchState,
  reveal: Reveal,
): { title: string; subtitle?: string; tone: "good" | "bad" | "neutral"; seat?: PlayerId } {
  const t = verdictText(state, reveal);
  if (t.tone === "good") return { ...t, seat: mySeat };
  if (t.tone === "bad") {
    const w = reveal.winner;
    return { ...t, seat: w && !isMe(w) ? w : opponentSeats(state)[0] };
  }
  return t;
}

function verdictText(
  state: MatchState,
  reveal: Reveal,
): { title: string; subtitle?: string; tone: "good" | "bad" | "neutral" } {
  const o = reveal.outcome;
  const duel = state.players.length === 2;
  const name = (p: PlayerId) => seatName(state, p);
  // In a duel the other side is just "соперник"; with more players we name them.
  const rival = (p: PlayerId) => (duel ? "соперник" : name(p));
  switch (o.type) {
    case "expansion": {
      const mine = o.picks[mySeat] ?? 0;
      const others = opponentSeats(state).filter((p) => (o.picks[p] ?? 0) > 0);
      if (!mine && !others.length) return { title: "Никто не угадал", subtitle: "Планеты остаются свободными", tone: "neutral" };
      const parts = [
        mine ? `вам ${mine} ${plural(mine, ["планета", "планеты", "планет"])}` : null,
        ...others.map((p) => (duel ? `сопернику ${o.picks[p]}` : `${name(p)} — ${o.picks[p]}`)),
      ]
        .filter(Boolean)
        .join(", ");
      const won = isMe(reveal.winner);
      return {
        title: won ? "Раунд ваш" : duel || !reveal.winner ? "Раунд за соперником" : `Раунд за ${name(reveal.winner)}`,
        subtitle: `Захват: ${parts}`,
        tone: won ? "good" : "bad",
      };
    }
    case "tiebreak-needed":
      return { title: "Оба правы", subtitle: "Решающий числовой вопрос: побеждает самый точный", tone: "neutral" };
    case "captured": {
      const planet = planetName(state, o.battle.target);
      if (isMe(o.battle.attacker))
        return { title: `${planet} ваша`, subtitle: "Отвоёванная планета стоит на 100 очков больше", tone: "good" };
      return {
        title: `${name(o.battle.attacker)} забирает ${planet}`,
        tone: isMe(o.battle.defender) ? "bad" : "neutral",
      };
    }
    case "shield-down":
      if (isMe(o.battle.attacker))
        return { title: "Щит столицы пробит", subtitle: `Осталось щитов: ${o.shieldsLeft}`, tone: "good" };
      if (isMe(o.battle.defender))
        return { title: "Ваш щит пробит", subtitle: `Осталось щитов: ${o.shieldsLeft}`, tone: "bad" };
      return { title: `${name(o.battle.attacker)} пробивает щит`, subtitle: `${name(o.battle.defender)}: осталось щитов ${o.shieldsLeft}`, tone: "neutral" };
    case "capital-fell":
      if (isMe(o.battle.attacker))
        return {
          title: "Столица пала",
          subtitle: o.final ? "Вся система ваша" : `${name(o.battle.defender)} выбывает, его планеты ваши`,
          tone: "good",
        };
      if (isMe(o.battle.defender)) return { title: "Ваша столица пала", tone: "bad" };
      return {
        title: `${name(o.battle.defender)}: столица пала`,
        subtitle: `Планеты переходят к ${name(o.battle.attacker)}`,
        tone: "neutral",
      };
    case "defended": {
      const planet = planetName(state, o.battle.target);
      if (isMe(o.battle.defender)) return { title: `${planet} устояла`, subtitle: "+100 за оборону", tone: "good" };
      if (isMe(o.battle.attacker))
        return { title: "Атака отбита", subtitle: `${planet} остаётся за ${duel ? "соперником" : name(o.battle.defender)}`, tone: "bad" };
      return { title: `${planet} устояла`, subtitle: `${name(o.battle.defender)} отбивает атаку`, tone: "neutral" };
    }
    case "finale": {
      const d = o.deltas;
      const mine = d[mySeat];
      const others = opponentSeats(state)
        .filter((p) => d[p] !== undefined)
        .map((p) => `${rival(p)} ${signed(d[p]!)}`);
      if (mine === undefined) return { title: "Финал сыгран", subtitle: others.join(" · "), tone: "neutral" };
      return {
        title: mine > 0 ? "Ставка сыграла" : mine < 0 ? "Ставка сгорела" : "Без ставки",
        subtitle: [`Вы ${signed(mine)}`, ...others].join(" · "),
        tone: mine > 0 ? "good" : mine < 0 ? "bad" : "neutral",
      };
    }
  }
}
