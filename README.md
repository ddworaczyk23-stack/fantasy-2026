# Draft Day Command Center

A local-first, offline draft assistant for a 12-team full-PPR 1-QB redraft league.
It does not run a mock draft for you. It tells you **who to take, why, and whether
you can wait** — recomputed every time the board changes.

Everything runs in your browser. No backend, no API keys, no paid data feeds.

---

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173

Other commands:

```bash
npm run test        # run all 145 tests once
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
npm run build       # production build into dist/
npm run preview     # serve the production build
```

---

## What it does

**Draft Room** — the screen you live on during the draft.

| Panel | What it answers |
| --- | --- |
| Draft Now | The single best pick, with score, confidence, risk flags, and reasons |
| Best Alternatives | 4-6 viable options, each labelled SAFE FLOOR / HIGH UPSIDE / BALANCED |
| Can I Wait? | Per target: TAKE NOW, LIKELY GONE, POSSIBLE VALUE NEXT ROUND, SAFE TO WAIT |
| Tier Alert | How many players are left in each position's current tier, and which cliff is about to break |
| Draft Room Read | Which teams pick before you, what they need, and which positions will be gone |
| Avoid / Caution | Players whose market price is well above your board, plus an accidental-reach guard |
| Strategy Explanation | The full auditable reason for the recommendation, in plain English |

**My Team** — starters vs bench, depth chart, build diagnosis, bye conflicts,
strengths and vulnerabilities, and priorities for your next three picks.

**Rankings & Tiers** — editable board, rank overrides, tier edits, player tags,
CSV import and export.

**League Intel** — every team's roster and needs, position run trends,
ADP-versus-actual variance, and who is competing for your target position.

**Settings** — league setup, roster slots, your exact pick numbers, decision-engine
weights, the DST/K rule, live Sleeper sync, import/export, and the Draft Day
Checklist.

---

## The decision engine

Every available player gets a transparent 0-100 **Draft Score**. Six weighted
components, all editable in Settings:

| Component | Default | What it measures |
| --- | --- | --- |
| Expert / consensus rank | 35% | Where the player sits on your board |
| Projected PPR opportunity | 20% | Projected points and role stability |
| Positional scarcity | 15% | Tier thinness and the drop to the next tier |
| Value vs Sleeper ADP | 15% | How far past ADP the player is falling |
| Roster-construction fit | 10% | Does he fill a starter hole |
| Upside / contingent value | 5% | Ceiling, handcuff and breakout profiles |

Then two adjustments: a **risk penalty** (scaled by risk score and injury notes,
heavier in early rounds) and a **run adjustment** (a bump when the player's
position is running hot or is likely gone before your next pick).

Then hard strategy rules, applied as capped multipliers so a genuinely huge
value never gets suppressed:

- D/ST and K are crushed until the final two rounds (override in Settings).
- In 1-QB, QB scoring is damped in rounds 1-5 — you will not be told to reach for one.
- A second QB or second TE before the last three rounds is damped.
- Rounds 1-3 favour an elite RB/WR foundation.
- Through round 5 the engine pushes you toward 4-5 combined RB/WR.
- After round 8 upside, handcuffs and breakout profiles get weighted up.
- Full PPR adds a bonus for high-target receivers and pass-catching backs.

The **Strategy Explanation** panel shows exactly which of these fired and with
what numbers. If you disagree with the pick, you can see why it happened and
change the weights.

---

## The board you are drafting from

The app loads **FantasyPros' 2026 PPR "Draft ALL Rankings" export (08/26/2026)**
by default — 521 players across every position, real overall rank, real ADP,
real bye weeks, and real per-position upside/bust ratings.

The raw file lives at
[`src/data/raw/fantasypros-2026-all-rankings.csv`](src/data/raw/fantasypros-2026-all-rankings.csv).
Editing it updates the board. No code changes, no build step.

### What's real and what's derived

Almost everything in this file is real market data, used as-is:

- **Overall rank** — the file's own `RK` column. Not re-sorted or re-derived.
- **ADP** — recovered from the file's `ECR VS. ADP` delta (`ADP = RK + delta`).
  A player going 21 picks ahead of his rank (Derrick Henry) or 48 behind it
  (Sam Darnold) shows up correctly in the value-vs-ADP signal.
