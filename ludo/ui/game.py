"""Game page: board, dice, status, bot turn driver."""

from __future__ import annotations

import time

import streamlit as st
from streamlit_autorefresh import st_autorefresh
from streamlit_plotly_events import plotly_events

from ..board import COLOR_HEX, COLOR_NAMES
from ..engine import legal_moves
from ..lifecycle import claim_bot_turn, clear_bot_thinking, restart_game
from ..state import BotMode, GameRoom, Phase
from ..store import delete_room
from ..turn import apply_player_move, bot_apply_move, bot_roll, roll_dice
from .board_plot import build_board_figure, click_to_piece


# Bot pacing — longer than the original 1.0s so dice and piece animations have room to play.
BOT_THINK_BEFORE_ROLL = 0.9
BOT_THINK_BEFORE_MOVE = 0.6

# How long the CSS dice-spin animation runs, client side. Server uses this to pick
# the right CSS class for the dice container so the animation only plays on a fresh roll.
DICE_SPIN_SECONDS = 0.9

# Piece animation autorefresh cadence. ~7fps is choppy by film standards but the
# motion is cell-to-cell stepping rather than continuous, so it reads cleanly.
ANIM_REFRESH_MS = 140

DICE_GLYPHS = {1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅"}


def render_game(room: GameRoom, session_id: str) -> None:
    _inject_dice_css()

    with room.lock:
        my_seat = room.seat_of_session(session_id)

    current_seat = room.state.current_player
    is_my_turn = (my_seat is not None) and (current_seat == my_seat) and room.phase == Phase.PLAYING

    now = time.time()
    anim_active = room.anim_is_active(now)
    dice_anim_active = room.last_roll_at > 0 and (now - room.last_roll_at) < DICE_SPIN_SECONDS

    # Autorefresh policy:
    #   - while a piece is animating, tick fast for the cell-by-cell step.
    #   - while only the dice is spinning, tick once after the spin ends so the page
    #     can transition to "static dice" state (no continuous repolling needed).
    #   - otherwise, normal polling cadence when it's not my turn.
    if anim_active:
        st_autorefresh(interval=ANIM_REFRESH_MS, key=f"anim-{room.anim_started_at}")
    elif dice_anim_active:
        st_autorefresh(interval=int(DICE_SPIN_SECONDS * 1000) + 50,
                       key=f"dice-{room.last_roll_at}")
    elif room.phase == Phase.PLAYING and not is_my_turn:
        st_autorefresh(interval=800, key=f"auto-{room.room_id}-{room.version}")

    # Drive bots only while no animation is playing — let dice and piece animations
    # finish before the bot takes its next step.
    if (
        room.phase == Phase.PLAYING
        and room.slots[current_seat].is_bot
        and not anim_active
        and not dice_anim_active
    ):
        _try_run_bot_turn(room)

    _render_status(room, my_seat)
    _render_board_and_controls(room, my_seat, is_my_turn, anim_active)

    if room.phase == Phase.ENDED:
        _render_endgame(room, session_id)


def _try_run_bot_turn(room: GameRoom) -> None:
    """Claim and execute one bot step (either a roll, or a move). Reruns after."""
    with room.lock:
        if not claim_bot_turn(room):
            return
        needs_roll = not room.state.waiting_for_move
    try:
        if needs_roll:
            time.sleep(BOT_THINK_BEFORE_ROLL)
            with room.lock:
                bot_roll(room)
        else:
            time.sleep(BOT_THINK_BEFORE_MOVE)
            with room.lock:
                bot_apply_move(room)
    finally:
        with room.lock:
            clear_bot_thinking(room)
    st.rerun()


def _render_status(room: GameRoom, my_seat: int | None) -> None:
    cols = st.columns([3, 2])
    with cols[0]:
        st.title(f"Ludo — Room `{room.room_id}`")
        cp = room.state.current_player
        cp_color = COLOR_NAMES[room.slots[cp].color]
        cp_name = room.slots[cp].name
        is_bot = room.slots[cp].is_bot
        bot_tag = " 🤖" if is_bot else ""
        if room.phase == Phase.PLAYING:
            st.markdown(
                f"### Turn: **{cp_name}**{bot_tag} "
                f"<span style='color:{COLOR_HEX[room.slots[cp].color]}'>●</span> "
                f"({cp_color})",
                unsafe_allow_html=True,
            )
        elif room.phase == Phase.ENDED:
            st.markdown("### Game over")

        if room.state.last_dice is not None:
            st.caption(f"Last dice: **{room.state.last_dice}** · turn {room.state.turn_count}")
        if room.bot_mode == BotMode.CHEEKY:
            st.caption("✨ Cheeky mode active — dice may be dishonest.")

    with cols[1]:
        st.subheader("Players")
        for slot in room.slots:
            tag = " 🤖" if slot.is_bot else (" *(you)*" if slot.seat_index == my_seat else "")
            finished = " — 🏁" if slot.seat_index in room.state.finish_order else ""
            place = ""
            if slot.seat_index in room.state.finish_order:
                rank = room.state.finish_order.index(slot.seat_index) + 1
                place = f" ({_ordinal(rank)})"
            color_dot = f"<span style='color:{COLOR_HEX[slot.color]}'>●</span>"
            st.markdown(
                f"{color_dot} **{slot.name or COLOR_NAMES[slot.color]}**{tag}{finished}{place}",
                unsafe_allow_html=True,
            )


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}.get(n, f"{n}th")


