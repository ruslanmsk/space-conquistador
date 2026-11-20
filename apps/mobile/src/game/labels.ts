import {
  getPlanet,
  type BoosterType,
  type MatchState,
  type PlanetKind,
  type PlayerId,
  type Reveal,
} from "@space-conquistador/game-core";

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

/** Bottom hint for map steps (questions have their own stage). */
export function stepHint(state: MatchState): { text: string; tone: "you" | "bot" | "info" } {
  const step = state.step;
  const bot = state.config.opponent.name;
  if (step.type === "pick") {
    if (step.queue[0] === "human") {
      let left = 0;
      while (step.queue[left] === "human") left++;
      return {
        text: `Выберите свободную планету рядом со своими · ещё ${left}`,
        tone: "you",
      };
    }
    return { text: `${bot} выбирает планету…`, tone: "bot" };
  }
  if (step.type === "attack") {
    return step.player === "human"
      ? { text: "Ваш ход. Выберите вражескую планету — вопрос будет из её сектора", tone: "you" }
      : { text: `${bot} выбирает цель…`, tone: "bot" };
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

export function revealTitle(
  state: MatchState,
  reveal: Reveal,
): { title: string; subtitle?: string; tone: "good" | "bad" | "neutral" } {
  const o = reveal.outcome;
  const bot = state.config.opponent.name;
  const you = (p: PlayerId) => p === "human";
  switch (o.type) {
    case "expansion": {
      const { human, bot: b } = o.picks;
      if (!human && !b) return { title: "Никто не угадал", subtitle: "Планеты остаются свободными", tone: "neutral" };
      const parts = [
        human ? `вам ${human} ${plural(human, ["планета", "планеты", "планет"])}` : null,
        b ? `сопернику ${b}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return {
        title: reveal.winner === "human" ? "Раунд ваш" : "Раунд за соперником",
        subtitle: `Захват: ${parts}`,
        tone: reveal.winner === "human" ? "good" : "bad",
      };
    }
    case "tiebreak-needed":
      return { title: "Оба правы", subtitle: "Решающий числовой вопрос: побеждает самый точный", tone: "neutral" };
    case "captured": {
      const name = planetName(state, o.battle.target);
      return you(o.battle.attacker)
        ? { title: `${name} ваша`, subtitle: "Отвоёванная планета стоит на 100 очков больше", tone: "good" }
        : { title: `${bot} забирает ${name}`, tone: "bad" };
    }
    case "shield-down":
      return you(o.battle.attacker)
        ? { title: "Щит столицы пробит", subtitle: `Осталось щитов: ${o.shieldsLeft}`, tone: "good" }
        : { title: "Ваш щит пробит", subtitle: `Осталось щитов: ${o.shieldsLeft}`, tone: "bad" };
    case "capital-fell":
      return you(o.battle.attacker)
        ? { title: "Столица пала", subtitle: "Вся система ваша", tone: "good" }
        : { title: "Ваша столица пала", tone: "bad" };
    case "defended": {
      const name = planetName(state, o.battle.target);
      return you(o.battle.defender)
        ? { title: `${name} устояла`, subtitle: "+100 за оборону", tone: "good" }
        : { title: "Атака отбита", subtitle: `${name} остаётся за соперником`, tone: "bad" };
    }
    case "finale": {
      const d = o.deltas;
      return {
        title: d.human > 0 ? "Ставка сыграла" : d.human < 0 ? "Ставка сгорела" : "Без ставки",
        subtitle: `Вы ${signed(d.human)} · соперник ${signed(d.bot)}`,
        tone: d.human > 0 ? "good" : d.human < 0 ? "bad" : "neutral",
      };
    }
  }
}
