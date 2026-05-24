"""Composes engine + favor + bots into the room-level turn operations.

The UI calls these from inside `room.lock`. They re-validate preconditions
and return whether a state change happened so the caller can decide whether
to bump the version counter.

For UX, mutations also stamp animation hints on the room (last_roll_at,
anim_path, etc.). Those fields are render-only — the engine ignores them.
"""

from __future__ import annotations

import time
from dataclasses import replace

from .board import YARD, Color, advance
from .bots import strategy_for
from .engine import (
    advance_after_turn,
    apply_move,
    is_game_over,
    legal_moves,
    next_active_player,
)
from .favor import roll_with_favor
from .state import BotMode, GameRoom, Move, Phase


def _compute_path(color: Color, from_pos: int, to_pos: int) -> tuple[int, ...]:
    """Sequence of positions traversed from `from_pos` to `to_pos`, inclusive at both ends.

    Walks one square at a time via board.advance, so the path naturally enters
    the home stretch and finishes at FINISHED for the owning color.
    """
    if from_pos == to_pos:
        return (from_pos,)
    if from_pos == YARD:
        # Single hop out of the yard onto the start square.
        return (from_pos, to_pos)
    path = [from_pos]
    current = from_pos
    # Safety bound: max travel is ~58 squares (track + home stretch).
    for _ in range(60):
        nxt = advance(color, current, 1)
        if nxt is None:
            break
        path.append(nxt)
        if nxt == to_pos:
            return tuple(path)
        current = nxt
    return tuple(path)


def _stamp_move_animation(room: GameRoom, seat: int, move: Move) -> None:
    room.anim_seat = seat
    room.anim_piece_idx = move.piece_index
    room.anim_path = _compute_path(Color(seat), move.from_pos, move.to_pos)
    room.anim_started_at = time.time()


def _do_roll(room: GameRoom, seat: int) -> int:
    """Roll dice (with favor if Cheeky mode), record event, stamp roll time."""
    enabled = room.bot_mode == BotMode.CHEEKY
    dice, new_favor, event = roll_with_favor(
        room.state, seat, room.favor_state, room.rng, enabled=enabled
    )
    room.favor_state = new_favor
    if event is not None:
        room.favor_log.append(event)
    room.last_roll_at = time.time()
    return dice


def _finalize_if_game_over(room: GameRoom) -> None:
    if is_game_over(room.state):
        remaining = [p for p in range(4) if p not in room.state.finish_order]
        if remaining:
            room.replace_state(finish_order=room.state.finish_order + tuple(remaining))
        room.phase = Phase.ENDED


def roll_dice(room: GameRoom, by_seat: int) -> int | None:
    """Roll the dice for the current human player. Returns the value, or None on bad precondition.

    Updates room.state.last_dice and sets waiting_for_move=True if any moves are legal;
    if no legal moves, the turn is passed automatically.
    """
    if room.phase != Phase.PLAYING:
        return None
    if room.state.current_player != by_seat:
        return None
    if room.state.waiting_for_move:
        return None

    dice = _do_roll(room, by_seat)

    # Three consecutive sixes forfeits the turn.
    if dice == 6 and room.state.consecutive_sixes == 2:
        room.replace_state(last_dice=dice, last_move=None, waiting_for_move=False)
        room.state = advance_after_turn(
            room.state, dice=dice, move_applied=False, consumed_three_sixes=True
        )
        room.bump()
        return dice

    moves = legal_moves(room.state, by_seat, dice)
    if not moves:
        room.replace_state(last_dice=dice, last_move=None, waiting_for_move=False)
        room.state = advance_after_turn(
            room.state, dice=dice, move_applied=False, consumed_three_sixes=False
        )
        room.bump()
        return dice

    room.replace_state(last_dice=dice, waiting_for_move=True)
    room.bump()
    return dice


