import type { Opponent } from "../types";

/**
 * Campaign ladder: each commander is a bot with its own level and knowledge profile.
 * Knowing what an opponent is good at turns category choice in battle into a real decision.
 */
export const OPPONENTS: Opponent[] = [
  {
    id: "cadet",
    name: "Кадет Пиксель",
    title: "Только что из лётной школы. Путается, но старается.",
    level: "easy",
    strong: ["Кино и ТВ", "Технологии"],
    weak: ["История", "Литература"],
  },
  {
    id: "navigator",
    name: "Штурман Вега",
    title: "Знает каждую звезду и каждую реку. Остальное — хуже.",
    level: "normal",
    strong: ["География", "Космос", "Природа"],
    weak: ["Музыка", "Спорт"],
  },
  {
    id: "archivist",
    name: "Архивариус Орм",
    title: "Тысячу лет читал библиотеку станции. Медленный, но точный.",
    level: "normal",
    strong: ["История", "Литература", "Искусство", "Язык"],
    weak: ["Технологии", "Кино и ТВ", "Спорт"],
  },
  {
    id: "engineer",
    name: "Инженер Кобальт",
    title: "Считает быстрее бортового компьютера.",
    level: "hard",
    strong: ["Наука", "Технологии", "Космос"],
    weak: ["Искусство", "Еда", "Музыка"],
  },
  {
    id: "admiral",
    name: "Адмирал Нова",
    title: "Командует флотом сектора. Слабых мест почти нет.",
    level: "hard",
    strong: ["История", "География", "Спорт", "Наука"],
    weak: ["Еда"],
  },
];

export const DEFAULT_OPPONENT: Opponent = OPPONENTS[1]!;

export function getOpponent(id: string): Opponent {
  return OPPONENTS.find((o) => o.id === id) ?? DEFAULT_OPPONENT;
}
