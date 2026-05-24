"""Room-lifecycle transitions: claim a slot, start the game, end / restart."""

from __future__ import annotations

import random

from .favor import initial_favor_state
from .state import BotMode, GameRoom, GameState, Phase


def claim_slot(room: GameRoom, seat_index: int, name: str, session_id: str) -> bool:
    """Claim an open seat. Returns True on success."""
    if room.phase != Phase.LOBBY:
        return False
    if not (0 <= seat_index < 4):
        return False
    # Already seated under this session_id elsewhere? Then refuse to take a second seat.
    if room.seat_of_session(session_id) is not None and room.seat_of_session(session_id) != seat_index:
        return False
    slot = room.slots[seat_index]
    if not slot.is_open and slot.player_session_id != session_id:
        return False
    slot.name = name.strip()[:24] or f"Player {seat_index + 1}"
    slot.is_bot = False
    slot.player_session_id = session_id
    room.bump()
    return True


def release_slot(room: GameRoom, seat_index: int, session_id: str) -> bool:
    if room.phase != Phase.LOBBY:
        return False
    slot = room.slots[seat_index]
    if slot.player_session_id != session_id:
        return False
    slot.player_session_id = ""
    slot.name = ""
    slot.is_bot = False
    room.bump()
    return True


def reclaim_slot_by_name(room: GameRoom, name: str, new_session_id: str) -> int | None:
    """If a seat holds a stale session whose human went away, allow the same-named user to take it back."""
    if room.phase == Phase.ENDED:
        return None
    target = name.strip().lower()
    if not target:
        return None
    for slot in room.slots:
        if slot.is_bot:
            continue
        if not slot.is_human:
            continue
        if slot.name.strip().lower() == target:
            slot.player_session_id = new_session_id
            room.bump()
            return slot.seat_index
    return None


def set_bot_mode(room: GameRoom, mode: BotMode, by_session_id: str) -> bool:
    if room.phase != Phase.LOBBY:
        return False
    if by_session_id != room.host_session_id:
        return False
    room.bot_mode = mode
    room.bump()
    return True


def start_game(room: GameRoom, by_session_id: str, seed: int | None = None) -> bool:
    """Host fills empty seats with bots and transitions to PLAYING."""
    if room.phase != Phase.LOBBY:
        return False
    if by_session_id != room.host_session_id:
        return False
    if not any(s.is_human for s in room.slots):
        return False

    for slot in room.slots:
        if slot.is_open:
            slot.is_bot = True
            slot.name = f"Bot ({slot.color.name.title()})"

    room.rng = random.Random(seed)
    room.state = GameState.initial()
    room.favor_state = initial_favor_state(room.rng)
    room.favor_log.clear()
    room.phase = Phase.PLAYING
    room.bot_thinking = False
    room.bump()
    return True


def restart_game(room: GameRoom, by_session_id: str) -> bool:
    """Reset to LOBBY but keep human seats; bots are cleared."""
    if by_session_id != room.host_session_id:
        return False
    if room.phase not in (Phase.ENDED, Phase.PLAYING):
        return False
    for slot in room.slots:
        if slot.is_bot:
            slot.is_bot = False
            slot.name = ""
            slot.player_session_id = ""
    room.phase = Phase.LOBBY
    room.state = GameState.initial()
    room.favor_log.clear()
    room.bot_thinking = False
    room.bump()
    return True


def claim_bot_turn(room: GameRoom) -> bool:
    """Atomic 'I'll run the bot turn' flag-set. Caller holds room.lock."""
    if room.phase != Phase.PLAYING:
        return False
    seat = room.state.current_player
    if not room.slots[seat].is_bot:
        return False
    if room.bot_thinking:
        return False
    room.bot_thinking = True
    return True


def clear_bot_thinking(room: GameRoom) -> None:
    room.bot_thinking = False
