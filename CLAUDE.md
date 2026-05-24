# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cheeky Ludo — a 4-player Streamlit Ludo game for self-hosting on a personal VM and playing with friends. The novel twist is the **Cheeky** bot mode where the *dice itself* is dishonest: a `FavorController` silently favors or sabotages random players with effects like lucky sixes, stuck on ones, guaranteed kills.

**Design constraint that drives everything else:** all room state lives in process memory via a `@st.cache_resource` singleton dict. The app **must** be deployed as a single process — no horizontal scaling, no external state store. This is a deliberate trade-off for a friends-only deployment. Do not propose Redis, a database, or load balancing across replicas; those break the design.

## Commands

```bash
# First-time setup
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'

# Run the app locally (then visit http://localhost:8501)
streamlit run app.py

# Tests
pytest                              # all tests
pytest tests/test_engine.py -k home # one test
```

A pre-built `.venv` already exists in this repo. Activate it before running anything: `source .venv/bin/activate`.

End-to-end simulation (no Streamlit, useful for debugging engine/bot behavior):

```python
import random
from ludo.state import BotMode, GameRoom
from ludo.lifecycle import claim_slot, start_game
from ludo.turn import run_bot_turn
from ludo.engine import is_game_over

room = GameRoom(room_id='T', host_session_id='h', rng=random.Random(11))
claim_slot(room, 0, 'Host', 'h')
room.bot_mode = BotMode.CHEEKY
start_game(room, 'h', seed=11)
room.slots[0].is_bot = True  # so run_bot_turn drives all four seats
while not is_game_over(room.state):
    run_bot_turn(room)
print(room.state.finish_order, len(room.favor_log))
```

## Architecture

### Module layering (no cycles)

```
board.py ─────────────────────────── pure constants & coordinate math
state.py ──────────────────────────── dataclasses (GameState, GameRoom, Move, Slot, enums)
engine.py ─────────────────────────── pure rule logic (legal_moves, apply_move, advance_after_turn)
favor.py ──────────────────────────── Cheeky-mode dice manipulator (depends on engine for guaranteed-kill enumeration)
bots.py ───────────────────────────── BotStrategy implementations
lifecycle.py ──────────────────────── claim_slot, start_game, restart_game, claim_bot_turn
turn.py ───────────────────────────── room-level operations (roll_dice, apply_player_move, run_bot_turn) — composes engine + favor + bots
store.py ──────────────────────────── @st.cache_resource singleton dict; only module that imports streamlit at the engine layer
ui/board_plot.py ──────────────────── Plotly figure builder + click → (seat, piece_idx) mapping
ui/lobby.py, ui/game.py ───────────── Streamlit pages
app.py ────────────────────────────── routing entrypoint
```

Engine modules (`board`, `state`, `engine`, `favor`, `bots`, `lifecycle`, `turn`) are streamlit-free and unit-testable in isolation.

### Concurrency model

This is the load-bearing invariant of the design. Six things to internalize:

1. **One `GameRoom` per room, shared by all sessions.** `store.get_store()` is `@st.cache_resource`-decorated, so every session in every thread sees the *same dict instance*. Looking up `store[room_id]` returns the literal same `GameRoom` object reference — not a copy. Writes by session A are immediately visible to session B's next read.

2. **Two-level locking.** Module-level `RLock` in `store.py` guards dict insert/delete (create / close / idle-reaper). Each `GameRoom` has its own `threading.RLock` (`room.lock`) guarding all mutations. Lock ordering: store lock acquired *before* room lock when both are needed. Most operations only need the room lock.

3. **Mutations re-validate inside the lock.** Pattern: `with room.lock: assert preconditions; mutate; room.bump()`. Failed preconditions are silent no-ops — the autorefresh resyncs the UI. See `turn.roll_dice` / `turn.apply_player_move` for the canonical pattern (check phase, check current_player, recompute legal_moves at the moment of writing).

4. **`room.version` is read lock-free.** Polling clients read `version` without taking the room lock; CPython's GIL makes a single attribute read atomic. Stale reads cause one redundant rerender — harmless. `room.bump()` (called inside the lock) increments it and updates `last_activity_at`.

