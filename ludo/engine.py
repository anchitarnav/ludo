"""Pure game logic: legal moves, applying moves, turn driver, win check."""

from __future__ import annotations

from dataclasses import replace

from .board import (
    FINISHED,
    NUM_PLAYERS,
    PIECES_PER_PLAYER,
    SAFE_SQUARES,
    YARD,
    Color,
    advance,
    is_on_track,
)
from .state import GameState, Move


def _piece_color(player: int) -> Color:
    return Color(player)


def legal_moves(state: GameState, player: int, dice: int) -> list[Move]:
    """Enumerate all legal moves for `player` given `dice`. Empty list = forced pass."""
    color = _piece_color(player)
    own_pieces = state.pieces[player]
    moves: list[Move] = []
    for i, pos in enumerate(own_pieces):
        if pos == FINISHED:
            continue
        target = advance(color, pos, dice)
        if target is None:
            continue
        captures = _captures_at(state, player, target)
        moves.append(Move(piece_index=i, from_pos=pos, to_pos=target, captures=captures))
    return moves


def _captures_at(state: GameState, mover_player: int, target: int) -> tuple[tuple[int, int], ...]:
    """Pieces of other players that get sent home when `mover_player` lands on `target`.

    No captures in home stretch, on safe squares, or on opponent blocks (two+ same-color).
    """
    if not is_on_track(target):
        return ()
    if target in SAFE_SQUARES:
        return ()
    captures: list[tuple[int, int]] = []
    # Bucket opponents by player to detect blocks.
    for opp_player in range(NUM_PLAYERS):
        if opp_player == mover_player:
            continue
        opp_pieces_on_target = [
            i for i, p in enumerate(state.pieces[opp_player]) if p == target
        ]
        if len(opp_pieces_on_target) >= 2:
            # Block — no capture; in fact the moved piece should not be permitted to
            # land here. We treat the move as still legal but with no captures; if you
            # want to disallow landing on opponent blocks entirely, return a sentinel.
            # Per chosen rules (passive blocks): allow landing, no capture.
            continue
        for i in opp_pieces_on_target:
            captures.append((opp_player, i))
    return tuple(captures)


def apply_move(state: GameState, player: int, dice: int, move: Move) -> tuple[GameState, bool]:
    """Apply `move` for `player`, returning new state and whether an extra turn is granted.

    Caller is responsible for tracking consecutive sixes and advancing current_player.
    """
    pieces = [list(p) for p in state.pieces]
    pieces[player][move.piece_index] = move.to_pos
    for opp_player, opp_piece in move.captures:
        pieces[opp_player][opp_piece] = YARD
    new_pieces = tuple(tuple(p) for p in pieces)

    new_finish_order = state.finish_order
    if all(p == FINISHED for p in new_pieces[player]) and player not in state.finish_order:
        new_finish_order = state.finish_order + (player,)

    extra_turn = (dice == 6) or bool(move.captures)
    new_state = replace(
        state,
        pieces=new_pieces,
        last_move=move,
        finish_order=new_finish_order,
    )
    return new_state, extra_turn


def is_game_over(state: GameState) -> bool:
    """Three players finished ends the game (4th place implicit)."""
    return len(state.finish_order) >= NUM_PLAYERS - 1


def winner(state: GameState) -> int | None:
    if not state.finish_order:
        return None
    return state.finish_order[0]


def next_active_player(state: GameState, after: int) -> int:
    """Skip players who have already finished all their pieces."""
    p = (after + 1) % NUM_PLAYERS
    for _ in range(NUM_PLAYERS):
        if p not in state.finish_order:
            return p
        p = (p + 1) % NUM_PLAYERS
    return after  # all finished; shouldn't be reached during play


def advance_after_turn(
    state: GameState,
    *,
    dice: int,
    move_applied: bool,
    consumed_three_sixes: bool,
) -> GameState:
    """Update current_player, consecutive_sixes, turn_count for the next roll.

    `move_applied`: True if a move was actually applied this roll (False on no-legal-move pass).
    `consumed_three_sixes`: True if this is the third consecutive six and the turn is forfeit.
    """
    consec = state.consecutive_sixes
    if consumed_three_sixes:
        consec = 0
        next_p = next_active_player(state, state.current_player)
    elif dice == 6 and move_applied:
        consec += 1
        next_p = state.current_player  # extra turn
    elif move_applied and state.last_move and state.last_move.captures:
        consec = 0
        next_p = state.current_player  # extra turn for capture (non-6)
    else:
        consec = 0
        next_p = next_active_player(state, state.current_player)
    return replace(
        state,
        current_player=next_p,
        consecutive_sixes=consec,
        turn_count=state.turn_count + 1,
        waiting_for_move=False,
    )


# Convenience for tests:


def make_state(
    pieces: list[list[int]],
    current_player: int = 0,
    consecutive_sixes: int = 0,
    finish_order: tuple[int, ...] = (),
) -> GameState:
    """Helper to construct a GameState from a 4x4 list of positions."""
    assert len(pieces) == NUM_PLAYERS
    for row in pieces:
        assert len(row) == PIECES_PER_PLAYER
    return GameState(
        pieces=tuple(tuple(row) for row in pieces),
        current_player=current_player,
        consecutive_sixes=consecutive_sixes,
        finish_order=finish_order,
    )
