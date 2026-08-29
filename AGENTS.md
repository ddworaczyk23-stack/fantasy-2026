# Draft Day Command Center — Codex entry point

Full project context lives in [README.md](README.md) — read that first (what
this is, how to run it, the panel layout). This file adds Codex-specific
guidance on top of it.

## Before starting

Read `docs/handoffs/active.md` for the current task and what Claude (or a
previous Codex session) already did. Update it when you finish — what
changed, what's done, what's next.

## Role on this project

Default to bulk/mechanical work: test scaffolding (there are 145 tests —
keep them green), formatting, mechanical refactors, boilerplate. Draft-logic
changes — scoring, the recommendation engine, anything that decides who to
take and why — are Claude's job. Flag it in `docs/handoffs/active.md` rather
than improvising.

When a task calls for Claude's planning, architecture, or cross-file
orchestration role, proactively tell David that switching back to Claude is
recommended rather than continuing in Codex for convenience.

## Hard constraints — do not violate these

- **Local-first and offline.** No backend, no API keys, no paid data feeds.
  Do not introduce a network dependency for core function.
- Run `npm run typecheck` and `npm run test` before calling anything done.
- **Never push directly to a deployed environment without confirmation.**
  Draft and explain changes; let David decide when to ship.
