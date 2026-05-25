# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The repo is intentionally **spec only**. A previous Streamlit prototype was
removed because the stack turned out to be a poor fit (brittle Plotly click
handling, no UI test story, forced single-process deployment). The
stack-agnostic design lives in `DESIGN_NOTES.md` — read it before suggesting
any implementation work. There is no `ludo/` package, no `app.py`, no tests,
and no `pyproject.toml` right now.

## What this project is

Cheeky Ludo — a 4-player Ludo game intended for self-hosting on a personal VM
and playing with friends. The novel twist is the **Cheeky** bot mode where
the *dice itself* is dishonest: a hidden controller silently favors or
sabotages random players with effects like lucky sixes, stuck on ones,
guaranteed kills, then reveals what happened after the game ends.

## When the user asks to start implementing

1. Confirm the target stack with the user first — the previous attempt was
   Streamlit; we explicitly do not want that again. Don't pick a stack
   unilaterally.
2. Treat `DESIGN_NOTES.md` as the source of truth for rules, bot behavior,
   the five Cheeky favor kinds, and the concurrency expectations. If
   anything in the notes seems off, ask before deviating — those decisions
   were deliberate.
3. The single-process-by-design constraint of the prior implementation was
   a Streamlit artifact, not a product requirement. The next stack should
   make the storage layer pluggable so an in-memory store works for local
   play but can be swapped for Redis / SQLite later without rewriting the
   game engine.
4. Keep the engine (`board`, `state`, `engine`, `favor`, `bots`,
   `lifecycle`, `turn` — names from the previous attempt are a reasonable
   starting point) free of any UI / framework imports so it stays
   unit-testable in isolation.

## When the user asks about the previous implementation

The git history has it — `git log --all` shows the Streamlit commits and the
revert. Don't try to recover the deleted files from the working tree; read
them from git if needed (`git show <commit>:<path>`).

## Things not to propose

- Reintroducing Streamlit.
- A database / Redis as a hard dependency for local play. In-memory must
  remain a supported mode for a friends-only deployment.
- Horizontal scaling / multi-replica deployment as the default story.
  This is a small game for a handful of friends, not a service.
