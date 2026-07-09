import type { WeekPlan, Lift } from "../db";

export type PeriodizationModel = "dup" | "linear" | "wave";
export type Goal = "strength" | "hypertrophy" | "strength_hypertrophy";

export interface GenInput {
  lifts: Lift[];       // длина = daysPerWeek, день d = lifts[d-1]
  weeks: number;
  goal: Goal;
}

export interface GenResult {
  weeks: WeekPlan[];
  peakWeek: number;
  deloadWeek: number;
}

const DUP_PATTERNS: Record<Goal, { focus: string; intensity: number; sets: number; reps: number; rpe: number }[]> = {
  strength: [
    { focus: "Сила",       intensity: 85, sets: 5, reps: 3, rpe: 8 },
    { focus: "Мощность",   intensity: 70, sets: 5, reps: 5, rpe: 7 },
    { focus: "Объём",      intensity: 75, sets: 4, reps: 5, rpe: 7 },
  ],
  hypertrophy: [
    { focus: "Гипертрофия",intensity: 70, sets: 4, reps: 10, rpe: 8 },
    { focus: "Объём",      intensity: 65, sets: 5, reps: 12, rpe: 7 },
    { focus: "Насос",      intensity: 60, sets: 4, reps: 15, rpe: 8 },
  ],
  strength_hypertrophy: [
    { focus: "Сила",       intensity: 82, sets: 4, reps: 4,  rpe: 8 },
    { focus: "Гипертрофия",intensity: 72, sets: 4, reps: 8,  rpe: 8 },
    { focus: "Объём",      intensity: 67, sets: 4, reps: 10, rpe: 7 },
  ],
};

function round5(n: number): number {
  return Math.round(n / 2.5) * 2.5;
}

export function calculatePeriodization(input: GenInput & { model: PeriodizationModel }): GenResult {
  const { lifts, weeks, model, goal } = input;
  const daysPerWeek = lifts.length;
  const deloadWeek = weeks;
  const peakWeek = weeks - 1;
  const weekPlans: WeekPlan[] = [];

  for (let w = 1; w <= weeks; w++) {
    const isDeload = w === deloadWeek;
    const isPeak = w === peakWeek;

    const progressFactor = isDeload ? 0.6 : isPeak ? 1.0 : 0.7 + (w / weeks) * 0.25;

    const sessions = [];
    for (let d = 1; d <= daysPerWeek; d++) {
      const lift = lifts[d - 1];
      let base = DUP_PATTERNS[goal][(d - 1) % DUP_PATTERNS[goal].length];

      if (model === "linear") {
        const linearIntensity = 70 + (w / weeks) * 20;
        const linearReps = goal === "hypertrophy"
          ? Math.max(6, 12 - Math.floor((w / weeks) * 5))
          : Math.max(1, 5 - Math.floor((w / weeks) * 3));
        base = {
          focus: goal === "strength" ? "Прогрессия" : goal === "hypertrophy" ? "Гипертрофия" : "Сила/масса",
          intensity: Math.round(linearIntensity),
          sets: 4,
          reps: isDeload ? linearReps + 2 : linearReps,
          rpe: isDeload ? 6 : 8,
        };
      }

      if (model === "wave") {
        const waveBase = [75, 80, 85][(d - 1) % 3];
        const waveOffset = (w % 3) * 3;
        base = {
          focus: ["Лёгкий", "Средний", "Тяжёлый"][(d - 1) % 3],
          intensity: isDeload ? waveBase - 15 : isPeak ? waveBase + waveOffset + 5 : waveBase + waveOffset,
          sets: isDeload ? 3 : 4,
          reps: isDeload ? 8 : [5, 4, 3][(d - 1) % 3],
          rpe: isDeload ? 6 : [7, 8, 9][(d - 1) % 3],
        };
      }

      const adjustedIntensity = isDeload ? Math.min(base.intensity, 65) : base.intensity;
      const weightKg = round5(lift.oneRmKg * (adjustedIntensity / 100) * progressFactor);

      sessions.push({
        day: d,
        focus: `${lift.name} · ${base.focus}`,
        intensity: adjustedIntensity,
        sets: isDeload ? Math.max(2, base.sets - 1) : base.sets,
        reps: base.reps,
        weightKg,
        rpe: base.rpe,
      });
    }

    weekPlans.push({ week: w, sessions });
  }

  return { weeks: weekPlans, peakWeek, deloadWeek };
}
