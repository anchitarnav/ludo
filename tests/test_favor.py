"""Favor (Cheeky mode) tests."""

from __future__ import annotations

import random

from ludo.board import YARD
from ludo.engine import make_state
from ludo.favor import roll_with_favor
from ludo.state import FavorState


def test_disabled_means_honest_random():
    state = make_state([[YARD] * 4 for _ in range(4)])
    favor = FavorState(turns_until_next=1)
    rng = random.Random(0)
    dice, new_favor, event = roll_with_favor(state, 0, favor, rng, enabled=False)
    assert 1 <= dice <= 6
    assert event is None
    # New favor should not spawn when disabled.
    assert new_favor.active_kind is None


def test_lucky_sixes_returns_six_for_duration():
    state = make_state([[YARD] * 4 for _ in range(4)])
    favor = FavorState(
        active_kind="lucky_sixes",
        active_target=0,
        active_remaining=3,
        turns_until_next=0,
    )
    rng = random.Random(0)
    for _ in range(3):
        dice, favor, event = roll_with_favor(state, 0, favor, rng, enabled=True)
        assert dice == 6
        assert event is not None
        assert event.forced_value == 6
    # After 3 rolls, favor should clear.
    assert favor.active_kind is None


def test_favor_targets_only_active_player():
    state = make_state([[YARD] * 4 for _ in range(4)])
    favor = FavorState(
        active_kind="stuck_on_ones",
        active_target=1,  # only player 1
        active_remaining=3,
        turns_until_next=0,
    )
    rng = random.Random(0)
    # Player 0 rolls: should be honest.
    dice, favor, event = roll_with_favor(state, 0, favor, rng, enabled=True)
    assert event is None
    # Player 1 rolls: should be forced to 1.
    dice, favor, event = roll_with_favor(state, 1, favor, rng, enabled=True)
    assert dice == 1
    assert event is not None


def test_stay_home_never_returns_six():
    state = make_state([[YARD] * 4 for _ in range(4)])
    favor = FavorState(
        active_kind="stay_home",
        active_target=0,
        active_remaining=10,
        turns_until_next=0,
    )
    rng = random.Random(42)
    for _ in range(5):
        dice, favor, event = roll_with_favor(state, 0, favor, rng, enabled=True)
        assert event is not None
        assert dice != 6


def test_guaranteed_kill_picks_capturing_value():
    # RED at 5, GREEN at 9 (non-safe square). RED rolling 4 captures.
    pieces = [[YARD] * 4 for _ in range(4)]
    pieces[0][0] = 5
    pieces[1][0] = 9
    state = make_state(pieces, current_player=0)
    favor = FavorState(
        active_kind="guaranteed_kill",
        active_target=0,
        active_remaining=1,
        turns_until_next=0,
    )
    rng = random.Random(0)
    dice, favor, event = roll_with_favor(state, 0, favor, rng, enabled=True)
    assert dice == 4, f"expected capture-enabling 4, got {dice}"
    assert event is not None
