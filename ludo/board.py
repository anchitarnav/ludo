"""Board geometry, coordinates, and shared constants."""

from __future__ import annotations

from enum import IntEnum


TRACK_LEN = 52
HOME_STRETCH_LEN = 6

YARD = -1
HOME_STRETCH_BASE = 100
HOME_STRETCH_END = HOME_STRETCH_BASE + HOME_STRETCH_LEN - 1  # 105
FINISHED = 106

PIECES_PER_PLAYER = 4
NUM_PLAYERS = 4


class Color(IntEnum):
    RED = 0
    GREEN = 1
    YELLOW = 2
    BLUE = 3


COLOR_NAMES = {
    Color.RED: "Red",
    Color.GREEN: "Green",
    Color.YELLOW: "Yellow",
    Color.BLUE: "Blue",
}

COLOR_HEX = {
    Color.RED: "#e74c3c",
    Color.GREEN: "#2ecc71",
    Color.YELLOW: "#f1c40f",
    Color.BLUE: "#3498db",
}

# Where each color enters the main track.
START_OFFSET = {
    Color.RED: 0,
    Color.GREEN: 13,
    Color.YELLOW: 26,
    Color.BLUE: 39,
}

# Globally safe squares: 4 colored starts + 4 stars at +8 from each start.
SAFE_SQUARES = frozenset({0, 8, 13, 21, 26, 34, 39, 47})


def is_in_yard(pos: int) -> bool:
    return pos == YARD


def is_on_track(pos: int) -> bool:
    return 0 <= pos < TRACK_LEN


def is_in_home_stretch(pos: int) -> bool:
    return HOME_STRETCH_BASE <= pos <= HOME_STRETCH_END


def is_finished(pos: int) -> bool:
    return pos == FINISHED


def entry_square(color: Color) -> int:
    """The main-track square just before the color's home stretch.

    A piece moving from this square advances into the home stretch.
    """
    return (START_OFFSET[color] - 1) % TRACK_LEN


def progress(color: Color, pos: int) -> int:
    """How far this piece has traveled from its start. Yard = -1; finished = high.

    Used to compare advancement between pieces of (potentially different) colors.
    """
    if pos == YARD:
        return -1
    if is_on_track(pos):
        return (pos - START_OFFSET[color]) % TRACK_LEN
    if is_in_home_stretch(pos):
        return TRACK_LEN + (pos - HOME_STRETCH_BASE)
    return TRACK_LEN + HOME_STRETCH_LEN  # finished


def advance(color: Color, pos: int, steps: int) -> int | None:
    """Return the target position after rolling `steps`, or None if illegal (overshoot)."""
    if pos == YARD:
        # Only a 6 unlocks; caller enforces.
        if steps == 6:
            return START_OFFSET[color]
        return None
    if is_on_track(pos):
        traveled = (pos - START_OFFSET[color]) % TRACK_LEN
        new_traveled = traveled + steps
        if new_traveled < TRACK_LEN:
            return (START_OFFSET[color] + new_traveled) % TRACK_LEN
        # Transition into home stretch. After TRACK_LEN steps a piece would re-cross
        # its start; instead we route through home stretch.
        # new_traveled == TRACK_LEN means it's just turned into stretch slot 0 (pos 100).
        stretch_idx = new_traveled - TRACK_LEN
        if stretch_idx < HOME_STRETCH_LEN:
            return HOME_STRETCH_BASE + stretch_idx
        if stretch_idx == HOME_STRETCH_LEN:
            return FINISHED
        return None  # overshoot
    if is_in_home_stretch(pos):
        new_pos = pos + steps
        if new_pos < HOME_STRETCH_BASE + HOME_STRETCH_LEN:
            return new_pos
        if new_pos == HOME_STRETCH_BASE + HOME_STRETCH_LEN:
            return FINISHED
        return None  # overshoot
    return None  # already finished
