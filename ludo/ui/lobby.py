"""Lobby page: name entry, seat claiming, bot mode selection, start/close."""

from __future__ import annotations

import streamlit as st

from ..board import COLOR_NAMES
from ..lifecycle import (
    claim_slot,
    reclaim_slot_by_name,
    release_slot,
    set_bot_mode,
    start_game,
)
from ..state import BotMode, GameRoom
from ..store import delete_room


BOT_MODE_DESCRIPTIONS = {
    BotMode.NEUTRAL: "Honest dice, random legal moves.",
    BotMode.KILLER: "Honest dice, hunts captures, hangs back to set up kills.",
    BotMode.DEFENSIVE: "Honest dice, avoids capture range, prefers safe squares and blocks.",
    BotMode.CHEEKY: "Dishonest dice! Random favors (lucky sixes, stuck on ones, etc.) target any seat at random.",
}


def render_lobby(room: GameRoom, session_id: str, share_url: str) -> None:
    st.title(f"Lobby — Room `{room.room_id}`")

    st.caption("Share this URL so friends can join:")
    st.code(share_url, language=None)

    is_host = session_id == room.host_session_id
    my_seat = None
    with room.lock:
        my_seat = room.seat_of_session(session_id)

    if my_seat is None:
        _render_join_form(room, session_id)
    else:
        st.success(f"You're in seat {my_seat + 1} as **{room.slots[my_seat].name}** ({COLOR_NAMES[room.slots[my_seat].color]}).")
        if st.button("Leave seat", key=f"leave-{room.version}"):
            with room.lock:
                release_slot(room, my_seat, session_id)
            st.rerun()

    _render_seat_table(room)

    st.divider()

    if is_host:
        st.subheader("Game setup")
        current_mode = room.bot_mode
        mode_labels = {
            BotMode.NEUTRAL: "Neutral",
            BotMode.KILLER: "Killer",
            BotMode.DEFENSIVE: "Defensive",
            BotMode.CHEEKY: "Cheeky (dishonest dice)",
        }
        choice = st.radio(
            "Bot mode",
            options=list(BotMode),
            format_func=lambda m: mode_labels[m],
            index=list(BotMode).index(current_mode),
            key=f"mode-{room.version}",
            help="In Cheeky mode the dice can favor or sabotage any player — bots and humans — silently.",
        )
        st.caption(BOT_MODE_DESCRIPTIONS[choice])
        if choice != current_mode:
            with room.lock:
                set_bot_mode(room, choice, session_id)
            st.rerun()

        col_start, col_close = st.columns(2)
        with col_start:
            can_start = any(s.is_human for s in room.slots)
            if st.button(
                "Start game",
                type="primary",
                disabled=not can_start,
                key=f"start-{room.version}",
            ):
                with room.lock:
                    started = start_game(room, session_id)
                if started:
                    st.rerun()
        with col_close:
            if st.button("Close room", key=f"close-{room.version}"):
                delete_room(room.room_id)
                st.query_params.clear()
                st.rerun()
    else:
        st.info("Waiting for the host to start the game.")


def _render_join_form(room: GameRoom, session_id: str) -> None:
    st.subheader("Join the game")
    name = st.text_input("Your name", key=f"join-name-{room.version}", max_chars=24)
    open_seats = [s for s in room.slots if s.is_open]
    if not open_seats:
        # Maybe a stale slot to reclaim.
        st.warning("All seats are taken. If one is your name, type it above to reclaim it.")
        if name and st.button("Try to reclaim", key=f"reclaim-{room.version}"):
            with room.lock:
                seat = reclaim_slot_by_name(room, name, session_id)
            if seat is not None:
                st.rerun()
            else:
                st.error("No matching name found.")
        return

    seat_options = {s.seat_index: COLOR_NAMES[s.color] for s in open_seats}
    seat_choice = st.selectbox(
        "Pick a color",
        options=list(seat_options.keys()),
        format_func=lambda i: seat_options[i],
        key=f"seat-{room.version}",
    )
    if st.button("Take seat", disabled=not name.strip(), key=f"take-{room.version}"):
        with room.lock:
            ok = claim_slot(room, seat_choice, name, session_id)
        if ok:
            st.rerun()
        else:
            # Slot was taken between rendering and clicking — refresh and try again.
            st.warning("That seat was just taken. Refreshing.")
            st.rerun()


def _render_seat_table(room: GameRoom) -> None:
    st.subheader("Seats")
    for slot in room.slots:
        color_name = COLOR_NAMES[slot.color]
        if slot.is_open:
            line = f"**{color_name}** — _open_"
        elif slot.is_bot:
            line = f"**{color_name}** — 🤖 {slot.name}"
        else:
            you = " *(you)*" if slot.player_session_id else ""
            line = f"**{color_name}** — {slot.name}{you}"
        st.write(line)
