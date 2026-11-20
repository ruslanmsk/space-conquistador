# Space Conquistador: UX, mechanics and visual research

Research for the redesign. The core loop stays (expansion, then battle turns, capital with shields, win on score). This doc is opinionated: each section ends in a decision. Sources are linked inline. Timings marked *(convention)* are practitioner defaults to tune on a device, not measured findings.

Already in `game-core` (checked `packages/game-core/src/types.ts`, `bot/opponents.ts`): the attacker picks a category from N options, bots have `strong`/`weak` category profiles, `fifty`/`range` boosters come from streaks and `outpost` planets, plus a campaign list of opponents. The recommendations below build on that. They do not replace it.

---

## Recommendations — TL;DR

**Answer moment and juice**
1. **Timer is 15 s for multiple choice and 20 s for numeric, and it starts only after a reading beat.** The question appears alone for `clamp(words × 150 ms, 1.2 s, 3 s)`, then the answers slide in and the clock starts. Score speed the way Kahoot does: `points × (1 − t/T/2)`. A fast answer is worth more, but a slow correct answer still earns at least half.
2. **Fixed reveal sequence of about 2.6 s:** tap (80 ms squash plus a light haptic) → lock and dim the other answers → 400 ms silent beat → the opponent's pick appears → the correct answer is revealed with a sound and Confirm/Reject haptic → time chips ("1,8 с vs 3,2 с") → a 700 ms planet capture on the map. Never leave dead air after the timer reaches zero.
3. **Do not use red and green for right and wrong.** The right answer fills gold and gets a check glyph. A wrong pick gets an outline, a cross glyph and a shake. Player colors are vermilion and cobalt, and each also gets a pattern.

**Strategy layer (pick these 4)**
1. **Sectors as terrain.** Every planet belongs to a category sector, and attacking it asks a question from that sector. Category choice moves out of a menu and onto the map. The bot's strong and weak sectors are shown before the match.
2. **Planet value tiers.** Ordinary planets are worth 200, two or three "core worlds" are worth 400, and the capital is worth 1000 with 3 shields. Outposts stay as booster sources. This creates hotspots worth fighting over.
3. **Two one-shot boosters per match, picked before it starts** from 4: Сканер (50/50), Пеленг (numeric range), Щит (the planet must be won twice), Гиперпрыжок (attack a non-adjacent planet). Drop "extra time" and "skip".
4. **"Ва-банк" final question.** After the last battle turn, each side bets 0–50 % of its score on one question from a revealed category. This is a comeback that is visible and has to be earned. Skip hidden rubber-banding.

**Meta (minimal)**
- A **campaign of 5 star systems × 3 commanders**, with a boss in each. This replaces a rank ladder, because a ladder against bots is fake.
- **"Сигнал дня":** one seeded daily match that is the same for everyone, with a shareable result grid and a streak that counts daily matches only.
- **Per-category stats** on the profile, which feed the sector strategy. Achievements come later and stay at 12 or fewer.

**Visual direction: "Космоплакат"** (direction A). A 1960s print-poster look: deep ink map, cream paper question card, vermilion and cobalt players, gold for "correct". Flat planets built from 2–3 clipped shapes with misregistered offset shadows and halftone dots. Typography is **Unbounded** for display, **Golos Text** for UI and body, and **IBM Plex Mono** for numbers. No gradients, no glass, no emoji. Corners are 2–4 px and diagonals run at 15°.

**Layout:** the map takes the top ~40 % and shrinks to a "battle strip" during a question. The question card and **4 full-width stacked answer buttons (≥56 dp)** sit in the bottom 55 %. Numeric questions use a custom keypad, not the system keyboard. Target lengths are ≤120 characters per question and ≤40 per answer.

---

## 1. What makes the answer moment feel good

