"""Plotly figure for the Ludo board.

Coordinates use a 15×15 grid with origin (0,0) at the bottom-left. The four
yards live in the corners (6×6), the cross arms run through the middle (3×15),
and the center is a 3×3 finish square. Pieces are rendered as scatter markers
with `customdata` carrying (seat_index, piece_index) so click events can be
mapped back to a move.

Geometric invariants:
  - RED launch (track idx 0) = (0,6). Adjacent to RED's yard (bottom-left).
  - GREEN launch (idx 13) = (8,0). Adjacent to GREEN's yard (bottom-right).
  - YELLOW launch (idx 26) = (14,8). Adjacent to YELLOW's yard (top-right).
  - BLUE launch (idx 39) = (6,14). Adjacent to BLUE's yard (top-left).
  - Each color's home-stretch entry (idx start-1) sits directly next to stretch idx 0.
"""

from __future__ import annotations

from typing import Iterable

import plotly.graph_objects as go

from ..board import (
    COLOR_HEX,
    FINISHED,
    HOME_STRETCH_BASE,
    SAFE_SQUARES,
    START_OFFSET,
    Color,
    is_in_home_stretch,
    is_on_track,
)


GRID = 15

# Track in (x, y) grid units, 52 cells. Index 0 = RED launch.
TRACK_CELLS: list[tuple[int, int]] = [
    (0, 6),  # 0  RED launch
    (1, 6), (2, 6), (3, 6), (4, 6), (5, 6),
    (6, 5), (6, 4), (6, 3), (6, 2), (6, 1), (6, 0),
    (7, 0),  # 12 (RED entry to home stretch is here for GREEN actually -- see invariant)
    (8, 0),  # 13 GREEN launch
    (8, 1), (8, 2), (8, 3), (8, 4), (8, 5),
    (9, 6), (10, 6), (11, 6), (12, 6), (13, 6), (14, 6),
    (14, 7),  # 25
    (14, 8),  # 26 YELLOW launch
    (13, 8), (12, 8), (11, 8), (10, 8), (9, 8),
    (8, 9), (8, 10), (8, 11), (8, 12), (8, 13), (8, 14),
    (7, 14),  # 38
    (6, 14),  # 39 BLUE launch
    (6, 13), (6, 12), (6, 11), (6, 10), (6, 9),
    (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8),
    (0, 7),  # 51 RED entry to home stretch
]
assert len(TRACK_CELLS) == 52


def _cell_center(cell: tuple[int, int]) -> tuple[float, float]:
    return (cell[0] + 0.5, cell[1] + 0.5)


TRACK_COORDS: list[tuple[float, float]] = [_cell_center(c) for c in TRACK_CELLS]


def _yard_corner(color: Color) -> tuple[int, int]:
    """Bottom-left corner of each color's yard, in grid units."""
    return {
        Color.RED: (0, 0),
        Color.GREEN: (9, 0),
        Color.YELLOW: (9, 9),
        Color.BLUE: (0, 9),
    }[color]


def _yard_piece_xy(color: Color, piece_index: int) -> tuple[float, float]:
    cx, cy = _yard_corner(color)
    anchors = [(cx + 1.5, cy + 1.5), (cx + 4.5, cy + 1.5),
               (cx + 1.5, cy + 4.5), (cx + 4.5, cy + 4.5)]
    return anchors[piece_index]


# Home stretch cells, ordered from outer (idx 0) to inner (idx 5).
HOME_STRETCH_CELLS: dict[Color, list[tuple[int, int]]] = {
    Color.RED: [(x, 7) for x in range(1, 7)],          # (1,7)..(6,7)
    Color.GREEN: [(7, y) for y in range(1, 7)],        # (7,1)..(7,6)
    Color.YELLOW: [(x, 7) for x in range(13, 7, -1)],  # (13,7)..(8,7)
    Color.BLUE: [(7, y) for y in range(13, 7, -1)],    # (7,13)..(7,8)
}

HOME_STRETCH_COORDS: dict[Color, list[tuple[float, float]]] = {
    c: [_cell_center(cell) for cell in cells] for c, cells in HOME_STRETCH_CELLS.items()
}

FINISH_CENTER = (7.5, 7.5)


def piece_xy(color: Color, pos: int, piece_index: int) -> tuple[float, float]:
    if pos == -1:
        return _yard_piece_xy(color, piece_index)
    if is_on_track(pos):
        return TRACK_COORDS[pos]
    if is_in_home_stretch(pos):
        idx = pos - HOME_STRETCH_BASE
        return HOME_STRETCH_COORDS[color][idx]
    if pos == FINISHED:
        offsets = [(-0.3, -0.3), (0.3, -0.3), (-0.3, 0.3), (0.3, 0.3)]
        ox, oy = offsets[piece_index]
        return (FINISH_CENTER[0] + ox, FINISH_CENTER[1] + oy)
    return FINISH_CENTER