- **Bye week** — straight from the file.
- **Upside / risk** — from the file's Upside and Bust star ratings.

Only two things are derived, because the sheet doesn't provide them:

- **Per-position tiers.** The file's own `TIERS` column spans every position
  at once (tier 4 might hold a QB, three RBs, and a WR together), which
  doesn't map onto this app's per-position tier model. Tiers are re-cut per
  position on real ADP, using the same value-over-replacement math draft
  analysts have used since Value Based Drafting — calibrated on the starter
  range for **your** team count and lineup, so quarterbacks correctly slide
  (Josh Allen lands around pick 22, not pick 3) and kickers/defenses correctly
  sink toward the bottom.
- **Floor.** The sheet has no floor rating, so floor is estimated as the
  inverse of the Bust rating.

The Rankings screen states plainly which fields are real and which are
estimated, and lets you tag players target / fade / sleeper if you disagree
with the inferred tags.

---

## Loading different rankings

**A FantasyPros CSV export works as-is** — no editing. Download their draft cheat
sheet or rankings CSV and upload it in **Rankings & Tiers**. The app detects the
FantasyPros layout (`RK`, `TIERS`, `PLAYER NAME`, `TEAM`, `POS`, `BYE WEEK`),
splits `WR12` into position plus positional rank, maps `DST`/`DEF` and `K`, drops
their attribution line, and renumbers their overall tiers into per-position tiers.
Their CSV exports usually carry bye weeks, which turns the bye panel on.

**Your own board.** Use **Download blank template**, or grab
[`public/rankings-template.csv`](public/rankings-template.csv):

```
name,team,position,bye,overallRank,posRank,tier,adp,projPoints,upside,floor,
risk,notes,tags,rationale,customRank
```

Only `name` and `position` are required. Missing `overallRank` is inferred from
ADP order; missing `posRank` and `tier` are derived. `tags` is pipe-separated
(`high-target|target`). Fields containing commas must be double-quoted.

**Edit in place.** Rankings & Tiers lets you set a `customRank` override, nudge
players up and down, change tiers, and tag players target / fade / avoid-at-cost
/ sleeper / injury-concern. `customRank` always beats `overallRank` in the engine.

The Rankings screen also has **Load FantasyPros 2026 board** and **Load demo
sample board** if you want to start over. The header badge always names which
board is live.

Back your board up the night before with **Settings → Export state JSON**.

---

## Draft day: the fastest manual workflow

Setup, five minutes before the draft:

1. Settings → confirm teams, scoring, roster slots.
2. Settings → confirm **My pick numbers**. This field overrides snake math, so
   type your real picks if your league's board is unusual.
3. Rankings → upload your CSV.
4. Settings → **Reset draft** to clear any test picks.
5. Work the Draft Day Checklist at the bottom of Settings.

During the draft, one habit: **every pick anyone makes, you enter it.** The
recommendation is only as good as the board state.

- Press `/`, type 3-4 letters of the name, press `Enter`. That marks the top
  match as drafted by whichever team owns the current pick.
- Or click the draft action on the player's row.
- Wrong player, or the room skipped someone? Press `u` to undo.
- When it is your turn, the header flips to a large **YOUR PICK** state. Press
  `d` to take the recommended player, or click any alternative.
- `?` shows the full shortcut list.

State saves to your browser automatically after every action. Closing the tab
does not lose the draft. If you want a hard backup mid-draft, Settings →
Export state JSON.

---

## Sleeper sync: it works

Sleeper's read API is public, unauthenticated, and CORS-open, so the browser
calls it directly. No API key, no password, no proxy, no backend. Nothing
secret is stored.

**Settings -> Sleeper Sync**, four buttons in order:

1. **Connect account** - type your Sleeper username, resolves your user ID.
2. **Find my leagues** - lists your leagues for the season; click Use to pick one.
   (Or paste the league ID straight from the Sleeper app URL.)
3. **Import league settings** - pulls team count, rounds, scoring, roster slots,
   snake/third-round-reversal, every manager's name, and **your real draft slot**
   from the Sleeper draft order. This overwrites the manual pick-number override.