def _render_board_and_controls(
    room: GameRoom, my_seat: int | None, is_my_turn: bool, anim_active: bool
) -> None:
    now = time.time()

    # Legal moves are only relevant when waiting on this player. Suppress the
    # glow ring while the piece-move animation is still playing.
    legal_pieces: list[tuple[int, int]] = []
    if (
        is_my_turn
        and my_seat is not None
        and room.state.waiting_for_move
        and room.state.last_dice is not None
        and not anim_active
    ):
        moves = legal_moves(room.state, my_seat, room.state.last_dice)
        legal_pieces = [(my_seat, m.piece_index) for m in moves]

    overrides: dict[tuple[int, int], int] = {}
    anim_pos = room.anim_current_position(now)
    if anim_pos is not None and room.anim_seat is not None and room.anim_piece_idx is not None:
        overrides[(room.anim_seat, room.anim_piece_idx)] = anim_pos

    fig = build_board_figure(
        room.state.pieces,
        legal_piece_indices=legal_pieces,
        position_overrides=overrides or None,
    )

    # Key the click handler off version+animation tick so plotly_events doesn't
    # cache stale clicks across renders, but doesn't replay one click many times.
    plotly_key = f"board-{room.room_id}-{room.version}-{room.anim_started_at:.2f}"
    selected = plotly_events(
        fig,
        click_event=True,
        select_event=False,
        hover_event=False,
        override_height=620,
        key=plotly_key,
    )

    if (
        is_my_turn
        and my_seat is not None
        and selected
        and room.state.waiting_for_move
        and not anim_active
    ):
        clicked = click_to_piece(selected)
        if clicked is not None:
            seat_clicked, piece_idx = clicked
            if seat_clicked == my_seat:
                with room.lock:
                    applied = apply_player_move(room, my_seat, piece_idx)
                if applied:
                    st.rerun()

    _render_dice_panel(room, is_my_turn, anim_active, now)


def _render_dice_panel(
    room: GameRoom, is_my_turn: bool, anim_active: bool, now: float
) -> None:
    """Big clickable dice. Click to roll when it's the local player's turn and not waiting."""
    can_click = (
        is_my_turn
        and not room.state.waiting_for_move
        and not anim_active
        and room.phase == Phase.PLAYING
    )
    dice_anim_active = room.last_roll_at > 0 and (now - room.last_roll_at) < DICE_SPIN_SECONDS

    if dice_anim_active:
        state = "rolling"
    elif can_click:
        state = "clickable"
    else:
        state = "static"

    last_dice = room.state.last_dice
    glyph = DICE_GLYPHS[last_dice] if last_dice in DICE_GLYPHS else "🎲"

    container_key = f"dice-frame-{state}-{room.version}"
    cols = st.columns([1, 2, 2])
    with cols[0]:
        with st.container(key=container_key):
            if can_click:
                if st.button(glyph, key=f"dice-btn-{room.version}",
                             help="Click to roll the dice"):
                    with room.lock:
                        roll_dice(room, room.state.current_player)
                    st.rerun()
            else:
                st.markdown(
                    f"<div class='dice-display'>{glyph}</div>",
                    unsafe_allow_html=True,
                )

    with cols[1]:
        if room.phase != Phase.PLAYING:
            return
        if anim_active:
            st.info("🚶 Piece moving…")
        elif is_my_turn:
            if not room.state.waiting_for_move:
                st.info("🎯 Your turn — click the dice to roll!")
            elif room.state.last_dice is not None:
                st.info(
                    f"You rolled **{room.state.last_dice}**. "
                    "Click a glowing piece to move it."
                )
        else:
            cp_name = room.slots[room.state.current_player].name
            bot = " 🤖" if room.slots[room.state.current_player].is_bot else ""
            if dice_anim_active:
                st.info(f"🎲 **{cp_name}**{bot} is rolling…")
            elif room.state.waiting_for_move:
                st.info(f"⏳ **{cp_name}**{bot} is choosing a move…")
            else:
                st.info(f"Waiting for **{cp_name}**{bot}…")


