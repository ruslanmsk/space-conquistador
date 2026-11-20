# Архитектура

## Монорепа

```
apps/mobile          Expo SDK 58 (UI, навигация, haptics, сохранения)
packages/game-core   Чистый TS: правила, карта, вопросы, бот
content/questions    ru.json — банк вопросов
apps/api             (будущее) HTTP + WebSocket
```

`mobile → game-core`, `mobile → content` (JSON импортируется в бандл). `game-core` **не** зависит от React Native, Expo, DOM.

## game-core

Матч — неизменяемый `MatchState`; всё меняется только через `dispatch(state, action, ctx)`.

- `ctx: GameContext = { questions, rng }` — банк вопросов и генератор случайных чисел (в тестах `seededRng(seed)`).
- `createMatch(ctx, config)` — сразу возвращает матч с первым вопросом.
- Действия: `ANSWER` (value `null` = не успел), `BOOST` (50/50 или «Вилка»), `CONTINUE` (закрыть разбор), `PICK` (выбор планеты), `ATTACK`, `WAGER` (ставка в финале).
- Карта: у планеты `kind` (capital/world/giant/outpost) и сектор-категория `state.sectors[id]` (назначается случайно в `createMatch`). Вопрос атаки берётся из сектора цели.
- Соперник — `config.opponent` (`Opponent`: уровень + сильные/слабые категории), список в `bot/opponents.ts`.
- `state.step` — что происходит сейчас:

```
question → reveal → (pick … | следующий вопрос)          фаза expansion
attack → question(battle) → reveal → [question(tiebreak) → reveal] → attack …   фаза battle
→ wager → question(finale) → reveal                                               фаза finale
→ finished
```

- `reveal.next` хранит, куда перейти после `CONTINUE`, поэтому разбор ответа показывается всегда и ничего не «проскакивает».
- Варианты MCQ перемешиваются при выдаче (`choiceOrder`), в файле правильный ответ можно хранить первым.
- Во время активного вопроса UI видит только `PublicQuestion` (без ответа); правильный ответ появляется в `reveal`.
- Бот: `botAnswer` (точность и скорость по уровню и сложности вопроса), `botChoosePick`, `botChooseAttack`.
- Очки не хранятся, а считаются: `getScores(state)` = стоимость планет + бонусы обороны.

## Mobile

- **Expo Router**: `/` меню, `/rules` правила, `/match` матч.
- **Zustand** `useMatchStore`: держит `MatchState`, время начала вопроса и расписание ходов бота (таймеры). Правил не дублирует — только вызывает `dispatch`.
- Сохранение матча и настроек — AsyncStorage (`src/storage`). Незаконченный вопрос после перезапуска начинается заново.
- Карта — `react-native-svg`; нажатия — обычные `Pressable` поверх SVG (так стабильнее на вебе и удобнее на тач-экранах). Анимации колец — через `requestAnimationFrame`.
- Дизайн «Космоплакат»: токены `src/theme/colors.ts` и `src/theme/type.ts`, планеты `src/theme/planets.ts` + `components/PlanetArt.tsx`. Без градиентов и стекла в интерфейсе, жёсткие тени через `Slab`, верно = золото + ✓, игроки = вермильон/кобальт + второй признак (сплошное/пунктирное кольцо).
- Анимации интерфейса — Reanimated (entering, shake); анимации внутри SVG — `useProgress` (rAF).
- Звуки — `utils/sound.ts` (wav из `scripts/gen-sounds.py`), вибрация — `utils/haptics.ts`, обе отключаются в `/stats`.

## Расширение под онлайн

Те же `GameAction` станут сообщениями WebSocket; сервер держит `MatchState` и `ctx` (с ответами), клиентам уходит состояние без `QuestionRecord`.
