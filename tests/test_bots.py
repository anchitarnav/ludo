"""Bot strategy tests on crafted states."""

from __future__ import annotations

import random

from ludo.board import YARD
from ludo.bots import DefensiveBot, KillerBot, NeutralBot
from ludo.engine import legal_moves, make_state


def test_killer_prefers_capture():
    pieces = [[YARD] * 4 for _ in range(4)]
    pieces[0][0] = 5
    pieces[1][0] = 9
    pieces[1][1] = 20  # somewhere else
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 4)
    bot = KillerBot()
    rng = random.Random(0)
    choice = bot.choose_move(state, 0, 4, moves, rng)
    assert choice.captures, "Killer should pick the capture"


def test_defensive_avoids_capture_range():
    pieces = [[YARD] * 4 for _ in range(4)]
    # RED piece 0 at idx 10. Two RED pieces on track to compare against.
    pieces[0][0] = 10  # exposed if it stays here? Let's not move this one.
    pieces[0][1] = 50  # near home stretch, safe to advance
    # Opponent GREEN at idx 6 — could roll 4 to kill piece 0 if piece 0 moves to land in range.
    pieces[1][0] = 6
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 1)
    # piece 0 -> 11; piece 1 -> 51 (just before entry to stretch)
    bot = DefensiveBot()
    rng = random.Random(0)
    choice = bot.choose_move(state, 0, 1, moves, rng)
    # Both moves exist; piece 0 moving to 11 keeps it in capture range from idx 6 (distance 5)
    # piece 1 moving to 51 is safe (no opponent behind).
    assert choice.piece_index == 1, "defensive should pick the safer piece"


def test_neutral_picks_some_legal_move():
    pieces = [[YARD] * 4 for _ in range(4)]
    pieces[0][0] = 5
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 6)
    bot = NeutralBot()
    rng = random.Random(0)
    choice = bot.choose_move(state, 0, 6, moves, rng)
    assert choice in moves


def test_killer_avoids_overtaking_lead():
    """When no capture is available, Killer should not run ahead of the opponent leader."""
    pieces = [[YARD] * 4 for _ in range(4)]
    pieces[0][0] = 10  # RED piece a bit ahead
    pieces[1][0] = 20  # GREEN piece further along (more progress from its start at 13)
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 3)  # piece 0 -> 13 (captures? 13 is GREEN start = safe square)
    # 13 is a safe square so no capture. Move is permitted but does it overtake GREEN's lead?
    # RED progress at 13 = (13-0) % 52 = 13. GREEN's lead piece at 20 has progress (20-13)%52 = 7.
    # So RED at 13 has progress 13 > 7. KillerBot would prefer to NOT make that move if alternatives.
    # But here piece 0 is the only piece on track, and yard pieces can't move on dice=3. So only one move.
    # Adjust: give RED two pieces, one further behind.
    pieces[0][1] = 1  # RED piece on early track
    state = make_state(pieces, current_player=0)
    moves = legal_moves(state, 0, 3)
    bot = KillerBot()
    rng = random.Random(0)
    choice = bot.choose_move(state, 0, 3, moves, rng)
    # KillerBot should prefer moving piece 1 (1 -> 4, progress 4) over piece 0 (10 -> 13, progress 13)
    # because the latter overtakes GREEN's lead (progress 7).
    assert choice.piece_index == 1
