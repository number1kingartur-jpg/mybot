import type { WeekPlan, SessionPlan, Lift } from "../db";
import type { GenInput, GenResult } from "./periodization";

function round2_5(n: number): number {
  return Math.round(n / 2.5) * 2.5;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5/3/1 (Jim Wendler)
// TM = 90% 1RM каждого движения. 4-недельный цикл. День = отдельное движение.
// ─────────────────────────────────────────────────────────────────────────────
const W531 = [
  { label: "Неделя пятёрок",  sets: [[65, 5], [75, 5], [85, 5]], top: [85, 5], rpe: 8, deload: false },
  { label: "Неделя троек",    sets: [[70, 3], [80, 3], [90, 3]], top: [90, 3], rpe: 9, deload: false },
  { label: "Пиковая неделя",  sets: [[75, 5], [85, 3], [95, 1]], top: [95, 1], rpe: 9, deload: false },
  { label: "Разгрузка",       sets: [[40, 5], [50, 5], [60, 5]], top: [60, 5], rpe: 5, deload: true },
];

export function calc531(input: GenInput): GenResult {
  const { lifts, weeks } = input;
  const cycles = Math.max(1, Math.round(weeks / 4));
  const totalWeeks = cycles * 4;
  const out: WeekPlan[] = [];

  for (let wi = 0; wi < totalWeeks; wi++) {
    const cycleIdx = Math.floor(wi / 4);
    const phase = W531[wi % 4];

    const sessions: SessionPlan[] = [];
    for (let d = 1; d <= lifts.length; d++) {
      const lift: Lift = lifts[d - 1];
      // TM растёт ~2.5% за цикл (прогрессия Вендлера)
      const tm = lift.oneRmKg * 0.9 * (1 + cycleIdx * 0.025);

      const detailLines = phase.sets
        .map(([pct, reps], i) => {
          const amrap = i === phase.sets.length - 1 && !phase.deload ? "+" : "";
          return `${round2_5((tm * pct) / 100)}кг × ${reps}${amrap} (${pct}%)`;
        })
        .join("\n");

      const [topPct, topReps] = phase.top;
      sessions.push({
        day: d,
        focus: `${lift.name} · ${phase.label}`,
        intensity: topPct,
        sets: phase.sets.length,
        reps: topReps,
        weightKg: round2_5((tm * topPct) / 100),
        rpe: phase.rpe,
        detail: detailLines,
      });
    }
    out.push({ week: wi + 1, sessions });
  }

  return { weeks: out, peakWeek: totalWeeks - 1, deloadWeek: totalWeeks };
}

// ─────────────────────────────────────────────────────────────────────────────
// GZCLP — упрощённая недельная адаптация. День = движение, свой 1RM.
// T1: база сила 5×3, T2: объём 3×10, чередуются по дням.
// ─────────────────────────────────────────────────────────────────────────────
export function calcGzclp(input: GenInput): GenResult {
  const { lifts, weeks } = input;
  const deloadWeek = weeks;
  const peakWeek = weeks - 1;
  const out: WeekPlan[] = [];

  for (let w = 1; w <= weeks; w++) {
    const isDeload = w === deloadWeek;
    const sessions: SessionPlan[] = [];

    for (let d = 1; d <= lifts.length; d++) {
      const lift = lifts[d - 1];
      const isT1Day = d % 2 === 1;

      if (isT1Day) {
        const pct = isDeload ? 70 : Math.min(92, 82 + (w - 1) * 2);
        const weight = round2_5((lift.oneRmKg * pct) / 100);
        sessions.push({
          day: d,
          focus: `${lift.name} · тяжёлый день (сила)`,
          intensity: pct,
          sets: 5,
          reps: 3,
          weightKg: weight,
          rpe: isDeload ? 6 : 8,
          detail: `${weight}кг × 5 подходов по 3${isDeload ? "" : "+"} (${pct}%)`,
        });
      } else {
        const pct = isDeload ? 55 : Math.min(75, 62 + (w - 1) * 2);
        const weight = round2_5((lift.oneRmKg * pct) / 100);
        sessions.push({
          day: d,
          focus: `${lift.name} · объёмный день`,
          intensity: pct,
          sets: 3,
          reps: 10,
          weightKg: weight,
          rpe: isDeload ? 6 : 8,
          detail: `${weight}кг × 3 подхода по 10 (${pct}%)`,
        });
      }
    }
    out.push({ week: w, sessions });
  }

  return { weeks: out, peakWeek, deloadWeek };
}
