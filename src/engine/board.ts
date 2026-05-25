export const YARD = -1;
export const FINISHED = 106;
export const HOME_BASE = 100;
export const HOME_END = 105;
export const TRACK_LENGTH = 52;

export const COLORS = ["red", "green", "yellow", "blue"] as const;
export type Color = (typeof COLORS)[number];

export const SEAT_COLOR: Record<number, Color> = {
  0: "red",
  1: "green",
  2: "yellow",
  3: "blue",
};

export const START_OFFSET: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const SAFE_SQUARES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function homeEntry(color: Color): number {
  return (START_OFFSET[color] - 1 + TRACK_LENGTH) % TRACK_LENGTH;
}

export function isOnMainTrack(pos: number): boolean {
  return pos >= 0 && pos < TRACK_LENGTH;
}

export function isOnHomeStretch(pos: number): boolean {
  return pos >= HOME_BASE && pos <= HOME_END;
}

export function isYard(pos: number): boolean {
  return pos === YARD;
}

export function isFinished(pos: number): boolean {
  return pos === FINISHED;
}

// --- Board geometry (15x15 grid, origin top-left, used by the SVG renderer) ---
// Yards occupy the 4 corners (RED top-left, GREEN top-right, YELLOW bottom-right,
// BLUE bottom-left). The path is a 52-square ring; squares are listed in
// clockwise traversal order starting from RED's start.

export const BOARD_SIZE = 15;
export const CENTER_CELL: readonly [number, number] = [7, 7];

export const TRACK_CELLS: ReadonlyArray<readonly [number, number]> = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

export const HOME_COLUMN_CELLS: Record<Color, ReadonlyArray<readonly [number, number]>> = {
  red:    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green:  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue:   [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};

// Yard cells (4 parked-piece spots per color, inside the 6×6 corner yard).
export const YARD_CELLS: Record<Color, ReadonlyArray<readonly [number, number]>> = {
  red:    [[1, 1], [4, 1], [1, 4], [4, 4]],
  green:  [[10, 1], [13, 1], [10, 4], [13, 4]],
  yellow: [[10, 10], [13, 10], [10, 13], [13, 13]],
  blue:   [[1, 10], [4, 10], [1, 13], [4, 13]],
};

export const YARD_BOX: Record<Color, { col: number; row: number; size: number }> = {
  red:    { col: 0, row: 0, size: 6 },
  green:  { col: 9, row: 0, size: 6 },
  yellow: { col: 9, row: 9, size: 6 },
  blue:   { col: 0, row: 9, size: 6 },
};

export const COLOR_HEX: Record<Color, string> = {
  red:    "#e63946",
  green:  "#2a9d8f",
  yellow: "#f4c542",
  blue:   "#1d4ed8",
};

export function cellForPosition(color: Color, position: number, yardSlot: number): readonly [number, number] | null {
  if (position === YARD) return YARD_CELLS[color][yardSlot] ?? null;
  if (position === FINISHED) return CENTER_CELL;
  if (position >= HOME_BASE && position <= HOME_END) {
    return HOME_COLUMN_CELLS[color][position - HOME_BASE] ?? null;
  }
  if (position >= 0 && position < TRACK_LENGTH) {
    return TRACK_CELLS[position] ?? null;
  }
  return null;
}
