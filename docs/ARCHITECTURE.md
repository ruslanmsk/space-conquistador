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
- Действия: `ANSWER` (value `null` = не успел), `CONTINUE` (закрыть разбор), `PICK` (выбор планеты), `ATTACK`.
- `state.step` — что происходит сейчас:

```
question → reveal → (pick … | следующий вопрос)          фаза expansion
attack → question(battle) → reveal → [question(tiebreak) → reveal] → attack …   фаза battle
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
- Тема: `src/theme/colors.ts`, внешний вид планет: `src/theme/planets.ts`.

## Расширение под онлайн

Те же `GameAction` станут сообщениями WebSocket; сервер держит `MatchState` и `ctx` (с ответами), клиентам уходит состояние без `QuestionRecord`.
