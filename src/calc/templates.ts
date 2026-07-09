import type { WeekPlan, SessionPlan } from "../db";

export interface TemplateResult {
  weeks: WeekPlan[];
  peakWeek: number;
  deloadWeek: number;
}

interface TemplateInput {
  oneRmKg: number;
  weeks: number;
  daysPerWeek: number;
}

function round2_5(n: number): number {
  return Math.round(n / 2.5) * 2.5;
}

const LIFT_NAMES = ["Присед", "Жим лёжа", "Становая", "Жим стоя", "Тяга", "Доп. день"];

// ─────────────────────────────────────────────────────────────────────────────
// 5/3/1 (Jim Wendler)
// TM = 90% 1RM. 4-недельный цикл. Каждый день = отдельное движение.
// Неделя задаёт %-схему, последний сет — AMRAP (指 "+").
// ─────────────────────────────────────────────────────────────────────────────
const W531 = [
  { label: "5s",     sets: [[65, 5], [75, 5], [85, 5]], top: [85, 5], rpe: 8 },
  { label: "3s",     sets: [[70, 3], [80, 3], [90, 3]], top: [90, 3], rpe: 9 },
  { label: "5/3/1",  sets: [[75, 5], [85, 3], [95, 1]], top: [95, 1], rpe: 9 },
  { label: "Deload", sets: [[40, 5], [50, 5], [60, 5]], top: [60, 5], rpe: 5 },
];

export function calc531(input: TemplateInput): TemplateResult {
  const { oneRmKg, daysPerWeek } = input;
  const cycles = Math.max(1, Math.round(input.weeks / 4));
  const totalWeeks = cycles * 4;
  const weeks: WeekPlan[] = [];

  for (let wi = 0; wi < totalWeeks; wi++) {
    const cycleIdx = Math.floor(wi / 4);
    const phase = W531[wi % 4];
    // Прогрессия между циклами: TM растёт ~2.5% за цикл
    const tm = oneRmKg * 0.9 * (1 + cycleIdx * 0.025);

    const sessions: SessionPlan[] = [];
    for (let d = 1; d <= daysPerWeek; d++) {
      const lift = LIFT_NAMES[(d - 1) % LIFT_NAMES.length];
      const detailLines = phase.sets
        .map(([pct, reps], i) => {
          const amrap = i === phase.sets.length - 1 && phase.label !== "Deload" ? "+" : "";
          return `${round2_5((tm * pct) / 100)}кг × ${reps}${amrap} (${pct}%)`;
        })
        .join("\n");

      const [topPct, topReps] = phase.top;
      sessions.push({
        day: d,
        focus: `${lift} · ${phase.label}`,
        intensity: topPct,
        sets: phase.sets.length,
        reps: topReps,
        weightKg: round2_5((tm * topPct) / 100),
        rpe: phase.rpe,
        detail: detailLines,
      });
    }
    weeks.push({ week: wi + 1, sessions });
  }

  return {
    weeks,
    peakWeek: totalWeeks - 1,   // неделя 5/3/1
    deloadWeek: totalWeeks,     // последний deload
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GZCLP (Cody Lefever) — упрощённая недельная адаптация
// T1: главный подъём, база 85% 1RM, 5×3, линейный рост по неделям
// T2: объёмная работа, 3×10 ~ 65%
// ─────────────────────────────────────────────────────────────────────────────
export function calcGzclp(input: TemplateInput): TemplateResult {
  const { oneRmKg, weeks, daysPerWeek } = input;
  const deloadWeek = weeks;
  const peakWeek = weeks - 1;
  const result: WeekPlan[] = [];

  for (let w = 1; w <= weeks; w++) {
    const isDeload = w === deloadWeek;
    const sessions: SessionPlan[] = [];

    for (let d = 1; d <= daysPerWeek; d++) {
      const lift = LIFT_NAMES[(d - 1) % LIFT_NAMES.length];
      const isT1Day = d % 2 === 1; // чередуем T1 (сила) и T2 (объём)

      if (isT1Day) {
        const pct = isDeload ? 70 : Math.min(92, 82 + (w - 1) * 2);
        const weight = round2_5((oneRmKg * pct) / 100);
        sessions.push({
          day: d,
          focus: `${lift} · T1 сила`,
          intensity: pct,
          sets: 5,
          reps: 3,
          weightKg: weight,
          rpe: isDeload ? 6 : 8,
          detail: `${weight}кг · 5×3${isDeload ? "" : "  (последний AMRAP)"} · ${pct}%`,
        });
      } else {
        const pct = isDeload ? 55 : Math.min(75, 62 + (w - 1) * 2);
        const weight = round2_5((oneRmKg * pct) / 100);
        sessions.push({
          day: d,
          focus: `${lift} · T2 объём`,
          intensity: pct,
          sets: 3,
          reps: 10,
          weightKg: weight,
          rpe: isDeload ? 6 : 8,
          detail: `${weight}кг · 3×10 · ${pct}%`,
        });
      }
    }
    result.push({ week: w, sessions });
  }

  return { weeks: result, peakWeek, deloadWeek };
}