def _render_endgame(room: GameRoom, session_id: str) -> None:
    st.divider()
    st.header("Final standings")
    for rank, seat in enumerate(room.state.finish_order):
        slot = room.slots[seat]
        st.markdown(f"**{_ordinal(rank + 1)}** — {slot.name} ({COLOR_NAMES[slot.color]})")

    if room.bot_mode == BotMode.CHEEKY and room.favor_log:
        with st.expander("Reveal Cheeky favor log"):
            for ev in room.favor_log:
                seat = ev.target_player
                slot = room.slots[seat]
                st.write(
                    f"Turn {ev.turn_count}: **{slot.name}** ({COLOR_NAMES[slot.color]}) — "
                    f"{ev.favor_kind} → forced {ev.forced_value}"
                )

    if session_id == room.host_session_id:
        col_a, col_b = st.columns(2)
        with col_a:
            if st.button("Restart with same seats", type="primary", key=f"restart-{room.version}"):
                with room.lock:
                    restart_game(room, session_id)
                st.rerun()
        with col_b:
            if st.button("Close room", key=f"close-end-{room.version}"):
                delete_room(room.room_id)
                st.query_params.clear()
                st.rerun()


def _inject_dice_css() -> None:
    """Inject dice-styling CSS on every rerun. Streamlit re-renders markdown by
    position, so a one-shot session-state guard would drop the styles after the
    first run. Targets containers keyed by state — Streamlit assigns each
    container with key=K a CSS class `st-key-K`, so we hook
    `dice-frame-rolling-*`, `dice-frame-clickable-*`, and `dice-frame-static-*`
    independently. The `[class*=...]` selector picks up the version-suffixed
    variants.
    """
    st.markdown(
        """
        <style>
        /* Base dice look — applied to both the button and the display div. */
        [class*="st-key-dice-frame-"] button,
        [class*="st-key-dice-frame-"] .dice-display {
            width: 96px;
            height: 96px;
            font-size: 64px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 16px;
            background: #ffffff;
            border: 3px solid #2c3e50;
            box-shadow:
                0 4px 10px rgba(0, 0, 0, 0.18),
                inset 0 -4px 0 rgba(0, 0, 0, 0.08);
            color: #2c3e50;
            user-select: none;
            padding: 0 !important;
        }
        [class*="st-key-dice-frame-"] button p {
            font-size: 64px !important;
            line-height: 1 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* Clickable: gentle pulse so the player knows it's their turn. */
        [class*="st-key-dice-frame-clickable-"] button {
            animation: dice-pulse 1.6s ease-in-out infinite;
            cursor: pointer;
        }
        [class*="st-key-dice-frame-clickable-"] button:hover {
            transform: scale(1.07) rotate(-6deg);
            box-shadow: 0 8px 22px rgba(255, 180, 0, 0.55);
            animation: none;
        }

        /* Rolling: a single spin/bounce play. animation-iteration-count: 1 keeps it from looping. */
        [class*="st-key-dice-frame-rolling-"] button,
        [class*="st-key-dice-frame-rolling-"] .dice-display {
            animation: dice-spin 0.9s cubic-bezier(0.22, 0.61, 0.36, 1) 1;
        }

        /* Static: nothing fancy. */
        [class*="st-key-dice-frame-static-"] .dice-display {
            opacity: 0.92;
        }

        @keyframes dice-spin {
            0%   { transform: rotate(0deg)   scale(0.55); opacity: 0.4; }
            35%  { transform: rotate(220deg) scale(1.25); opacity: 1.0; }
            70%  { transform: rotate(340deg) scale(0.95); }
            100% { transform: rotate(360deg) scale(1.0);  }
        }
        @keyframes dice-pulse {
            0%, 100% {
                transform: scale(1.0);
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18),
                            inset 0 -4px 0 rgba(0, 0, 0, 0.08);
            }
            50% {
                transform: scale(1.05);
                box-shadow: 0 8px 22px rgba(255, 180, 0, 0.5),
                            inset 0 -4px 0 rgba(0, 0, 0, 0.08);
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
