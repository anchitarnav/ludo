"""Cheeky-mode dice manipulator: the FavorController.

Wraps every dice roll. With some probability, silently overrides the value
for a randomly chosen target player for a few rolls — lucky sixes, stuck on
ones, guaranteed kills, home stretch sprints, or "stay home". Only active
when the room is in BotMode.CHEEKY. All randomness goes through the room
RNG so games are reproducible from a seed.
"""

from __future__ import annotations

import random
from dataclasses import replace
from typing import Callable

from .board import HOME_STRETCH_BASE, YARD
from .engine import legal_moves
from .state import FavorEvent, FavorState, GameState


# Probability that a new favor triggers when the cooldown reaches zero.
TRIGGER_PROBABILITY = 0.6

FAVOR_KINDS = (
    "lucky_sixes",
    "stuck_on_ones",
    "guaranteed_kill",
    "home_stretch_sprint",
    "stay_home",
)


def _favor_duration(kind: str, rng: random.Random) -> int:
    if kind == "lucky_sixes" or kind == "stuck_on_ones":
        return rng.randint(2, 4)
    if kind == "stay_home":
        return 3
    if kind == "home_stretch_sprint":
        return 2
    if kind == "guaranteed_kill":
        return 1
    return 1


def _maybe_spawn_favor(favor: FavorState, rng: random.Random) -> FavorState:
    """Decrement cooldown and possibly start a new favor."""
    if favor.active_kind is not None:
        return favor
    new_cooldown = favor.turns_until_next - 1
    if new_cooldown > 0:
        return replace(favor, turns_until_next=new_cooldown)
    if rng.random() >= TRIGGER_PROBABILITY:
        # Skip this opportunity; try again on the next roll.
        return replace(favor, turns_until_next=0)
    kind = rng.choice(FAVOR_KINDS)
    target = rng.randrange(4)
    duration = _favor_duration(kind, rng)
    return replace(
        favor,
        active_kind=kind,
        active_target=target,
        active_remaining=duration,
        turns_until_next=0,
    )


def _override_value(
    kind: str,
    state: GameState,
    player: int,
    rng: random.Random,
) -> int | None:
    """Return the forced dice value, or None if the favor can't apply this roll."""
    if kind == "lucky_sixes":
        return 6
    if kind == "stuck_on_ones":
        return 1
    if kind == "stay_home":
        if any(p == YARD for p in state.pieces[player]):
            return rng.randint(1, 5)
        return None
    if kind == "guaranteed_kill":
        # Smallest dice value that produces a capturing legal move.
        for v in range(1, 7):
            moves = legal_moves(state, player, v)
            if any(m.captures for m in moves):
                return v
        return None
    if kind == "home_stretch_sprint":
        # Pick the dice value that advances the furthest piece the most without overshoot.
        from .board import Color, progress as piece_progress

        color = Color(player)
        own = state.pieces[player]
        best_value = None
        best_progress = -1
        for v in range(1, 7):
            moves = legal_moves(state, player, v)
            for m in moves:
                # Only consider moving the most-advanced piece toward finish.
                if m.from_pos < HOME_STRETCH_BASE and own[m.piece_index] == YARD:
                    continue
                target_prog = piece_progress(color, m.to_pos)
                if target_prog > best_progress:
                    best_progress = target_prog
                    best_value = v
        return best_value
    return None


def roll_with_favor(
    state: GameState,
    player: int,
    favor: FavorState,
    rng: random.Random,
    *,
    enabled: bool,
    honest_roll: Callable[[], int] | None = None,
) -> tuple[int, FavorState, FavorEvent | None]:
    """Compute the dice roll for `player`, applying any active or newly-triggered favor.

    Returns (dice_value, new_favor_state, event_or_None).
    `enabled` is False when bot_mode != CHEEKY — in which case this still rolls
    honestly but never spawns favors.
    """
    honest = honest_roll() if honest_roll else rng.randint(1, 6)
    if not enabled:
        return honest, favor, None

    favor = _maybe_spawn_favor(favor, rng)

    if favor.active_kind is None or favor.active_target != player:
        return honest, favor, None

    forced = _override_value(favor.active_kind, state, player, rng)
    if forced is None:
        # Favor can't apply on this roll; consume one tick anyway to keep it bounded.
        new_remaining = favor.active_remaining - 1
        if new_remaining <= 0:
            favor = replace(
                favor,
                active_kind=None,
                active_target=None,
                active_remaining=0,
                turns_until_next=rng.randint(5, 15),
            )
        else:
            favor = replace(favor, active_remaining=new_remaining)
        return honest, favor, None

    event = FavorEvent(
        turn_count=state.turn_count,
        target_player=player,
        favor_kind=favor.active_kind,
        forced_value=forced,
    )
    new_remaining = favor.active_remaining - 1
    if new_remaining <= 0:
        favor = replace(
            favor,
            active_kind=None,
            active_target=None,
            active_remaining=0,
            turns_until_next=rng.randint(5, 15),
        )
    else:
        favor = replace(favor, active_remaining=new_remaining)
    return forced, favor, event


def initial_favor_state(rng: random.Random) -> FavorState:
    return FavorState(turns_until_next=rng.randint(5, 15))
