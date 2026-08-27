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
npm run test        # run the engine + CSV unit tests once
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
weights, the DST/K rule, Sleeper Sync placeholder, import/export, and the
Draft Day Checklist.

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

## Before draft day: load your real rankings

The app ships with a board clearly labelled **SAMPLE 2026 PPR BOARD - NOT LIVE
DATA**. It is there so the tool is usable the second you open it. It is not
current data and it is not anyone's published rankings. Replace it.

Two ways:

**1. CSV import (recommended).**
Go to **Rankings & Tiers → Download blank template**, or grab
[`public/rankings-template.csv`](public/rankings-template.csv). Fill it with
whichever rankings you trust, then **Upload CSV**. The import previews its
errors and warnings before it replaces anything.

Columns:

```
name,team,position,bye,overallRank,posRank,tier,adp,projPoints,upside,floor,
risk,notes,tags,rationale,customRank
```

Only `name` and `position` are required. Missing `overallRank` is inferred from
ADP order; missing `posRank` and `tier` are derived. `tags` is pipe-separated
(`high-target|target`). Fields containing commas must be double-quoted.

**2. Edit in place.** Rankings & Tiers lets you set a `customRank` override,
nudge players up and down, change tiers, and tag players as target / fade /
avoid-at-cost / sleeper / injury-concern. `customRank` always beats
`overallRank` in the engine.

Do this the night before, then **Settings → Export state JSON** to back it up.

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

## Sleeper sync: what works today

**Today: manual mode only.** Settings has a Sleeper Sync section with fields
for username, league ID and season, and a four-state indicator — Not Connected,
Manual Mode, Ready for Import, Sync Available. The "Test connection" button
runs a **mock adapter** that returns canned data and says so.

Nothing calls Sleeper. No credentials are stored and none are needed.

**What a live adapter would need.** Sleeper's read API is public and
unauthenticated, so secrets were never the blocker. Three real problems are:

1. **CORS.** A browser-only app cannot rely on a third-party host allowing
   cross-origin reads. Making this reliable means a tiny proxy or a desktop
   shell — which breaks the "no backend" promise this app is built on.
2. **Player ID mapping.** Sleeper's player ids are its own. They have to be
   matched to your CSV's players by name, team and position, and name matching
   is where sync tools quietly go wrong mid-draft.
3. **Polling and drift.** A live draft needs frequent polling, and any dropped
   response or mismatched id silently corrupts the board state — exactly when
   you have 45 seconds to pick.

The code is ready for it: `src/services/sleeperAdapter.ts` defines the
`SleeperAdapter` interface, ships `mockSleeperAdapter`, and documents the single
call site to swap in a live implementation. Nothing else in the app knows or
cares which adapter it is talking to.

**Manual entry stays the primary workflow.** It takes about two seconds a pick
and it cannot silently desync.

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

`npm run test` runs 71 tests across three layers:

- **Engine** - pick and snake math, tier states and cliff alerts, can-I-wait
  probability, the Draft Score strategy rules, and full recommendations.
- **Endgame and alert quality** - D/ST and K never surface before the final two
  rounds, and they are *forced* once the picks remaining no longer exceed the
  mandatory slots still empty. Tier alerts never compare against QB/DST/K, never
  tell a 1-QB drafter to prioritise QB early, and never exceed three at once.
- **App** - the CSV parser round-trips, the sample draft simulator is
  deterministic and takes the top of the board, and the real UI mounts in a DOM
  where every tab renders, drafting advances the pick, and undo restores state.

---

## Honest limits

- The bundled player data is **sample data**. Import your own before drafting.
- Projections are estimates, not a model output. The engine's job is ranking the
  decision, not predicting the season.
- Survival probability is a calibrated heuristic over ADP, positional runs and
  opponent needs. It is directionally useful, not a guarantee.
- No live news, injury feed, or Sleeper sync. That is a deliberate trade for
  something that cannot break while you are on the clock.
