"""Bot strategies: Neutral, Killer, Defensive. Cheeky bots reuse Neutral selection."""

from __future__ import annotations

import random
from typing import Protocol

from .board import (
    HOME_STRETCH_BASE,
    NUM_PLAYERS,
    SAFE_SQUARES,
    TRACK_LEN,
    YARD,
    Color,
    is_in_home_stretch,
    is_on_track,
    progress as piece_progress,
)
from .state import BotMode, GameState, Move


class BotStrategy(Protocol):
    def choose_move(
        self, state: GameState, player: int, dice: int, moves: list[Move], rng: random.Random
    ) -> Move: ...


def _move_lands_safe(move: Move) -> bool:
    if move.to_pos in SAFE_SQUARES:
        return True
    if is_in_home_stretch(move.to_pos):
        return True
    if move.to_pos >= HOME_STRETCH_BASE:
        return True  # finished
    return False


def _opponent_capture_threat(state: GameState, player: int, target: int) -> int:
    """Count opponent pieces 1..6 squares behind `target` on the shared track."""
    if not is_on_track(target):
        return 0
    if target in SAFE_SQUARES:
        return 0
    threats = 0
    for opp in range(NUM_PLAYERS):
        if opp == player:
            continue
        for pos in state.pieces[opp]:
            if not is_on_track(pos):
                continue
            # Opponent at `pos` could capture by rolling (target - pos) mod TRACK_LEN in 1..6.
            distance = (target - pos) % TRACK_LEN
            if 1 <= distance <= 6:
                threats += 1
    return threats


def _move_forms_block(state: GameState, player: int, move: Move) -> bool:
    if not is_on_track(move.to_pos):
        return False
    for i, p in enumerate(state.pieces[player]):
        if i == move.piece_index:
            continue
        if p == move.to_pos:
            return True
    return False


def _opponent_lead_progress(state: GameState, player: int) -> int:
    best = -1
    for opp in range(NUM_PLAYERS):
        if opp == player:
            continue
        opp_color = Color(opp)
        for pos in state.pieces[opp]:
            best = max(best, piece_progress(opp_color, pos))
    return best


def _own_lead_index(state: GameState, player: int) -> int | None:
    """Index of own piece with the highest progress (None if all in yard)."""
    color = Color(player)
    best_i = None
    best_prog = -1
    for i, pos in enumerate(state.pieces[player]):
        if pos == YARD:
            continue
        prog = piece_progress(color, pos)
        if prog > best_prog:
            best_prog = prog
            best_i = i
    return best_i


class NeutralBot:
    def choose_move(
        self, state: GameState, player: int, dice: int, moves: list[Move], rng: random.Random
    ) -> Move:
        return rng.choice(moves)


class KillerBot:
    def choose_move(
        self, state: GameState, player: int, dice: int, moves: list[Move], rng: random.Random
    ) -> Move:
        # Tier 1: any capturing move, preferring the one that captures the most-advanced opp.
        capturing = [m for m in moves if m.captures]
        if capturing:
            def cap_score(m: Move) -> int:
                # Highest opp progress captured.
                best = -1
                for opp, _ in m.captures:
                    opp_color = Color(opp)
                    for opp_piece in state.pieces[opp]:
                        if opp_piece == m.to_pos:
                            best = max(best, piece_progress(opp_color, opp_piece))
                return best

            return max(capturing, key=cap_score)

        color = Color(player)
        lead = _opponent_lead_progress(state, player)
        own_lead_idx = _own_lead_index(state, player)

        def score(m: Move) -> tuple[int, int]:
            new_prog = piece_progress(color, m.to_pos)
            overtakes_lead = new_prog > lead
            becomes_front_runner = (own_lead_idx is None) or m.piece_index == own_lead_idx or new_prog >= piece_progress(color, state.pieces[player][own_lead_idx])
            # Higher score = preferred. Penalize overtaking, then penalize becoming the front-runner.
            return (
                0 if overtakes_lead else 2,
                0 if becomes_front_runner else 1,
            )

        best_score = max(score(m) for m in moves)
        best_moves = [m for m in moves if score(m) == best_score]
        return rng.choice(best_moves)


class DefensiveBot:
    def choose_move(
        self, state: GameState, player: int, dice: int, moves: list[Move], rng: random.Random
    ) -> Move:
        color = Color(player)

        def score(m: Move) -> tuple[int, int, int, int]:
            # Higher tuple = preferred. Priorities:
            # 1) Moved piece ends in safety (no capture threat).
            # 2) Lands on a safe square or home stretch.
            # 3) Forms / keeps a block with another own piece.
            # 4) Maximizes progress of the moved piece.
            threat = _opponent_capture_threat(state, player, m.to_pos)
            safe = 1 if _move_lands_safe(m) else 0
            block = 1 if _move_forms_block(state, player, m) else 0
            prog = piece_progress(color, m.to_pos)
            # Defensive bot captures only when capture is "free" (i.e. lands safe). Otherwise
            # still values captures lightly.
            capture_bonus = 1 if m.captures else 0
            return (-threat + capture_bonus, safe, block, prog)

        best_score = max(score(m) for m in moves)
        best_moves = [m for m in moves if score(m) == best_score]
        return rng.choice(best_moves)


_STRATEGIES: dict[BotMode, BotStrategy] = {
    BotMode.NEUTRAL: NeutralBot(),
    BotMode.KILLER: KillerBot(),
    BotMode.DEFENSIVE: DefensiveBot(),
    BotMode.CHEEKY: NeutralBot(),  # Cheeky's "trick" is on dice, not move selection.
}


def strategy_for(mode: BotMode) -> BotStrategy:
    return _STRATEGIES[mode]
