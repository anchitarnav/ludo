import { useEffect, useRef, useState } from "react";
import {
  BOARD_SIZE,
  COLOR_HEX,
  HOME_COLUMN_CELLS,
  SAFE_SQUARES,
  TRACK_CELLS,
  YARD,
  YARD_BOX,
  cellForPosition,
  computeDestination,
  type Color,
} from "../engine";
import type { RoomState } from "../engine";
import type { SoundApi } from "../sound";

const STEP_MS = 220;

interface PieceMarker {
  seat: number;
  piece: number;
}

interface Props {
  state: RoomState;
  highlightPieces: PieceMarker[];
  onPieceClick?: (pieceIndex: number) => void;
  activeSeat: number;
  sound: SoundApi;
}

type DisplayMatrix = number[][];

function snapshotPieces(state: RoomState): DisplayMatrix {
  return state.seats.map((s) => [...s.pieces]);
}

function computeAnimationPath(color: Color, from: number, to: number): number[] {
  if (from === YARD) return [to];
  if (from === to) return [];
  const path: number[] = [];
  let cur = from;
  for (let i = 0; i < 12; i++) {
    const next = computeDestination(color, cur, 1);
    if (next === null) break;
    path.push(next);
    cur = next;
    if (cur === to) return path;
  }
  return [to];
}

function useAnimatedPieces(state: RoomState, sound: SoundApi): DisplayMatrix {
  const [display, setDisplay] = useState<DisplayMatrix>(() => snapshotPieces(state));
  const prevRef = useRef<DisplayMatrix>(snapshotPieces(state));

  useEffect(() => {
    const newPieces = snapshotPieces(state);
    const prev = prevRef.current;
    prevRef.current = newPieces;

    interface Anim {
      seat: number;
      piece: number;
      path: number[];
    }
    const moves: Anim[] = [];
    const captures: { seat: number; piece: number }[] = [];
    const immediate: { seat: number; piece: number; to: number }[] = [];

    for (let s = 0; s < newPieces.length; s++) {
      for (let p = 0; p < newPieces[s].length; p++) {
        const before = prev[s]?.[p] ?? YARD;
        const after = newPieces[s][p];
        if (before === after) continue;
        if (after === YARD && before !== YARD) {
          captures.push({ seat: s, piece: p });
          continue;
        }
        const color = state.seats[s].color;
        const path = computeAnimationPath(color, before, after);
        if (path.length === 0) {
          immediate.push({ seat: s, piece: p, to: after });
        } else {
          moves.push({ seat: s, piece: p, path });
        }
      }
    }

    if (immediate.length > 0) {
      setDisplay((d) => {
        const copy = d.map((r) => [...r]);
        for (const { seat, piece, to } of immediate) copy[seat][piece] = to;
        return copy;
      });
    }

    const longestPath = moves.reduce((m, a) => Math.max(m, a.path.length), 0);
    const totalMoveMs = longestPath * STEP_MS;

    const stepTimers: number[] = [];
    if (moves.length > 0) {
      const remaining = moves.map((m) => ({ ...m, path: [...m.path] }));
      const ticker = window.setInterval(() => {
        setDisplay((d) => {
          const copy = d.map((r) => [...r]);
          let anyStepped = false;
          for (const item of remaining) {
            const next = item.path.shift();
            if (next !== undefined) {
              copy[item.seat][item.piece] = next;
              anyStepped = true;
            }
          }
          if (anyStepped) sound.play("step");
          return copy;
        });
        if (remaining.every((r) => r.path.length === 0)) {
          window.clearInterval(ticker);
        }
      }, STEP_MS);
      stepTimers.push(ticker);
    }

    let captureTimer: number | null = null;
    if (captures.length > 0) {
      captureTimer = window.setTimeout(() => {
        setDisplay((d) => {
          const copy = d.map((r) => [...r]);
          for (const c of captures) copy[c.seat][c.piece] = YARD;
          return copy;
        });
        captures.forEach(() => sound.play("capture"));
      }, totalMoveMs);
    }

    return () => {
      stepTimers.forEach((t) => window.clearInterval(t));
      if (captureTimer !== null) window.clearTimeout(captureTimer);
    };
  }, [state, sound]);

  // Resize display matrix if seat count changes (defensive).
  useEffect(() => {
    setDisplay((d) => {
      if (d.length === state.seats.length) return d;
      return snapshotPieces(state);
    });
  }, [state.seats.length, state]);

  return display;
}

export function Board({ state, highlightPieces, onPieceClick, activeSeat, sound }: Props) {
  const display = useAnimatedPieces(state, sound);
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

        <polygon
          points="6,6 9,6 7.5,7.5 9,9 6,9 7.5,7.5"
          fill="#ffffff"
          stroke="#475569"
          strokeWidth={0.06}
        />
        <circle cx={7.5} cy={7.5} r={0.6} fill="#cbd5e1" />

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

        {state.seats.flatMap((seat, seatIdx) => {
          if (seat.kind === "empty") return [];
          return seat.pieces.map((_, pieceIdx) => {
            const displayPos = display[seatIdx]?.[pieceIdx] ?? seat.pieces[pieceIdx];
            const cell = cellForPosition(seat.color, displayPos, pieceIdx);
            if (!cell) return null;
            const [cx, cy] = [cell[0] + 0.5, cell[1] + 0.5];
            const isHighlight = highlightSet.has(highlightKey(seatIdx, pieceIdx));
            const isActiveSeat = seatIdx === activeSeat;
            return (
              <g
                key={`piece-${seatIdx}-${pieceIdx}`}
                className="piece"
                transform={`translate(${cx} ${cy})`}
                onClick={() => isHighlight && onPieceClick?.(pieceIdx)}
                style={{ cursor: isHighlight ? "pointer" : "default" }}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={0.32}
                  fill={COLOR_HEX[seat.color]}
                  stroke={isHighlight ? "#facc15" : "#0f172a"}
                  strokeWidth={isHighlight ? 0.12 : 0.06}
                />
                {isActiveSeat && (
                  <circle
                    cx={0}
                    cy={0}
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
