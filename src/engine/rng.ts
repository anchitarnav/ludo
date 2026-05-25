export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function diceRoll(rng: RNG): number {
  return 1 + Math.floor(rng() * 6);
}

export function pickSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
