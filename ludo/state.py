"""Game state, room state, and the per-room lock."""

from __future__ import annotations

import random
import threading
import time
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Optional

from .board import NUM_PLAYERS, PIECES_PER_PLAYER, YARD, Color


class Phase(str, Enum):
    LOBBY = "lobby"
    PLAYING = "playing"
    ENDED = "ended"


class BotMode(str, Enum):
    NEUTRAL = "neutral"
    KILLER = "killer"
    DEFENSIVE = "defensive"
    CHEEKY = "cheeky"


@dataclass(frozen=True)
class Move:
    piece_index: int
    from_pos: int
    to_pos: int
    captures: tuple[tuple[int, int], ...] = ()  # (opp_player, opp_piece_index)


@dataclass(frozen=True)
class FavorEvent:
    turn_count: int
    target_player: int
    favor_kind: str
    forced_value: int


@dataclass
class FavorState:
    active_kind: Optional[str] = None
    active_target: Optional[int] = None
    active_remaining: int = 0
    turns_until_next: int = 0


@dataclass(frozen=True)
class GameState:
    pieces: tuple[tuple[int, ...], ...]  # [player][piece] -> position
    current_player: int = 0
    consecutive_sixes: int = 0
    turn_count: int = 0
    finish_order: tuple[int, ...] = ()
    last_dice: Optional[int] = None
    last_move: Optional[Move] = None
    waiting_for_move: bool = False  # True between roll and apply

    @staticmethod
    def initial() -> "GameState":
        return GameState(
            pieces=tuple(tuple(YARD for _ in range(PIECES_PER_PLAYER)) for _ in range(NUM_PLAYERS)),
        )

    def player_finished(self, player: int) -> bool:
        from .board import FINISHED

        return all(p == FINISHED for p in self.pieces[player])


@dataclass
class Slot:
    """A seat in the room."""

    seat_index: int  # 0..3
    color: Color
    name: str = ""
    is_bot: bool = False
    player_session_id: str = ""  # empty if open or bot

    @property
    def is_open(self) -> bool:
        return not self.is_bot and self.player_session_id == ""

    @property
    def is_human(self) -> bool:
        return not self.is_bot and self.player_session_id != ""


@dataclass
class GameRoom:
    """A single room. All mutations must be performed under `self.lock`."""

    room_id: str
    host_session_id: str
    bot_mode: BotMode = BotMode.NEUTRAL
    phase: Phase = Phase.LOBBY
    slots: list[Slot] = field(default_factory=list)
    state: GameState = field(default_factory=GameState.initial)
    favor_log: list[FavorEvent] = field(default_factory=list)
    favor_state: FavorState = field(default_factory=FavorState)
    version: int = 0
    bot_thinking: bool = False
    last_activity_at: float = field(default_factory=time.time)
    rng: random.Random = field(default_factory=random.Random)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    # Rendering-only animation state. Not authoritative game state; clients use this
    # to time CSS dice spins and step a piece cell-by-cell after a move is applied.
    last_roll_at: float = 0.0
    anim_seat: Optional[int] = None
    anim_piece_idx: Optional[int] = None
    anim_path: tuple[int, ...] = ()
    anim_started_at: float = 0.0
    anim_step_seconds: float = 0.22

    def __post_init__(self) -> None:
        if not self.slots:
            colors = [Color.RED, Color.GREEN, Color.YELLOW, Color.BLUE]
            self.slots = [Slot(seat_index=i, color=c) for i, c in enumerate(colors)]

    # All methods below MUST be called by callers already holding self.lock.
    # We don't acquire inside to allow callers to compose multi-step transactions.

    def touch(self) -> None:
        self.last_activity_at = time.time()

    def bump(self) -> None:
        self.version += 1
        self.touch()

    def seat_of_session(self, session_id: str) -> Optional[int]:
        for slot in self.slots:
            if slot.is_human and slot.player_session_id == session_id:
                return slot.seat_index
        return None

    def open_seats(self) -> list[int]:
        return [s.seat_index for s in self.slots if s.is_open]

    def human_seats(self) -> list[int]:
        return [s.seat_index for s in self.slots if s.is_human]

    def replace_state(self, **kwargs) -> None:
        self.state = replace(self.state, **kwargs)

    def anim_total_seconds(self) -> float:
        return max(0.0, (len(self.anim_path) - 1) * self.anim_step_seconds)

    def anim_is_active(self, now: float) -> bool:
        if self.anim_started_at <= 0 or len(self.anim_path) <= 1:
            return False
        return (now - self.anim_started_at) < self.anim_total_seconds()

    def anim_current_position(self, now: float) -> Optional[int]:
        """Override position for the animating piece, or None if no animation in progress."""
        if not self.anim_is_active(now):
            return None
        elapsed = now - self.anim_started_at
        idx = min(int(elapsed / self.anim_step_seconds), len(self.anim_path) - 1)
        return self.anim_path[idx]

    def clear_animation(self) -> None:
        self.anim_seat = None
        self.anim_piece_idx = None
        self.anim_path = ()
        self.anim_started_at = 0.0
