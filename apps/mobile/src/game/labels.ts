import {
  getPlanet,
  type MatchState,
  type PlayerId,
  type Reveal,
} from "@space-conquistador/game-core";

export const LEVEL_LABELS = { easy: "Лёгкий", normal: "Нормальный", hard: "Сложный" } as const;

export function planetName(state: MatchState, id: string): string {
  return getPlanet(state.map, id).name;
}

export function phaseLabel(state: MatchState): string {
  if (state.phase === "expansion") return `Раздел системы · вопрос ${state.round}`;
  if (state.phase === "battle") return `Битва · ход ${Math.min(state.round, state.config.battleTurns)} из ${state.config.battleTurns}`;
  return "Матч окончен";
}

/** Bottom hint for map steps (question/reveal have their own panels). */
export function stepHint(state: MatchState): { text: string; tone: "you" | "bot" | "info" } {
  const step = state.step;
  if (step.type === "pick") {
    if (step.queue[0] === "human") {
      let left = 0;
      while (step.queue[left] === "human") left++;
      return { text: `Нажмите на свободную планету рядом с вашей территорией · осталось ${left}`, tone: "you" };
    }
    return { text: "Бот выбирает планету…", tone: "bot" };
  }
  if (step.type === "attack") {
    return step.player === "human"
      ? { text: "Ваш ход: нажмите на вражескую планету, чтобы атаковать", tone: "you" }
      : { text: "Бот готовит атаку…", tone: "bot" };
  }
  return { text: "", tone: "info" };
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} с`;
}

export function formatNumber(n: number): string {
  const s = Number.isInteger(n) ? String(Math.abs(n)) : String(Math.abs(n)).replace(".", ",");
  const [int, frac] = s.split(",");
  const grouped = int!.length > 4 ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : int!;
  return `${n < 0 ? "−" : ""}${grouped}${frac ? `,${frac}` : ""}`;
}

export function revealTitle(
  state: MatchState,
  reveal: Reveal,
): { title: string; subtitle?: string; tone: "good" | "bad" | "neutral" } {
  const o = reveal.outcome;
  const you = (p: PlayerId) => p === "human";
  switch (o.type) {
    case "expansion": {
      const { human, bot } = o.picks;
      if (!human && !bot) return { title: "Никто не ответил верно", subtitle: "Планеты остаются свободными", tone: "neutral" };
      const parts = [human ? `вы +${human}` : null, bot ? `бот +${bot}` : null].filter(Boolean).join(", ");
      return {
        title: reveal.winner === "human" ? "Раунд ваш!" : "Раунд за ботом",
        subtitle: `Захват планет: ${parts}`,
        tone: reveal.winner === "human" ? "good" : "bad",
      };
    }
    case "tiebreak-needed":
      return { title: "Оба ответили верно!", subtitle: "Решающий вопрос: побеждает самый точный", tone: "neutral" };
    case "captured": {
      const name = planetName(state, o.battle.target);
      return you(o.battle.attacker)
        ? { title: `${name} захвачена!`, subtitle: "Планета теперь ваша и стоит больше очков", tone: "good" }
        : { title: `Бот захватил ${name}`, tone: "bad" };
    }
    case "shield-down":
      return you(o.battle.attacker)
        ? { title: "Щит вражеской столицы пробит!", subtitle: `Осталось щитов: ${o.shieldsLeft}`, tone: "good" }
        : { title: "Бот пробил щит вашей столицы", subtitle: `Осталось щитов: ${o.shieldsLeft}`, tone: "bad" };
    case "capital-fell":
      return you(o.battle.attacker)
        ? { title: "Вражеская столица пала!", subtitle: "Вся система ваша", tone: "good" }
        : { title: "Ваша столица пала", tone: "bad" };
    case "defended": {
      const name = planetName(state, o.battle.target);
      return you(o.battle.defender)
        ? { title: `Вы отстояли ${name}`, subtitle: "+100 очков за оборону", tone: "good" }
        : { title: "Атака отбита", subtitle: `${name} остаётся за ботом`, tone: "bad" };
    }
  }
}
