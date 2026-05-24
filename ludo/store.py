"""Process-wide room registry. Cross-session sharing happens through this singleton.

Streamlit's @st.cache_resource guarantees the registry is initialized exactly once
per process; every session in every thread receives the same dict instance. The
module-level RLock guards dict mutation (create / delete / eviction); per-room
locks live on each GameRoom and guard that room's contents.
"""

from __future__ import annotations

import random
import secrets
import threading
import time
from typing import Optional

import streamlit as st

from .state import GameRoom


# Rooms idle for this many seconds get evicted on next access.
ROOM_IDLE_TTL_SECONDS = 6 * 3600

# Module-level lock for inserting/removing rooms.
_store_lock = threading.RLock()


@st.cache_resource
def get_store() -> dict[str, GameRoom]:
    """Process-singleton room registry. Same dict for every session."""
    return {}


def _generate_room_code() -> str:
    # Crockford-ish base32 (no I/O/L/U) gives short, voice-friendly codes.
    alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


def create_room(host_session_id: str) -> GameRoom:
    """Create a new room with a unique code. Caller becomes host."""
    store = get_store()
    with _store_lock:
        _reap_idle(store)
        # Loop until we find an unused code (collisions are vanishingly rare).
        for _ in range(20):
            code = _generate_room_code()
            if code not in store:
                room = GameRoom(
                    room_id=code,
                    host_session_id=host_session_id,
                    rng=random.Random(),
                )
                store[code] = room
                return room
        raise RuntimeError("Could not allocate a unique room code")


def get_room(room_id: str) -> Optional[GameRoom]:
    store = get_store()
    # Lock-free read; dict reads on str keys are safe under the GIL.
    return store.get(room_id)


def delete_room(room_id: str) -> None:
    store = get_store()
    with _store_lock:
        store.pop(room_id, None)


def _reap_idle(store: dict[str, GameRoom]) -> None:
    """Evict rooms idle past TTL. Caller holds _store_lock."""
    now = time.time()
    stale = [rid for rid, room in store.items() if now - room.last_activity_at > ROOM_IDLE_TTL_SECONDS]
    for rid in stale:
        store.pop(rid, None)