4. **Sync draft picks** - pulls every pick made so far onto your board.

Then tick **Auto-sync** and the app polls during the draft. Minimum 5 seconds;
the default 8 makes about 7 calls a minute against Sleeper's 1000/minute limit.

**How picks are matched.** Each Sleeper pick carries the player's first name,
last name, position and team, so there is no 5MB player-ID file to download.
Matching goes strictest-first: name + position + team, then name + position,
then an unambiguous name alone. Defenses match on team only, never on name.

The cheat sheet abbreviates first names (`P. Mahomes II`, `A. St. Brown`,
`J. Smith-Njigba`) while Sleeper always sends the full name, so there is one more
step: first initial + surname, but **only** when position and team both agree and
the result is unique. `Patrick Mahomes / QB / KC` matches `P. Mahomes II`;
`Patrick Mahomes / QB / BUF` matches nothing rather than something wrong.

**A pick that cannot be matched is never guessed at.** It gets listed in the
Sleeper panel by name, and you draft that player manually. Silently mismatching
a pick would be worse than telling you about it.

**It stays a convenience, not a dependency.** Sync is idempotent - running it
twice gives the same board. Every request has a timeout. If the network drops
mid-draft, manual entry keeps working exactly as before.

Set **Data source** to Mock to exercise the whole flow offline with canned data.

---

## Project layout

```
src/
  types.ts              shared type contract - everything codes against this
  engine/               pure, deterministic decision engine (no React)
    defaults.ts           default league settings and weights
    picks.ts              snake / pick-number math
    availability.ts       who is left
    tiers.ts              tier states and cliff alerts
    roster.ts             roster analysis, build style, team needs
    room.ts               positional runs and draft room read
    wait.ts               survival probability and can-I-wait verdicts
    score.ts              the Draft Score
    cautions.ts           reach and overpay warnings
    recommend.ts          assembles the full recommendation
    __tests__/            unit tests
  data/                 SAMPLE player board and sample league
  services/             localStorage persistence, CSV, Sleeper placeholder
  store/                zustand store + engine hooks
  views/                the five screens
  components/           shared UI pieces
docs/CONTRACT.md        internal API contract between modules
public/rankings-template.csv
```

The engine is pure functions with no React, storage or clock dependencies, which
is why it can be unit tested.

`npm run test` runs 145 tests across five layers:

- **Engine** - pick and snake math, tier states and cliff alerts, can-I-wait
  probability, the Draft Score strategy rules, and full recommendations.
- **Endgame and alert quality** - D/ST and K never surface before the final two
  rounds, and they are *forced* once the picks remaining no longer exceed the
  mandatory slots still empty. Tier alerts never compare against QB/DST/K, never
  tell a 1-QB drafter to prioritise QB early, and never exceed three at once.
- **App** - the CSV parser round-trips, FantasyPros exports import correctly,
  the sample draft simulator is deterministic and takes the top of the board,
  and the real UI mounts in a DOM where every tab renders, drafting advances the
  pick, and undo restores state.
- **The board** - the cheat sheet parses to exactly 372 players, positional order
  is preserved, QB/K/D-ST are kept out of round 1, K and D/ST sort below every
  skill player, tiers are real groups rather than one player each, and the engine
  produces a legal RB/WR-first draft off the real board.
- **Sleeper sync** - name normalisation across suffixes, punctuation and
  abbreviated first names,
  defense-by-team matching, unmatched picks reported rather than dropped, no
  player drafted twice, idempotent re-syncs, and league/roster/scoring mapping.

---

## Honest limits

- The bundled board is FantasyPros' real positional ranking, but the **overall
  order, tiers and projected points are derived** from it, not published by
  FantasyPros. They are estimates whose job is ranking the decision, not
  predicting the season.
- Refresh the cheat-sheet text file before draft day. Rankings from 08/26/2026 go
  stale fast once preseason news lands.
- Survival probability is a calibrated heuristic over ADP, positional runs and
  opponent needs. It is directionally useful, not a guarantee.
- No live news or injury feed.
- Sleeper sync is real, but it is still a convenience layer. Manual entry is the
  path that cannot break while you are on the clock.
