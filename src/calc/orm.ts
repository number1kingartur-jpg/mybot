export function calcOneRm(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  const epley = weightKg * (1 + reps / 30);
  const brzycki = weightKg * (36 / (37 - reps));
  const lander = (100 * weightKg) / (101.3 - 2.67123 * reps);
  return Math.round(((epley + brzycki + lander) / 3) * 10) / 10;
}

export interface PctRow {
  pct: number;
  weightKg: number;
  reps: number;
}

const PCT_REPS: [number, number][] = [
  [100, 1], [97, 1], [95, 2], [90, 3], [85, 5],
  [80, 6], [75, 8], [70, 10], [65, 12], [60, 15],
];

export function pctTable(oneRm: number): PctRow[] {
  return PCT_REPS.map(([pct, reps]) => ({
    pct,
    weightKg: Math.round((oneRm * pct) / 100 / 2.5) * 2.5,
    reps,
  }));
}
