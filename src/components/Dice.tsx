import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  canRoll: boolean;
  onRoll: () => void;
}

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

const SETTLE_MS = 700;
const FLICKER_MS = 70;

function DieFace({ face }: { face: number }) {
  const pips = PIP_POSITIONS[face] ?? [];
  return (
    <svg viewBox="0 0 1 1" className="die-face" preserveAspectRatio="xMidYMid meet">
      <rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.16" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.04" />
      {pips.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.085" fill="#0f172a" />
      ))}
    </svg>
  );
}

export function Dice({ value, canRoll, onRoll }: Props) {
  const [displayed, setDisplayed] = useState<number>(value ?? 1);
  const [rolling, setRolling] = useState(false);
  const prevValueRef = useRef<number | null>(value);
  const flickerRef = useRef<number | null>(null);
  const settleRef = useRef<number | null>(null);
  const rollPendingRef = useRef(false);

  function stopAnimation() {
    if (flickerRef.current !== null) {
      window.clearInterval(flickerRef.current);
      flickerRef.current = null;
    }
    if (settleRef.current !== null) {
      window.clearTimeout(settleRef.current);
      settleRef.current = null;
    }
  }

  function startFlicker() {
    if (flickerRef.current !== null) return;
    flickerRef.current = window.setInterval(() => {
      setDisplayed(1 + Math.floor(Math.random() * 6));
    }, FLICKER_MS);
  }

  function scheduleSettle(target: number) {
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      if (flickerRef.current !== null) {
        window.clearInterval(flickerRef.current);
        flickerRef.current = null;
      }
      setDisplayed(target);
      setRolling(false);
      settleRef.current = null;
      rollPendingRef.current = false;
    }, SETTLE_MS);
  }

  useEffect(() => {
    if (value === null) {
      // Mutation didn't change dice (e.g. not our turn, or turn just passed).
      // If we were optimistically rolling, give up.
      if (rollPendingRef.current) {
        stopAnimation();
        setRolling(false);
        rollPendingRef.current = false;
      }
      prevValueRef.current = null;
      return;
    }
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;

    setRolling(true);
    startFlicker();
    scheduleSettle(value);

    return () => {
      // cleanup happens implicitly when next value-change fires
    };
  }, [value]);

  useEffect(() => () => stopAnimation(), []);

  function handleClick() {
    if (!canRoll) return;
    // Optimistic flicker — start spinning immediately so the click feels instant.
    rollPendingRef.current = true;
    setRolling(true);
    startFlicker();
    onRoll();
  }

  const status = canRoll
    ? "Tap the dice to roll"
    : rolling
      ? "Rolling…"
      : value
        ? "Move a piece"
        : "Waiting…";

  return (
    <div className="dice-bar">
      <button
        type="button"
        className={`die-button${canRoll ? " can-roll" : ""}${rolling ? " rolling-shadow" : ""}`}
        disabled={!canRoll}
        onClick={handleClick}
        aria-label={canRoll ? "Roll dice" : status}
      >
        <div className={`die${rolling ? " rolling" : ""}`}>
          {value === null && !rolling ? (
            <DieFace face={1} />
          ) : (
            <DieFace face={displayed} />
          )}
        </div>
      </button>
      <span className="dice-status muted">{status}</span>
    </div>
  );
}
