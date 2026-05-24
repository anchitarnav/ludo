"""Engine rule tests."""

from __future__ import annotations

from ludo.board import FINISHED, HOME_STRETCH_BASE, START_OFFSET, YARD, Color
from ludo.engine import (
    advance_after_turn,
    apply_move,
    is_game_over,
    legal_moves,
    make_state,
    next_active_player,
)
from ludo.state import GameState


def _all_yard() -> list[list[int]]:
    return [[YARD] * 4 for _ in range(4)]


def test_only_six_unlocks_yard():
    state = make_state(_all_yard())
    for dice in range(1, 6):
        assert legal_moves(state, 0, dice) == [], f"dice={dice} should give no moves"
    moves = legal_moves(state, 0, 6)
    # 4 pieces in yard, each can launch.
    assert len(moves) == 4
    assert all(m.to_pos == START_OFFSET[Color.RED] for m in moves)


def test_capture_sends_opponent_home():
    pieces = _all_yard()
    # RED piece 0 on track at position 5; GREEN piece 0 at position 8 (non-safe? idx 8 IS safe).
    # Use idx 9 instead (not safe).
    pieces[0][0] = 5
    pieces[1][0] = 9
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 4)
    capture_moves = [m for m in moves if m.captures]
    assert len(capture_moves) == 1
    new_state, extra = apply_move(state, 0, 4, capture_moves[0])
    assert new_state.pieces[1][0] == YARD, "captured piece should return to yard"
    assert new_state.pieces[0][0] == 9
    assert extra is True, "capture grants extra turn"


def test_safe_square_blocks_capture():
    pieces = _all_yard()
    pieces[0][0] = 4  # on track at idx 4
    pieces[1][0] = 8  # safe star
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 4)
    cap_moves = [m for m in moves if m.captures]
    assert cap_moves == [], "landing on a safe square should not capture"


def test_block_blocks_capture():
    pieces = _all_yard()
    # RED at 5, two GREEN pieces on idx 9 form a block.
    pieces[0][0] = 5
    pieces[1][0] = 9
    pieces[1][1] = 9
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 4)
    cap_moves = [m for m in moves if m.captures]
    assert cap_moves == [], "landing on an opponent block should not capture"


def test_home_stretch_entry_at_start_minus_one():
    pieces = _all_yard()
    # Put RED piece at entry square (start-1 % 52) = 51.
    pieces[0][0] = 51
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 1)
    assert any(m.piece_index == 0 and m.to_pos == HOME_STRETCH_BASE for m in moves)


def test_exact_roll_to_finish():
    pieces = _all_yard()
    # RED at home stretch idx 4 = pos 104. Needs exactly 2 to finish (104+2=106=FINISHED).
    pieces[0][0] = HOME_STRETCH_BASE + 4
    state = make_state(pieces, current_player=0)
    moves_2 = legal_moves(state, 0, 2)
    assert any(m.piece_index == 0 and m.to_pos == FINISHED for m in moves_2)
    moves_3 = legal_moves(state, 0, 3)
    assert all(m.piece_index != 0 for m in moves_3), "overshoot should not produce a move"


def test_three_sixes_forfeits_turn():
    state = make_state(_all_yard(), consecutive_sixes=2)
    # 3rd six: caller handles forfeit. Verify advance_after_turn.
    advanced = advance_after_turn(state, dice=6, move_applied=False, consumed_three_sixes=True)
    assert advanced.current_player == 1
    assert advanced.consecutive_sixes == 0


def test_six_grants_extra_turn():
    state = make_state(_all_yard())
    advanced = advance_after_turn(state, dice=6, move_applied=True, consumed_three_sixes=False)
    assert advanced.current_player == 0
    assert advanced.consecutive_sixes == 1


def test_finish_order_and_skip_finished_players():
    pieces = _all_yard()
    pieces[0] = [FINISHED, FINISHED, FINISHED, HOME_STRETCH_BASE + 5]
    state = make_state(pieces, current_player=0, finish_order=())
    # Move last RED piece by 1 -> finish.
    moves = legal_moves(state, 0, 1)
    final = next(m for m in moves if m.to_pos == FINISHED and m.piece_index == 3)
    new_state, _ = apply_move(state, 0, 1, final)
    assert new_state.finish_order == (0,)
    # next_active_player should skip 0 (finished).
    assert next_active_player(new_state, 0) == 1


def test_game_over_after_three_finish():
    pieces = _all_yard()
    state = GameState(
        pieces=tuple(tuple(row) for row in pieces),
        finish_order=(0, 1, 2),
    )
    assert is_game_over(state)
    state_2 = GameState(
        pieces=tuple(tuple(row) for row in pieces),
        finish_order=(0, 1),
    )
    assert not is_game_over(state_2)


def test_capture_no_extra_turn_when_not_six():
    pieces = _all_yard()
    pieces[0][0] = 5
    pieces[1][0] = 9
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 4)
    cap = next(m for m in moves if m.captures)
    new_state, extra = apply_move(state, 0, 4, cap)
    assert extra is True
    advanced = advance_after_turn(new_state, dice=4, move_applied=True, consumed_three_sixes=False)
    # Capture without 6 should keep current player.
    assert advanced.current_player == 0
