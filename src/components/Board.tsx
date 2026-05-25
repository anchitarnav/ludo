import {
  BOARD_SIZE,
  COLOR_HEX,
  HOME_COLUMN_CELLS,
  SAFE_SQUARES,
  TRACK_CELLS,
  YARD_BOX,
  cellForPosition,
  type Color,
} from "../engine";
import type { RoomState } from "../engine";

interface PieceMarker {
  seat: number;
  piece: number;
}

interface Props {
  state: RoomState;
  highlightPieces: PieceMarker[];
  onPieceClick?: (pieceIndex: number) => void;
  activeSeat: number;
}

export function Board({ state, highlightPieces, onPieceClick, activeSeat }: Props) {
  const highlightKey = (seat: number, piece: number) => `${seat}:${piece}`;
  const highlightSet = new Set(highlightPieces.map((m) => highlightKey(m.seat, m.piece)));

  return (
    <div className="board-wrap">
      <svg
        className="board"
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={0} y={0} width={BOARD_SIZE} height={BOARD_SIZE} fill="#f8fafc" />

        {/* Yards */}
        {(Object.keys(YARD_BOX) as Color[]).map((color) => {
          const box = YARD_BOX[color];
          return (
            <g key={`yard-${color}`}>
              <rect
                x={box.col}
                y={box.row}
                width={box.size}
                height={box.size}
                fill={COLOR_HEX[color]}
                opacity={0.18}
                stroke={COLOR_HEX[color]}
                strokeWidth={0.08}
              />
              <rect
                x={box.col + 1}
                y={box.row + 1}
                width={box.size - 2}
                height={box.size - 2}
                fill="#ffffff"
                stroke={COLOR_HEX[color]}
                strokeWidth={0.06}
              />
            </g>
          );
        })}

        {/* Track cells */}
        {TRACK_CELLS.map(([col, row], idx) => (
          <rect
            key={`track-${idx}`}
            x={col}
            y={row}
            width={1}
            height={1}
            fill={SAFE_SQUARES.has(idx) ? "#e2e8f0" : "#ffffff"}
            stroke="#94a3b8"
            strokeWidth={0.04}
          />
        ))}

        {/* Home columns */}
        {(Object.keys(HOME_COLUMN_CELLS) as Color[]).map((color) =>
          HOME_COLUMN_CELLS[color].map(([col, row], idx) => (
            <rect
              key={`home-${color}-${idx}`}
              x={col}
              y={row}
              width={1}
              height={1}
              fill={COLOR_HEX[color]}
              opacity={0.45}
              stroke={COLOR_HEX[color]}
              strokeWidth={0.04}
            />
          )),
        )}

        {/* Center finished area */}
        <polygon
          points="6,6 9,6 7.5,7.5 9,9 6,9 7.5,7.5"
          fill="#ffffff"
          stroke="#475569"
          strokeWidth={0.06}
        />
        <circle cx={7.5} cy={7.5} r={0.6} fill="#cbd5e1" />

        {/* Safe-square stars */}
        {TRACK_CELLS.map(([col, row], idx) =>
          SAFE_SQUARES.has(idx) ? (
            <text
              key={`star-${idx}`}
              x={col + 0.5}
              y={row + 0.78}
              fontSize={0.7}
              textAnchor="middle"
              fill="#64748b"
            >
              ★
            </text>
          ) : null,
        )}

        {/* Pieces */}
        {state.seats.flatMap((seat, seatIdx) => {
          if (seat.kind === "empty") return [];
          return seat.pieces.map((pos, pieceIdx) => {
            const cell = cellForPosition(seat.color, pos, pieceIdx);
            if (!cell) return null;
            const [cx, cy] = [cell[0] + 0.5, cell[1] + 0.5];
            const isHighlight = highlightSet.has(highlightKey(seatIdx, pieceIdx));
            const isActiveSeat = seatIdx === activeSeat;
            return (
              <g
                key={`piece-${seatIdx}-${pieceIdx}`}
                onClick={() => isHighlight && onPieceClick?.(pieceIdx)}
                style={{ cursor: isHighlight ? "pointer" : "default" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={0.32}
                  fill={COLOR_HEX[seat.color]}
                  stroke={isHighlight ? "#facc15" : "#0f172a"}
                  strokeWidth={isHighlight ? 0.12 : 0.06}
                />
                {isActiveSeat && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={0.42}
                    fill="none"
                    stroke={COLOR_HEX[seat.color]}
                    strokeWidth={0.04}
                    opacity={0.5}
                  />
                )}
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}
