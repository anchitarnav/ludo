import { FINISHED, HOME_BASE, HOME_END, YARD } from "./board";
import { legalMoves } from "./engine";
import { mulberry32 } from "./rng";
import type {
  ActiveFavor,
  FavorKind,
  FavorLogEntry,
  FavorState,
  RoomState,
} from "./state";

export const FAVOR_KINDS: ReadonlyArray<FavorKind> = [
  "lucky_sixes",
  "stuck_on_ones",
  "guaranteed_kill",
  "home_stretch_sprint",
  "stay_home",
];

export const FAVOR_DURATION_MIN = 2;
export const FAVOR_DURATION_MAX = 4;
export const FAVOR_COOLDOWN_MIN = 2;
export const FAVOR_COOLDOWN_MAX = 4;
export const FAVOR_START_CHANCE = 0.85;

export function initialFavorState(): FavorState {
  return { active: null, cooldownRolls: FAVOR_COOLDOWN_MIN, rollCounter: 0 };
}

export interface FavorTickResult {
  value: number;
  favorState: FavorState;
  favorLog: FavorLogEntry[];
  fired: boolean;
}

export function tickFavor(
  state: RoomState,
  favor: FavorState,
  log: FavorLogEntry[],
  seat: number,
  honestRoll: number,
): FavorTickResult {
  if (state.seed === null) {
    return { value: honestRoll, favorState: favor, favorLog: log, fired: false };
  }

  const rng = mulberry32(((state.seed ^ 0xcafebabe) + favor.rollCounter) >>> 0);
  let nextFavor: FavorState = { ...favor, rollCounter: favor.rollCounter + 1 };
  let nextLog = log;
  let value = honestRoll;
  let fired = false;

  if (!nextFavor.active) {
    if (nextFavor.cooldownRolls > 0) {
      nextFavor.cooldownRolls = nextFavor.cooldownRolls - 1;
    }
    if (nextFavor.cooldownRolls === 0 && rng() < FAVOR_START_CHANCE) {
      const target = pickTargetSeat(state, rng);
      if (target !== null) {
        const kinds = eligibleKinds(state, target);
        if (kinds.length > 0) {
          const kind = kinds[Math.floor(rng() * kinds.length)];
          const duration = randInt(rng, FAVOR_DURATION_MIN, FAVOR_DURATION_MAX);
          nextFavor.active = {
            kind,
            targetSeat: target,
            rollsRemaining: duration,
            rollsAffected: 0,
          };
        }
      }
    }
  }

  if (nextFavor.active && nextFavor.active.targetSeat === seat) {
    const override = computeOverride(state, nextFavor.active, honestRoll);
    let rollsAffected = nextFavor.active.rollsAffected;
    if (override !== null && override !== honestRoll) {
      value = override;
      fired = true;
      rollsAffected += 1;
    }
    nextFavor.active = {
      ...nextFavor.active,
      rollsRemaining: nextFavor.active.rollsRemaining - 1,
      rollsAffected,
    };
    if (nextFavor.active.rollsRemaining <= 0) {
      nextLog = [
        ...nextLog,
        {
          kind: nextFavor.active.kind,
          targetSeat: nextFavor.active.targetSeat,
          rollsAffected: nextFavor.active.rollsAffected,
          endedAtVersion: state.version,
        },
      ];
      nextFavor.active = null;
      nextFavor.cooldownRolls = randInt(rng, FAVOR_COOLDOWN_MIN, FAVOR_COOLDOWN_MAX);
    }
  }

  return { value, favorState: nextFavor, favorLog: nextLog, fired };
}

export function eligibleKinds(state: RoomState, targetSeat: number): FavorKind[] {
  const player = state.seats[targetSeat];
  if (!player || player.kind === "empty") return [];
  // lucky_sixes and stuck_on_ones always have a visible effect.
  const eligible: FavorKind[] = ["lucky_sixes", "stuck_on_ones"];
  if (player.pieces.some((p) => p === YARD)) eligible.push("stay_home");
  if (player.pieces.some((p) => p >= HOME_BASE && p <= HOME_END)) {
    eligible.push("home_stretch_sprint");
  }
  for (let d = 1; d <= 6; d++) {
    if (legalMoves(state, targetSeat, d).some((m) => m.captures)) {
      eligible.push("guaranteed_kill");
      break;
    }
  }
  return eligible;
}

function pickTargetSeat(state: RoomState, rng: () => number): number | null {
  const eligible: number[] = [];
  for (let i = 0; i < state.seats.length; i++) {
    if (state.seats[i].kind !== "empty" && !state.finishOrder.includes(i)) {
      eligible.push(i);
    }
  }
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)];
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function computeOverride(
  state: RoomState,
  active: ActiveFavor,
  honestRoll: number,
): number | null {
  const player = state.seats[active.targetSeat];
  if (!player || player.kind === "empty") return null;

  switch (active.kind) {
    case "lucky_sixes":
      return 6;
    case "stuck_on_ones":
      return 1;
    case "stay_home": {
      if (player.pieces.every((p) => p !== YARD)) return null;
      return honestRoll === 6 ? 1 : null;
    }
    case "home_stretch_sprint": {
      const hsPieces = player.pieces.filter(
        (p) => p >= HOME_BASE && p <= HOME_END,
      );
      if (hsPieces.length === 0) return null;
      const finishingDice = hsPieces
        .map((p) => FINISHED - p)
        .filter((d) => d >= 1 && d <= 6);
      if (finishingDice.length > 0) {
        return Math.max(...finishingDice);
      }
      const maxAdvance = Math.max(
        ...hsPieces.map((p) => Math.min(6, HOME_END - p)),
      );
      return maxAdvance >= 1 ? maxAdvance : null;
    }
    case "guaranteed_kill": {
      for (let d = 6; d >= 1; d--) {
        const moves = legalMoves(state, active.targetSeat, d);
        if (moves.some((m) => m.captures)) return d;
      }
      return null;
    }
  }
}