5. **Session identity = `st.session_state['player_session_id']` (UUID).** Slots store this string. The seat-of-session lookup gates "Roll dice", "Start game", host-only controls. Hard refresh loses the UUID; a name-based `reclaim_slot_by_name` is the fallback.

6. **Bot turns are claimed atomically via `room.bot_thinking`.** Whichever polling client sees a bot's turn calls `lifecycle.claim_bot_turn()` under the lock (sets `bot_thinking=True`). It sleeps the pacing delay *outside* the lock, then re-acquires and runs the bot. Prevents double-execution if multiple tabs poll simultaneously.

### Coordinate system

Piece position is a single `int`:

| Range | Meaning |
|-------|---------|
| `-1` (`YARD`) | In yard |
| `0..51` | Main track (shared absolute coords) |
| `100..105` (`HOME_STRETCH_BASE` + 0..5) | Own home stretch |
| `106` (`FINISHED`) | Finished |

- `START_OFFSET = {RED: 0, GREEN: 13, YELLOW: 26, BLUE: 39}` — where each color launches.
- Entry to own home stretch is at `(START_OFFSET[c] - 1) mod 52`.
- `SAFE_SQUARES = {0, 8, 13, 21, 26, 34, 39, 47}` — colored starts (safe for all) + star squares.
- `board.advance(color, pos, steps) -> int | None` is the canonical movement function; returns `None` on overshoot.

The Plotly board (`ui/board_plot.py`) renders on a 15×15 grid. Yards: RED bottom-left (0,0), GREEN bottom-right (9,0), YELLOW top-right (9,9), BLUE top-left (0,9). Track index 0 maps to (0,6); index 13 to (8,0); 26 to (14,8); 39 to (6,14). Each color's home-stretch entry is geometrically adjacent to stretch idx 0.

### Rule variants in force

- 3 consecutive 6s **forfeits** the turn (no move applied).
- Must roll **exact** to finish; overshoot wastes that piece's move only.
- Two same-color pieces on a square form a **passive block**: immune to capture but allow opponents to pass through.
- Colored start squares are safe for **all** players, not just the owning color.
- 6 OR a capture grants an extra turn.
- Game ranks all four players (`finish_order: tuple[int, ...]`). Ends when 3 have finished; 4th place is implicit.

### Bot modes (room-level, single choice for all bots)

- **Neutral** — honest dice, random legal move.
- **Killer** — honest dice; prefers captures; otherwise avoids overtaking the lead opponent and avoids becoming own-color front-runner.
- **Defensive** — honest dice; prioritizes leaving capture range, then safe squares / home stretch, then blocks, then progress.
- **Cheeky** — `NeutralBot` move selection but `FavorController` wraps dice rolls. The favor is **room-level**, not per-bot — it can target the human host. Favor kinds: `lucky_sixes`, `stuck_on_ones`, `guaranteed_kill`, `home_stretch_sprint`, `stay_home`. Silent during play; `favor_log` revealed via expander on the end screen.

All bot strategies are deterministic given an RNG. Pass `seed=` to `start_game` for reproducible games.

## When changing things

- **UI changes** require manual browser verification. The repo has no UI test framework; tests cover engine/bots/favor only. Run `streamlit run app.py` and exercise the flow.
- `streamlit-plotly-events 0.0.6` is old and brittle against newer Streamlit. If clicks stop firing, this is the first place to look — `ui/game.py`'s `plotly_events(...)` call and the `click_to_piece` mapper in `ui/board_plot.py`.
- The `turn.py` operations are NOT thread-safe by themselves; callers (`ui/game.py`, `ui/lobby.py`) must wrap them in `with room.lock:`. Adding a new mutation? Follow that pattern.
- When adding a new favor kind, edit `FAVOR_KINDS`, `_favor_duration`, and `_override_value` in `ludo/favor.py`. Add a test in `tests/test_favor.py` that constructs a `FavorState` with the new kind directly.