def _rect(x0, y0, x1, y1, fill, line=None, layer="below"):
    return dict(
        type="rect",
        x0=x0, y0=y0, x1=x1, y1=y1,
        fillcolor=fill,
        line=dict(color=(line or fill), width=1),
        layer=layer,
    )


YARD_FILL = {
    Color.RED: "#ffd5d5",
    Color.GREEN: "#d4f3df",
    Color.YELLOW: "#fdf2c2",
    Color.BLUE: "#cfe6f7",
}


def build_board_figure(
    pieces: tuple[tuple[int, ...], ...],
    legal_piece_indices: Iterable[tuple[int, int]] = (),
    position_overrides: dict[tuple[int, int], int] | None = None,
) -> go.Figure:
    fig = go.Figure()
    shapes = []

    # Board background
    shapes.append(_rect(0, 0, GRID, GRID, "#fafafa", "#444"))

    # Yards
    for c in Color:
        cx, cy = _yard_corner(c)
        shapes.append(_rect(cx, cy, cx + 6, cy + 6, YARD_FILL[c], COLOR_HEX[c]))
        shapes.append(_rect(cx + 1, cy + 1, cx + 5, cy + 5, "#ffffff", "#888"))

    # Plain track cells
    for (tx, ty) in TRACK_CELLS:
        shapes.append(_rect(tx, ty, tx + 1, ty + 1, "#ffffff", "#bbb"))

    # Safe star squares (lightly shaded)
    for idx in SAFE_SQUARES:
        tx, ty = TRACK_CELLS[idx]
        shapes.append(_rect(tx, ty, tx + 1, ty + 1, "#ececec", "#666"))

    # Color the launch squares strongly
    for c in Color:
        tx, ty = TRACK_CELLS[START_OFFSET[c]]
        shapes.append(_rect(tx, ty, tx + 1, ty + 1, YARD_FILL[c], COLOR_HEX[c]))

    # Home stretch cells
    for c in Color:
        for (hx, hy) in HOME_STRETCH_CELLS[c]:
            shapes.append(_rect(hx, hy, hx + 1, hy + 1, YARD_FILL[c], COLOR_HEX[c]))

    # Center finish (3x3)
    shapes.append(_rect(6, 6, 9, 9, "#dddddd", "#333"))

    overrides = position_overrides or {}

    def _pos_for(seat: int, pi: int) -> int:
        return overrides.get((seat, pi), pieces[seat][pi])

    # Glow ring under legal pieces
    legal_set = set(legal_piece_indices)
    if legal_set:
        glow_x, glow_y = [], []
        for seat in range(4):
            for pi in range(len(pieces[seat])):
                if (seat, pi) in legal_set:
                    color = Color(seat)
                    x, y = piece_xy(color, _pos_for(seat, pi), pi)
                    glow_x.append(x)
                    glow_y.append(y)
        if glow_x:
            fig.add_trace(go.Scatter(
                x=glow_x, y=glow_y,
                mode="markers",
                marker=dict(size=36, color="rgba(255, 215, 0, 0.55)", line=dict(width=0)),
                hoverinfo="skip",
                showlegend=False,
                name="legal_glow",
            ))

    # Pieces — one trace per seat for cleaner color handling
    for seat in range(4):
        color = Color(seat)
        xs, ys, cdata, hover = [], [], [], []
        for pi in range(len(pieces[seat])):
            pos = _pos_for(seat, pi)
            x, y = piece_xy(color, pos, pi)
            xs.append(x)
            ys.append(y)
            cdata.append([seat, pi])
            hover.append(f"{color.name.title()} piece {pi + 1} @ pos {pos}")
        fig.add_trace(go.Scatter(
            x=xs, y=ys,
            mode="markers+text",
            text=[str(i + 1) for i in range(4)],
            textposition="middle center",
            textfont=dict(color="white", size=10),
            marker=dict(
                size=24,
                color=COLOR_HEX[color],
                line=dict(color="black", width=1.5),
            ),
            customdata=cdata,
            hovertext=hover,
            hoverinfo="text",
            showlegend=False,
            name=color.name.title(),
        ))

    fig.update_layout(
        shapes=shapes,
        xaxis=dict(visible=False, range=[-0.2, GRID + 0.2], scaleanchor="y", scaleratio=1),
        yaxis=dict(visible=False, range=[-0.2, GRID + 0.2]),
        margin=dict(l=10, r=10, t=10, b=10),
        plot_bgcolor="white",
        height=620,
        clickmode="event+select",
    )
    return fig


def click_to_piece(click_payload) -> tuple[int, int] | None:
    """Convert a streamlit-plotly-events click event to (seat, piece_idx)."""
    if not click_payload:
        return None
    if isinstance(click_payload, list):
        if not click_payload:
            return None
        click_payload = click_payload[0]
    cd = click_payload.get("customdata") if isinstance(click_payload, dict) else None
    if not cd or len(cd) < 2:
        return None
    try:
        return int(cd[0]), int(cd[1])
    except (TypeError, ValueError):
        return None
