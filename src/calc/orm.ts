export function calcOneRm(weightKg: number, reps: number): number {
  // формулы валидны до ~15 повторений; выше — только Epley (Brzycki делит на ноль при 37)
  const r = Math.max(1, Math.min(reps, 15));
  if (r === 1) return weightKg;
  const epley = weightKg * (1 + r / 30);
  const brzycki = weightKg * (36 / (37 - r));
  const lander = (100 * weightKg) / (101.3 - 2.67123 * r);
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
