# Cheeky Ludo — Design Notes

The first attempt at this project used Streamlit, which turned out to be a poor
fit. The code has been removed. These notes preserve the **business logic** so
that a future implementation (any stack) can pick up where we left off.

The novel twist of this game is the **Cheeky** bot mode where the *dice itself*
is dishonest: a hidden controller silently favors or sabotages random players
with effects like lucky sixes, stuck on ones, guaranteed kills. The dishonesty
is revealed only after the game ends.

## Product shape

- 4-player Ludo, self-hosted, played with friends over a shared link.
- Up to 4 humans share a room; bots fill any empty seats when the host starts.
- The host picks one bot mode for the whole room (not per-seat).
- A room has a short code that is part of the URL so friends can join.

## Rule variants in force

These are the house rules — they differ from some other Ludo variants and any
re-implementation needs to keep them:

- 3 consecutive 6s **forfeits** the turn (no move applied).
- Must roll **exact** to finish; overshoot wastes that piece's move only.
- Two same-color pieces on a square form a **passive block**: immune to
  capture but allow opponents to pass through.
- Colored start squares are safe for **all** players, not just the owning
  color.
- A 6 OR a capture grants an extra turn.
- The game ranks all four players (`finish_order`). The game ends when 3 have
  finished; 4th place is implicit.

## Coordinate system (reference)

A piece position can be a single integer:

| Range | Meaning |
|-------|---------|
| `-1` (`YARD`) | In yard |
| `0..51` | Main track (shared absolute coordinates) |
| `100..105` | Own home stretch (6 squares) |
| `106` (`FINISHED`) | Finished |

- Per-color start offsets on the 52-square loop: RED 0, GREEN 13, YELLOW 26,
  BLUE 39.
- Entry to own home stretch is at `(start_offset - 1) mod 52`.
- Safe squares: `{0, 8, 13, 21, 26, 34, 39, 47}` — colored starts plus star
  squares.

## Bot modes (room-level, single choice for all bots)

- **Neutral** — honest dice, random legal move.
- **Killer** — honest dice; prefers captures; otherwise avoids overtaking
  the lead opponent and avoids becoming the front-runner of its own color.
- **Defensive** — honest dice; prioritizes leaving capture range, then safe
  squares / home stretch, then blocks, then progress.
- **Cheeky** — same move selection as Neutral, but the dice rolls are wrapped
  by a `FavorController` (see below). The favor is **room-level**, not
  per-bot — it can target the human host.

All bot strategies must be deterministic given a seeded RNG. Reproducible
games (same seed → same outcome) is a hard requirement for testing.

## Cheeky favor mechanic

A room-level controller silently picks a target seat and a favor kind, applies
the favor for a short duration of dice rolls, then picks another after a
cooldown. The cadence and durations should be tuned so a casual player would
attribute the outcomes to luck, not cheating.

Favor kinds:

- `lucky_sixes` — dice rolls are forced to 6 for the duration.
- `stuck_on_ones` — dice rolls are forced to 1 for the duration.
- `guaranteed_kill` — the next roll is set to whatever value puts the target
  on an opponent's square (capture). If no capture is reachable, falls back
  to honest.
- `home_stretch_sprint` — favor the value that advances a home-stretch piece
  to (or toward) finish.
- `stay_home` — force values that keep the target's pieces in yard (no 6s
  for the duration).

Requirements:

- The dishonesty must be **silent during play** — UI shows nothing
  unusual.
- A `favor_log` is collected as the game runs and revealed on the end
  screen (expander / disclosure) so players can see what the dice did.
- Favors must be writable as unit tests by constructing a favor state
  directly and asserting on the dice override.

## Concurrency expectations (stack-agnostic)

Whatever stack we pick next, these properties matter:

- A room is a single shared object — every player session reads/writes the
  same state. No per-session copies.
- All mutations must re-validate preconditions inside a lock. Failed
  preconditions are silent no-ops; the client resyncs.
- Bot turns must be claimed atomically so two clients polling at the same
  time can't double-run a bot turn.
- A monotonic per-room version counter is convenient for clients to detect
  changes and re-render.
- Session identity should be a stable per-browser id (UUID in localStorage
  or a cookie) — slot ownership is by that id. A name-based reclaim path is
  the fallback for users who hard-refresh and lose the id.

## What the previous implementation was missing

- It was deployed as a single process by design (in-memory room store via
  Streamlit's `@st.cache_resource`). The next stack should make the
  single-process constraint a choice, not a forced one — ideally with a
  pluggable store so a small Redis or SQLite backend is easy later.
- Click handling on the Plotly board was brittle (`streamlit-plotly-events`
  is unmaintained). Whatever the next stack is, board input should be
  first-class — not bolted on with a third-party component.
- There were no UI tests because Streamlit didn't make it easy. The next
  stack should support automated UI / integration tests for the lobby and
  game flow.

## Engine tests we had (worth re-creating)

- Legal-move generation for every (color, position, dice) combination of
  interest: yard exit on 6, home-stretch exact-finish, overshoot, blocked
  by own block, capture available.
- `apply_move` invariants: captured piece returns to yard, finished pieces
  removed from track, extra-turn flag on 6 or capture, 3-sixes forfeit.
- Bot strategies: Killer picks the capture when one exists; Defensive
  leaves capture range when available; both behave like Neutral when no
  preferred move exists.
- Favor controller: each favor kind, in isolation, produces the expected
  dice override; durations decrement correctly; cooldown gates the next
  favor.
