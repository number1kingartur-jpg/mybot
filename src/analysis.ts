import { getAllWorkouts, getBodyweight, type WorkoutEntry } from "./db";

function est1rm(w: number, reps: number): number {
  return reps <= 1 ? w : w * (1 + reps / 30);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function tonnage(w: WorkoutEntry): number {
  return w.sets * w.reps * w.weightKg;
}

type Category = "push" | "pull" | "legs" | "other";
function categorize(exercise: string): Category {
  const e = exercise.toLowerCase();
  if (/(жим|отжим|брус|трицепс|плеч|дельт)/.test(e)) return "push";
  if (/(тяг|подтяг|бицепс|спин|рядов|фейспулл)/.test(e)) return "pull";
  if (/(присед|становая|выпад|нога|ягод|икр|жим ног)/.test(e)) return "legs";
  return "other";
}

/** Умная недельная сводка на правилах — без внешних AI-API. */
export function buildWeeklyReport(): string {
  const HR = "━━━━━━━━━━━━━━━━━━━━";
  const all = getAllWorkouts();

  const wk1 = all.filter((w) => w.date >= daysAgo(7));
  const wk2 = all.filter((w) => w.date < daysAgo(7) && w.date >= daysAgo(14));

  if (wk1.length === 0) {
    return (
      `📊 <b>НЕДЕЛЬНАЯ СВОДКА</b>\n${HR}\n\n` +
      `За последние 7 дней записей нет.\n\n` +
      `<i>Даже одна тренировка в дневнике держит систему живой. Пора вернуться под штангу.</i>`
    );
  }

  const vol1 = wk1.reduce((s, w) => s + tonnage(w), 0);
  const vol2 = wk2.reduce((s, w) => s + tonnage(w), 0);
  const sessions1 = new Set(wk1.map((w) => w.date)).size;

  // тренд объёма
  let volTrend = "";
  if (vol2 > 0) {
    const diff = Math.round(((vol1 - vol2) / vol2) * 100);
    volTrend =
      diff > 5 ? `📈 объём +${diff}% к прошлой неделе`
      : diff < -5 ? `📉 объём ${diff}% к прошлой неделе`
      : `➡️ объём стабилен (${diff >= 0 ? "+" : ""}${diff}%)`;
  }

  // баланс по категориям (по тоннажу)
  const catVol: Record<Category, number> = { push: 0, pull: 0, legs: 0, other: 0 };
  for (const w of wk1) catVol[categorize(w.exercise)] += tonnage(w);
  const balanceLines: string[] = [];
  if (catVol.push > 0 || catVol.pull > 0) {
    const ratio = catVol.pull > 0 ? catVol.push / catVol.pull : Infinity;
    if (ratio > 1.6) balanceLines.push("⚠️ Жимов заметно больше тяг — добавь тяги/подтягивания для баланса плеч.");
    else if (ratio < 0.6) balanceLines.push("⚠️ Тяг больше жимов — не забывай про жимовые движения.");
  }

  // анализ по упражнениям: тренд e1RM + застой
  const exNames = [...new Set(all.map((w) => w.exercise))];
  const insights: string[] = [];
  for (const ex of exNames) {
    const hist = all.filter((w) => w.exercise === ex);
    if (hist.length < 2) continue;
    const recent = hist.slice(-4);
    if (!recent.some((w) => w.date >= daysAgo(10))) continue; // только активные

    const bestRecent = Math.max(...recent.map((w) => est1rm(w.weightKg, w.reps)));
    const older = hist.slice(0, -4);
    const bestOlder = older.length ? Math.max(...older.map((w) => est1rm(w.weightKg, w.reps))) : 0;

    // застой: 3+ последних сессии одинаковый рабочий вес
    const lastWeights = recent.slice(-3).map((w) => w.weightKg);
    const stalled = lastWeights.length >= 3 && lastWeights.every((x) => x === lastWeights[0]);

    if (stalled) {
      insights.push(
        `🔸 <b>${ex}</b>: вес стоит ${lastWeights[0]}кг ${lastWeights.length}+ сессии. ` +
        `Варианты: +2.5кг сверху, добавить подход, либо сбросить 10% и разогнать заново.`
      );
    } else if (bestOlder > 0 && bestRecent > bestOlder * 1.01) {
      const gain = Math.round((bestRecent - bestOlder) * 10) / 10;
      insights.push(`🔹 <b>${ex}</b>: расчётный 1RM растёт (+${gain}кг). Прогрессия работает — держи.`);
    }
  }

  // вес тела
  const bw = getBodyweight(30);
  let bwLine = "";
  if (bw.length >= 2) {
    const d = Math.round((bw[bw.length - 1].weightKg - bw[0].weightKg) * 10) / 10;
    const arrow = d > 0 ? `📈 +${d}` : d < 0 ? `📉 ${d}` : "➡️ 0";
    bwLine = `\n⚖️ <b>Вес тела:</b> ${bw[bw.length - 1].weightKg} кг (${arrow} кг за период)`;
  }

  const out: string[] = [
    `📊 <b>НЕДЕЛЬНАЯ СВОДКА</b>`,
    `<i>Последние 7 дней</i>`,
    HR,
    "",
    `🗓 <b>Тренировок:</b> ${sessions1}`,
    `🏋️ <b>Тоннаж:</b> ${Math.round(vol1).toLocaleString("ru-RU")} кг`,
  ];
  if (volTrend) out.push(volTrend);
  out.push(bwLine);
  out.push("", HR, "<b>🧠 Анализ и рекомендации</b>", "");

  if (insights.length === 0 && balanceLines.length === 0) {
    out.push("<i>Данных пока мало для глубоких выводов. Продолжай логировать — со временем появятся тренды по каждому движению.</i>");
  } else {
    out.push(...balanceLines, ...insights.slice(0, 6));
  }

  // частотная рекомендация
  if (sessions1 < 2) out.push("\n💡 Меньше 2 тренировок за неделю — для прогресса силы обычно нужно 2–4 сессии на движение/неделю.");
  else if (sessions1 >= 5) out.push("\n💡 5+ тренировок — следи за восстановлением: сон, питание, разгрузка при накоплении усталости.");

  return out.filter((l) => l !== undefined).join("\n");
}
