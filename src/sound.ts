import { useCallback, useMemo, useState } from "react";

const MUTE_KEY = "cheeky-ludo:muted";

export type SoundKind = "roll" | "step" | "capture" | "finish";

interface AudioBundle {
  ctx: AudioContext;
  destination: GainNode;
}

let cached: AudioBundle | null = null;

function audio(): AudioBundle | null {
  if (cached) return cached;
  type AnyWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as AnyWindow).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const destination = ctx.createGain();
  destination.gain.value = 0.4;
  destination.connect(ctx.destination);
  cached = { ctx, destination };
  return cached;
}

function beep(kind: SoundKind) {
  const a = audio();
  if (!a) return;
  const { ctx, destination } = a;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;

  const tone = (type: OscillatorType, fStart: number, fEnd: number, dur: number, gain: number, t = now) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g).connect(destination);
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, t);
    if (fEnd !== fStart) osc.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  switch (kind) {
    case "roll":
      tone("square", 180, 380, 0.22, 0.3);
      break;
    case "step":
      tone("triangle", 560, 560, 0.08, 0.22);
      break;
    case "capture":
      tone("sawtooth", 280, 80, 0.28, 0.4);
      break;
    case "finish":
      tone("sine", 600, 600, 0.22, 0.3, now);
      tone("sine", 800, 800, 0.22, 0.3, now + 0.13);
      tone("sine", 1000, 1000, 0.3, 0.3, now + 0.26);
      break;
  }
}

export interface SoundApi {
  play: (kind: SoundKind) => void;
  toggleMuted: () => void;
  muted: boolean;
}

export function useSound(): SoundApi {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const play = useCallback(
    (kind: SoundKind) => {
      if (muted) return;
      try {
        beep(kind);
      } catch {
        // best-effort
      }
    },
    [muted],
  );

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return useMemo(() => ({ play, toggleMuted, muted }), [play, toggleMuted, muted]);
}