def apply_player_move(room: GameRoom, by_seat: int, piece_index: int) -> bool:
    """Apply the requested piece move; revalidates legality. Returns True if applied."""
    if room.phase != Phase.PLAYING:
        return False
    if room.state.current_player != by_seat:
        return False
    if not room.state.waiting_for_move:
        return False
    dice = room.state.last_dice
    if dice is None:
        return False

    moves = legal_moves(room.state, by_seat, dice)
    chosen: Move | None = next(
        (m for m in moves if m.piece_index == piece_index), None
    )
    if chosen is None:
        return False

    _stamp_move_animation(room, by_seat, chosen)
    new_state, _ = apply_move(room.state, by_seat, dice, chosen)
    new_state = advance_after_turn(
        new_state, dice=dice, move_applied=True, consumed_three_sixes=False
    )
    room.state = new_state
    _finalize_if_game_over(room)
    room.bump()
    return True


def bot_roll(room: GameRoom) -> bool:
    """Bot version of roll_dice. Pulled out so the UI can pace dice and move separately.

    Returns True if a roll happened (turn forfeit or pass also count — state advanced).
    """
    if room.phase != Phase.PLAYING:
        return False
    seat = room.state.current_player
    if not room.slots[seat].is_bot:
        return False
    if room.state.waiting_for_move:
        return False

    dice = _do_roll(room, seat)

    if dice == 6 and room.state.consecutive_sixes == 2:
        room.replace_state(last_dice=dice, last_move=None, waiting_for_move=False)
        room.state = advance_after_turn(
            room.state, dice=dice, move_applied=False, consumed_three_sixes=True
        )
        room.bump()
        return True

    moves = legal_moves(room.state, seat, dice)
    if not moves:
        room.replace_state(last_dice=dice, last_move=None, waiting_for_move=False)
        room.state = advance_after_turn(
            room.state, dice=dice, move_applied=False, consumed_three_sixes=False
        )
        room.bump()
        return True

    room.replace_state(last_dice=dice, waiting_for_move=True)
    room.bump()
    return True


def bot_apply_move(room: GameRoom) -> bool:
    """Bot picks a legal move with its strategy and applies it. Returns True if applied."""
    if room.phase != Phase.PLAYING:
        return False
    seat = room.state.current_player
    if not room.slots[seat].is_bot:
        return False
    if not room.state.waiting_for_move:
        return False
    dice = room.state.last_dice
    if dice is None:
        return False

    moves = legal_moves(room.state, seat, dice)
    if not moves:
        # Shouldn't happen — bot_roll would have auto-passed. Be defensive.
        room.replace_state(last_move=None, waiting_for_move=False)
        room.state = advance_after_turn(
            room.state, dice=dice, move_applied=False, consumed_three_sixes=False
        )
        room.bump()
        return False

    strategy = strategy_for(room.bot_mode)
    move = strategy.choose_move(room.state, seat, dice, moves, room.rng)
    _stamp_move_animation(room, seat, move)
    new_state, _ = apply_move(room.state, seat, dice, move)
    new_state = advance_after_turn(
        new_state, dice=dice, move_applied=True, consumed_three_sixes=False
    )
    room.state = replace(new_state, last_dice=dice)
    _finalize_if_game_over(room)
    room.bump()
    return True


def run_bot_turn(room: GameRoom) -> bool:
    """Atomic bot roll + (if applicable) move. Used by headless simulation.

    UI paths drive bots via bot_roll/bot_apply_move so dice and piece animations
    have time to play between the two steps. Tests and the simulation snippet in
    CLAUDE.md still call this.
    """
    if not bot_roll(room):
        return False
    if room.state.waiting_for_move and room.phase == Phase.PLAYING:
        bot_apply_move(room)
    return True


def force_pass_if_stuck(room: GameRoom) -> bool:
    """If the current player has finished and shouldn't be on the clock, advance."""
    if room.phase != Phase.PLAYING:
        return False
    cp = room.state.current_player
    if cp in room.state.finish_order:
        next_p = next_active_player(room.state, cp)
        room.replace_state(current_player=next_p)
        room.bump()
        return True
    return False
