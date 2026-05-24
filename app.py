"""Cheeky Ludo — Streamlit entrypoint.

Routing:
  - No `room` query param → landing page (create or join by code).
  - With `room` query param → lobby or game depending on room.phase.

Per-session identity lives in st.session_state['player_session_id'].
The store is a process-singleton dict; same room id resolves to the same
GameRoom object across all sessions.
"""

from __future__ import annotations

import uuid

import streamlit as st

from ludo.state import Phase
from ludo.store import create_room, get_room
from ludo.ui.game import render_game
from ludo.ui.lobby import render_lobby


st.set_page_config(page_title="Cheeky Ludo", page_icon="🎲", layout="wide")


def _ensure_session_id() -> str:
    if "player_session_id" not in st.session_state:
        st.session_state["player_session_id"] = str(uuid.uuid4())
    return st.session_state["player_session_id"]


def _share_url(room_id: str) -> str:
    """Best-effort: just emit the path. Users can copy & share."""
    return f"?room={room_id}"


def render_landing(session_id: str) -> None:
    st.title("🎲 Cheeky Ludo")
    st.caption("Not so honest Ludo. Create a room, share the link, fill seats. Bots fill the rest.")
    col_new, col_join = st.columns(2)

    with col_new:
        st.subheader("Create a new game")
        if st.button("Create room", type="primary", key="create-room-btn"):
            room = create_room(session_id)
            st.query_params["room"] = room.room_id
            st.rerun()

    with col_join:
        st.subheader("Join with a code")
        code = st.text_input("Room code", key="join-code").strip().upper()
        if st.button("Join", disabled=not code, key="join-code-btn"):
            room = get_room(code)
            if room is None:
                st.error(f"No room with code `{code}`.")
            else:
                st.query_params["room"] = code
                st.rerun()


def main() -> None:
    session_id = _ensure_session_id()
    room_id = st.query_params.get("room")
    if isinstance(room_id, list):
        room_id = room_id[0] if room_id else None

    if not room_id:
        render_landing(session_id)
        return

    room = get_room(room_id.upper())
    if room is None:
        st.error(f"Room `{room_id}` doesn't exist (or was closed). Returning to landing.")
        st.query_params.clear()
        if st.button("Back"):
            st.rerun()
        return

    if room.phase == Phase.LOBBY:
        render_lobby(room, session_id, _share_url(room.room_id))
    else:
        render_game(room, session_id)


if __name__ == "__main__":
    main()
else:
    main()