### What successful titles do
- **QuizUp:** 7 rounds, 10 s each, up to 20 points per question scaled by speed, and the last round is worth double ([PCWorld](https://www.pcworld.com/article/2104701/you-should-play-quizup.html), [TNW](https://thenextweb.com/news/quizup-iphone-wants-biggest-triva-game-world)). The format is short and has a built-in climax. *Take:* a doubled final beat.
- **HQ Trivia:** 10 s per question, partly to stop people googling answers ([Wikipedia](https://en.wikipedia.org/wiki/HQ_(video_game))). Critics said 10 s was barely enough to read and answer. *Take:* 10 s is too short for long Russian answer options.
- **Trivia Crack:** about 20–30 s per question ([AppleVis report](https://applevis.com/forum/ios-ipados-gaming/reduced-timer-trivia-crack), [TouchArcade](https://toucharcade.com/2015/02/03/trivia-crack-is-like-that-addictive-drug-whose-name-escapes-me/)). Power-ups are bomb (removes 2 wrong answers), double chance, +15 s and skip, with one per question ([help center](https://triviacrack.help.etermax.com/hc/en-us/articles/360024775733-Power-ups)). *Take:* power-ups that just buy time are boring.
- **Kahoot:** the score is `(1 − (t/T)/2) × max`, and an answer in under 0.5 s gets the full score ([Kahoot support](https://support.kahoot.com/hc/articles/115002303908)). The reveal shows the distribution of answers. The team's Answer Streak experiment set out to reward accuracy over rushing ([Inside Kahoot](https://medium.com/inside-kahoot/experimenting-with-answer-streaks-to-help-make-learning-awesome-3b3357e42595)).
- **Triviador Duel:** the closest guess wins numeric questions and the faster answer breaks a tie. A defender who wins by answering first gets +100. Castle towers fall one per won battle ([rules](https://help.triviador.com/en/support/solutions/articles/66000496612)).
- **Duolingo:** distinct sounds and colors for right and wrong, a character animation on correct answers, and the principle that every animation needs a "beat" even with the sound off ([UX Planet analysis](https://uxplanet.org/analyzing-duolingo-from-product-design-perspective-after-400-days-of-non-stop-practice-c4d4809bdb37), [Duolingo blog](https://blog.duolingo.com/world-character-visemes)).

### Timer
- MCQ 15 s, numeric 20 s (game-core default is already 15 s). A 5 s timer feels impossible and 15 s builds suspense without punishing the player ([Typito](https://typito.com/blog/why-timers-in-trivia-videos-work-and-how-to-use-them-well/)).
- **Reading beat first.** Adult silent reading in English averages about 238 wpm ([Brysbaert 2019](https://www.Gwern.net/doc/psychology/linguistics/2019-brysbaert.pdf)). Russian words are longer, and the multilingual IReST average is about 184 wpm read aloud ([IReST](https://research.utu.fi/converis/portal/detail/Publication/21515307?lang=en_GB)). So budget about 250–330 ms per word. Show the question alone for `clamp(words × 150 ms, 1.2 s, 3 s)` (a partial pre-read), then stagger the answers in at 60 ms each and start the clock. This makes the race about knowledge, not reading speed.
- Show the timer as a **draining bar** along the top edge of the question card, not a number. At 5 s left, change its color and add a soft tick sound every second. On Android, use the `Clock_Tick` haptic only for the last 3 s.

### Reveal sequence (target timings)
| t (ms) | Event | Feedback |
|---|---|---|
| 0 | Tap | Button scales to 0.96 over 80 ms and springs back *(convention)*. `selectionAsync` haptic |
| 0–150 | Other answers fade to 40 % | Choice locked. Small "ваш ответ" tag |
| — | Waiting for the bot | Show "Противник думает…". The bot's reply time is simulated, so the wait is capped at the timer |
| +0 | Both have answered, or time is up | **Start the reveal immediately.** A gap after zero breaks tension ([Typito](https://typito.com/blog/why-timers-in-trivia-videos-work-and-how-to-use-them-well/)) |
| +400 | Silent beat ends. Opponent's marker slides onto its pick (200 ms) | A pause before the result makes the outcome hit harder ([CGM](https://www.cgmagonline.com/articles/how-games-to-build-player-tension/)) |
| +700 | Correct answer fills gold with a check. A wrong pick shakes (3 swings of ±6 px over 300 ms) | Rising two-note chime or a low dull thud. Haptic `Confirm`/`Reject` |
| +1100 | Time chips appear under each avatar | Rewards speed and explains who won |
| +1900 | Card slides down 300 ms, map grows | — |
| +2200 | Capture: the attacker's color sweeps across the planet in 700 ms, score counts up over 500 ms | Heavier haptic only on a capture or a shield break |

- **Numeric reveal** uses a horizontal **number line**. Both guesses drop as pins, then the true value falls in with a thump and distance bars draw between the pins. This is the best tension moment in the game, so give it about 1.5 s more than MCQ.
- After the reveal, show the `fact` field as a one-line tidbit under the correct answer. Players can read it while the map animates, so it adds no time.

### Haptics and sound (Expo)
- On Android, use `Haptics.performAndroidHapticsAsync` (`Confirm`, `Reject`, `Clock_Tick`, `Segment_Tick`). It maps to system haptics and Expo recommends it over `impactAsync`/`notificationAsync`, which run through the plain Vibrator ([Expo docs](https://docs.expo.dev/versions/latest/sdk/haptics/)). Android's guidance: keep effects short and crisp rather than buzzy, and scale strength with the event's importance ([Android haptics](https://developer.android.com/develop/ui/views/haptics/haptic-feedback), [AOSP UX](https://source.android.com/docs/core/interaction/haptics/haptics-ux-foundation)).
- Use about 8 sounds in total: tap, tick, correct, wrong, capture, shield break, win, lose. Use one instrument family, for example soft synth and mallet, to match the poster theme. Add separate settings toggles for sound and haptics.
- Honor reduced motion (`AccessibilityInfo.isReduceMotionEnabled`): replace sweeps and shakes with short crossfades.

---

## 2. Strategy layer: depth without slowing the match

Budget: 3 expansion rounds plus 8 battle turns, about 12–14 questions including tiebreaks. At about 25–30 s per cycle that comes to **6–7 min**, which fits the 5–7 min session norm for mobile ([PocketGamer.biz](https://www.pocketgamer.biz/lets-trade-short-session-lengths-for-games-with-depth-argues-quark-games)). Each addition below has to fit inside that budget. Design rule taken from Into the Breach: cut ideas that the UI can't show clearly ([Game Developer](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-)).

| Idea | Why it's fun | Cost | Bloat risk | Verdict |
|---|---|---|---|---|
| **Sectors as terrain** (planet ⇒ category) | Target choice becomes a knowledge bet: "attack where I'm strong and he's weak". The map carries the strategy. | Low: assign `category` to each planet and draw a sector glyph | Low. It replaces the category picker, so it removes a screen | **Yes** |
| **Planet value tiers** (200 / core 400 / capital 1000) | Creates hotspots and makes expansion picks matter | Low | Low | **Yes** |
| **Pre-match booster loadout** (2 of 4) | A decision before the match, and a memorable "clutch" moment during it | Medium: Shield and Hyperjump touch the rules | Medium if more than 4 exist | **Yes, capped at 4** |
| **Ва-банк wager finale** | A clear climax with real comeback potential. Wager logic is a well-known puzzle ([Final Jeopardy betting](https://thejeopardyfan.com/final-jeopardy-betting)) | Low: one screen with a slider | Low | **Yes** |
| Defender bonus (+100 for a faster correct defense, as in Triviador) | Gives the defender something to do | Very low | Low | Keep as is |
| Telegraph bot intent (show the bot's target one turn ahead) | Like Slay the Spire and Into the Breach: the player can plan, and Shield becomes meaningful | Low | Low | Yes, folded into the Shield booster |
| Extra time / skip power-ups | Mostly removes friction rather than adding a decision | Low | Medium: dilutes the other boosters | **No** |
| Hidden rubber-banding (bot gets dumber when you lose) | Keeps matches close | Low | **High.** Players notice and resent hidden manipulation ([Law of Game Design](https://lawofgamedesign.com/2014/08/25/theory-rubber-bands/)) | **No.** Use the visible wager instead |
| Planet abilities (production, research…) | 4X flavour | High | High: needs text and tutorials | No (maybe a later mode) |
| Answer-streak multiplier | Rewards consistency | Low | Medium: overlaps with the boosters that streaks already grant | Keep streak → booster, no multiplier |

### Details of the recommended set
- **Sectors:** use 5–6 sectors per map, each drawn as a soft hull behind its planets with a glyph such as a quill (Литература) or a flask (Наука). Expansion picks are also sector bets. **Content risk:** the bank has 47 questions, all in "Космос". Sectors need at least about 150 questions per category to avoid visible repeats. This content is the real bottleneck, more than any code.
- **Boosters:** *Сканер* (50/50) and *Пеленг* (numeric range) already exist. Add *Щит*: put it on your planet and the attacker must win twice. Add *Гиперпрыжок*: one attack on a non-adjacent planet, similar to Triviador's late-game "Magic Wings". Allow one use per question and two per match. Outposts grant an extra charge.
- **Ва-банк:** reveal the category first, then both sides bet 0–50 % of their score. A correct answer adds the bet and a wrong one subtracts it. The bot bets by formula: the leader makes a cover bet and the trailing side goes big, which is the Final Jeopardy logic. Comebacks should come from the player's choices, not handouts ([Bugnet](https://bugnet.io/blog/how-to-design-a-comeback-mechanic)). A wager is exactly that kind of choice.

---

## 3. Meta that brings people back (single-player vs bot)

- **Campaign = progression.** 5 star systems × 3 commanders, with the last one a boss. Each commander is an `Opponent` with a sector profile, a hand-made map (one new sector layout per system) and 1–3 stars for winning, winning by margin, or winning without losing the capital. Do not add an Elo ladder: rank points against a bot feel fake.
- **Daily challenge, "Сигнал дня".** One seeded match (same map, bot and questions for everyone) per day. Wordle's one-per-day scarcity and shared puzzle drove conversation, and the spoiler-free share grid let it spread ([Game Developer: Josh Wardle](https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success)). Share text could be a row of 12 squares (■ won / □ lost) plus the score, with no answers.
- **Streak only for the daily.** Duolingo found that learners on a 7-day streak are 2.4× likelier to come back the next day, and that letting learners hold 2 streak freezes slightly *raised* daily activity ([Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit), [Improving the streak](https://blog.duolingo.com/improving-the-streak)). Grant 1 free freeze per week.
- **Per-category stats:** accuracy and average answer time per sector on the profile. This feeds the sector strategy directly ("my weak sector is Музыка") and costs almost nothing.
- **Later:** 10–12 achievements tied to the mechanics, for example "Взять столицу с первой атаки" or "Ва-банк из-за спины". No currency shop.

---

## 4. Visual direction

**Avoid** the known "AI-generated UI" tells: purple-blue gradients (`#667eea → #764ba2`), glass cards, emoji icons, Inter everywhere, cards nested in cards, centered hero layouts ([Fountain Institute](https://pages.thefountaininstitute.com/posts/7-tells-that-a-ui-is-ai-generated), [UX Collective](https://uxdesign.cc/how-to-de-slopify-your-designs-4c40c57c1dc9)). Also avoid the default "space" fonts **Orbitron** and **Audiowide**. Neither has Cyrillic on Google Fonts (checked against the GF metadata).

**Cyrillic quality check** (type.today reviews of Google Fonts): rated **good** are Golos Text, IBM Plex Sans, Commissioner, Arsenal, Tektur (minor flaws), Oi and Kablammo. Rated flawed or poor are Inter, Manrope, Roboto, Jura, Exo 2, Play and Dela Gothic One ([neo-grotesques](https://type.today/en/journal/neo), [humanist](https://type.today/en/journal/humanist), [display](https://type.today/en/journal/display), [geometric](https://type.today/en/journal/geo)). Unbounded (NaN) and Onest have Cyrillic but were not in those reviews, so check their specimens before committing.

### A. "Космоплакат": retro-futurist print poster ★ recommended
Inspired by the *approach* of 1958–63 space-age posters (flat colour fields, warm accents on deep blue, heroic diagonals), not any specific poster ([Scientific American](https://www.scientificamerican.com/article/the-lost-worlds-of-soviet-space-graphics-slideshow/), [Open Culture](https://www.openculture.com/2019/08/the-glorious-poster-art-of-the-soviet-space-program-in-its-golden-age-1958-1963.html)), plus print texture.
- **Palette:** ink `#151B2E` (map background), paper `#F1E6D0` (question card and panels), vermilion `#E8552D` (player), cobalt `#3D8FD9` (bot), gold `#F4B63F` (correct / highlight), neutral planet `#737D91`, deep-ink text `#1F2A44`. Contrast: paper on ink 13.8:1, vermilion on ink 4.7:1, cobalt 5.0:1, neutral 4.1:1. On paper, use the darker variants `#C23B1A` (4.3:1) and `#1F5FA6` (5.2:1) for player-coloured text.
- **Type:** Unbounded 700–900 for headings, the score and "ВА-БАНК". Golos Text 400–600 for questions and answers. IBM Plex Mono for timers, numbers and the number line. If Unbounded fails the check, use Tektur.
- **Shapes:** hard edges, 2–4 px radii, 15° diagonals on banners and buttons, thick 2 px ink rules. Buttons are paper slabs with a 3 px solid offset shadow, no blur.
- **Planets in SVG:** a base `<circle>` plus 1–2 bands or crescents clipped by `<clipPath>` to the circle. Add a second copy of the outline offset by (2, 2) px in the owner's colour at 0.9 opacity (the misregistration effect), and a halftone `<pattern>` of dots on the shadow side. Owner shows as the fill colour **plus** a pattern: player gets solid fill with a diagonal-stripe ring, bot gets solid fill with a dotted ring. The capital gets 3 notched shield arcs. Draw lanes as straight 2 px dashed lines and sectors as pale paper hulls at 8 % opacity. Add a static starfield of 40 dots in 2 sizes, with no glow.

### B. "Звёздный атлас": navigational chart / transit diagram
Linework on dark chart paper, close to Mini Metro's transit-map clarity ([Game Developer](https://gamedeveloper.com/design/video-behind-the-minimalistic-visual-design-of-i-mini-metro-i-)). Polytopia's lesson applies too: visuals carry the information ([Mobidictum](https://mobidictum.com/christian-lovstedt-midjiwan-polytopia-minimalism/)).
- Palette: chart `#0E2233`, line `#E9E1CC` (12.4:1), amber `#F0A202` (player, 7.6:1), cyan `#4FC3D9` (bot, 7.8:1), grid `#6E8496`.
- Type: IBM Plex Sans with IBM Plex Mono.
- Shapes: monoline 1.5 px, outlined planets with hatching for ownership, 45°/90° lanes, coordinate labels with leader lines. Very readable, but calm. It risks feeling too "dashboard" for a casual game.

### C. "Ризограф": light zine / riso print
Paper `#F3EEE3`, riso-style blue `#0078BF` and orange `#FF6C2F`, black `#1D1D1B`, yellow `#FFE800`. Multiply overprint, grain via `feTurbulence`, misregistration ([riso reference](https://chrislemke.github.io/website_designs/examples/Risograph.html)). Type: Unbounded with Commissioner. This is the most distinctive option, but a light map loses the "space" read, and orange on paper is only 2.4:1, so orange has to stay a fill and never be used for text. Also, `feTurbulence` is costly in react-native-svg, so grain would need to be a pre-baked PNG.

**Why A:** it keeps the dark "space" read for the map, while the light paper card gives the best possible contrast for reading Russian. The poster language gives it a recognisable identity, and every element is a flat SVG primitive, so it's cheap in react-native-svg.

---

## 5. Mobile UX specifics

- **Thumb zone.** About 49 % of people use phones one-handed, mostly with the thumb, and the top corners are the hardest to reach ([Smashing](https://smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users)). Hoober's later advice is to keep primary actions out of the extreme edges rather than squeezing everything to the bottom ([Addy Osmani](https://addyosmani.com/blog/touch-friendly-design/)). So: answers sit in the bottom ~45 % with a 16 dp gap above the gesture bar, and nothing tappable goes in the top 15 % except pause.
- **Screen states (portrait 360×800 dp baseline):**
  - *Map turn:* the map fills the screen, the score sits in a top bar, and a hint at the bottom reads "Выберите планету для атаки". Tapping a planet opens a bottom sheet with its sector, value and shields, and a big "Атаковать" button. Planets get at least 48 dp hit areas even when drawn smaller ([Android a11y](https://support.google.com/accessibility/android/answer/7101858)).
  - *Question:* the map shrinks to a **battle strip** (about 120 dp tall: the two contested planets, avatars and a sector chip). The paper question card holds the question, then **4 full-width stacked buttons ≥56 dp tall with an 8 dp gap**. Avoid a 2×2 grid, because Russian answers wrap.
  - *Numeric:* a custom 3×4 keypad (keys ≥64 dp) with a unit label ("км", "год"), a live formatted value with thin spaces ("384 400"), and a full-width "Ответить" button.
- **Text budgets:** question ≤120 characters (about 15–18 words, at most 4 lines at 20 sp), answer ≤40 characters (2 lines at 17 sp). Enforce these in a content-lint script. Use `adjustsFontSizeToFit` only as a last resort, with a minimum of 16 sp.
- **Contrast:** text needs 4.5:1, large text and UI shapes need 3:1 ([Android a11y](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)). All of palette A's pairs above pass.
- **Colour-blind safety:** vermilion and cobalt sit on the blue–orange axis, which stays distinct for protan and deutan vision. It's the same logic as Okabe-Ito's `#E69F00` / `#0072B2` / `#D55E00` ([Okabe-Ito](https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference)). Always add a redundant cue: ring pattern on planets, an avatar initial on owned planets, and check and cross glyphs on answers. Never rely on red versus green.
- **One-handed flow check:** a whole match should be playable with the right thumb without regripping the phone. Test this in the browser at 360 px and on a real Android device with gesture navigation.

