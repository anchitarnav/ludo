interface Props {
  value: number | null;
  canRoll: boolean;
  onRoll: () => void;
}

export function Dice({ value, canRoll, onRoll }: Props) {
  return (
    <div className="dice-bar">
      <div className="die" aria-label={value ? `Dice ${value}` : "No roll"}>
        {value ?? "—"}
      </div>
      <button className="primary" disabled={!canRoll} onClick={onRoll}>
        {canRoll ? "Roll" : value ? "Move a piece" : "Waiting…"}
      </button>
    </div>
  );
}
