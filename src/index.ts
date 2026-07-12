import "dotenv/config";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import https from "https";
import cron from "node-cron";
import {
  addWorkout, getWorkouts, getAllWorkouts, getExercises, getWorkoutDates, removeWorkouts,
  saveProgram, getActiveProgram, advanceProgramDay, deactivatePrograms,
  checkPr, addBodyweight, getBodyweight,
  registerUser, getUsers, getUser, setReminder, setNutrition, updateUser,
  createChallenge, getChallengeById, getActiveChallenge, joinChallenge,
  setChallengePing, getExpiredChallenges, finishChallenge,
  addMeal, getMeals, mealTotals, isPremium, canAnalyzePhoto, bumpPhotoCount, grantPremium,
  type NutritionProfile, type Challenge,
} from "./db";
import { recoveryMap, strengthScore, groupTrends } from "./recovery";
import { analyzeMealPhoto, analyzeMealText, mealVisionEnabled, mealVisionProvider, MealPhotoUnreadableError } from "./meal";
import { calcMacros, weightTrendAdvice } from "./nutrition";
import { SIMPLE_PLANS, WEIGHT_RULE, HOME_RULE, type Place } from "./simple";
import { parseWorkout, parseGroups, type ParsedExercise } from "./parser";
import { CATALOG } from "./exercises";
import { transcribeVoice, voiceEnabled } from "./voice";
import { calcOneRm, pctTable } from "./calc/orm";
import { calculatePeriodization, type PeriodizationModel, type Goal, type GenResult } from "./calc/periodization";
import { calc531, calcGzclp } from "./calc/templates";
import type { Lift } from "./db";
import { progressChartUrl, bodyweightChartUrl } from "./chart";
import { buildWeeklyReport } from "./analysis";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error("BOT_TOKEN not set in .env");

const bot = new Bot(TOKEN);

// ── Session state ──────────────────────────────────────────────────────────
type State =
  | null
  | "log_exercise_custom"
  | "log_sets"
  | "orm_input"
  | "bw_input"
  | "prog_model"
  | "prog_goal"
  | "prog_weeks"
  | "prog_days"
  | "prog_lift_rm"
  | "progress_exercise"
  | "nut_age"
  | "nut_height"
  | "nut_weight"
  | "awaiting_meal_text";

interface UserState {
  state: State;
  data: Record<string, string | number>;
  lifts?: { name: string; oneRmKg: number }[];
  liftNames?: string[];
  liftIdx?: number;
  exList?: string[];
}

// Порядок базовых движений по дням недели
const LIFT_ORDER = ["Присед", "Жим лёжа", "Становая", "Жим стоя", "Тяга"];
const sessions = new Map<number, UserState>();

function getSession(userId: number): UserState {
  if (!sessions.has(userId)) sessions.set(userId, { state: null, data: {} });
  return sessions.get(userId)!;
}
function resetSession(userId: number) {
  sessions.set(userId, { state: null, data: {} });
}

// ── Style helpers ───────────────────────────────────────────────────────────
const HR = "━━━━━━━━━━━━━━━━━━━━";
const DOT = "·";
const HTML = { parse_mode: "HTML" as const };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bar(done: number, total: number, len = 10): string {
  if (total <= 0) return "";
  const filled = Math.max(0, Math.min(len, Math.round((done / total) * len)));
  return "▰".repeat(filled) + "▱".repeat(len - filled);
}

const GOAL_LABELS: Record<string, string> = {
  strength: "Максимальная сила",
  hypertrophy: "Гипертрофия",
  strength_hypertrophy: "Сила + масса",
};
const MODEL_LABELS: Record<string, string> = {
  dup: "DUP · ежедневная волна",
  linear: "Линейная прогрессия",
  wave: "Волновая нагрузка",
  "531": "5/3/1 · Wendler",
  gzclp: "GZCLP · линейная",
};

const MENU_BUTTONS = [
  "📝 Записать тренировку", "📔 Сегодня",
  "📊 Прогресс", "🏆 Рекорды",
  "📋 Программа", "🧮 1RM калькулятор",
  "⚖️ Вес тела", "📈 Отчёт недели",
  "🍗 Питание", "⚔️ Челлендж", "📸 Еда",
  "🏋️ Тренировка на сегодня", "📈 Мой прогресс", "❓ Помощь",
];

// ── Keyboards ──────────────────────────────────────────────────────────────
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📝 Записать тренировку" }, { text: "📔 Сегодня" }],
    [{ text: "📊 Прогресс" }, { text: "🏆 Рекорды" }],
    [{ text: "📋 Программа" }, { text: "🍗 Питание" }],
    [{ text: "⚖️ Вес тела" }, { text: "📈 Отчёт недели" }],
    [{ text: "🧮 1RM калькулятор" }, { text: "⚔️ Челлендж" }],
    [{ text: "📸 Еда" }],
  ],
  resize_keyboard: true,
};

const PRESET_EXERCISES = ["Присед", "Жим лёжа", "Становая", "ОХ жим", "Подтягивания", "Тяга"];
const EXERCISE_EMOJI: Record<string, string> = {
  "Присед": "🦵", "Жим лёжа": "🏋️", "Становая": "💀",
  "ОХ жим": "🔺", "Подтягивания": "💪", "Тяга": "🚣",
};

const SIMPLE_KEYBOARD = {
  keyboard: [
    [{ text: "🏋️ Тренировка на сегодня" }, { text: "📈 Мой прогресс" }],
    [{ text: "🍗 Питание" }, { text: "⚖️ Вес тела" }],
    [{ text: "⚔️ Челлендж" }, { text: "📸 Еда" }],
    [{ text: "❓ Помощь" }],
  ],
  resize_keyboard: true,
};

function userMode(userId: number): "simple" | "pro" | null {
  return getUser(userId)?.mode ?? null;
}

function mainKeyboardFor(userId: number) {
  return userMode(userId) === "simple" ? SIMPLE_KEYBOARD : MAIN_KEYBOARD;
}

/** Базовые + упражнения из истории пользователя. Коллбэки по индексу (лимит 64 байта). */
function buildExerciseList(userId: number): string[] {
  const history = getExercises(userId);
  const merged: string[] = [...PRESET_EXERCISES];
  for (const ex of history) {
    if (!merged.some((m) => m.toLowerCase() === ex.toLowerCase())) merged.push(ex);
  }
  return merged.slice(0, 20);
}

function exerciseKeyboard(list: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  list.forEach((ex, i) => {
    const emoji = EXERCISE_EMOJI[ex];
    const label = (emoji ? emoji + " " : "") + (ex.length > 26 ? ex.slice(0, 25) + "…" : ex);
    kb.text(label, `exi_${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (list.length % 2 !== 0) kb.row();
  return kb.text("📚 Все упражнения", "exi_custom");
}

function categoryKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  CATALOG.forEach((cat, i) => {
    kb.text(`${cat.emoji} ${cat.name}`, `excat_${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (CATALOG.length % 2 !== 0) kb.row();
  return kb.text("✏️ Ввести название вручную", "excat_manual");
}

function categoryExercisesKeyboard(catIdx: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  CATALOG[catIdx].items.forEach((ex, i) => {
    kb.text(ex, `cex_${catIdx}_${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (CATALOG[catIdx].items.length % 2 !== 0) kb.row();
  return kb.text("⬅️ Категории", "exi_custom");
}

/** Подсказка следующего веса по последней тренировке (подход Dr. Muscle). */
function nextLoadHint(userId: number, exercise: string): string {
  const prior = getWorkouts(userId, exercise, 50);
  if (prior.length === 0) return "";

  const lastDate = prior[prior.length - 1].date;
  const lastDay = prior.filter((w) => w.date === lastDate);
  const top = lastDay.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
  if (top.weightKg <= 0) {
    return `\n📌 <i>Прошлый раз (${lastDate.slice(8)}.${lastDate.slice(5, 7)}): ${top.sets}×${top.reps} со своим весом. Попробуй +1–2 повторения.</i>`;
  }

  // прогрессия: многоповторка растёт весом, малоповторка — повторением или +2.5 кг
  const inc = top.weightKg >= 100 ? 5 : 2.5;
  const suggestion =
    top.reps >= 8
      ? `попробуй <b>${top.weightKg + inc} кг</b> или +1–2 повторения`
      : `попробуй <b>+1 повтор</b> с тем же весом или <b>${top.weightKg + 2.5} кг</b>`;

  return (
    `\n📌 <i>Прошлый раз (${lastDate.slice(8)}.${lastDate.slice(5, 7)}): ${top.sets}×${top.reps} @ ${top.weightKg} кг.</i>\n` +
    `💡 <i>Если было с запасом — ${suggestion}.</i>`
  );
}

async function promptLoad(
  ctx: { reply: (t: string, o?: object) => Promise<unknown> },
  userId: number,
  exercise: string
) {
  await ctx.reply(
    `✅ <b>${esc(exercise)}</b>\n${HR}\n\n` +
    `Введи нагрузку — любой формат:\n\n` +
    `<code>4×5×120</code> — 4 подхода по 5 на 120 кг\n` +
    `<code>60х8, 80х5, 100х3</code> — разные веса\n` +
    `<code>4 подхода по 10 раз 30 кг</code> — словами` +
    nextLoadHint(userId, exercise),
    HTML
  );
}

function modelKeyboard() {
  return new InlineKeyboard()
    .text("🌊 DUP · ежедневная волна", "pm_dup").row()
    .text("📈 Линейная прогрессия", "pm_linear").row()
    .text("〰️ Волновая нагрузка", "pm_wave").row()
    .text("🏆 5/3/1 · Wendler", "pm_531").row()
    .text("🔩 GZCLP · для новичков+", "pm_gzclp");
}

function goalKeyboard() {
  return new InlineKeyboard()
    .text("💪 Максимальная сила", "pg_strength").row()
    .text("📈 Гипертрофия", "pg_hypertrophy").row()
    .text("⚡ Сила + масса", "pg_strength_hypertrophy");
}

function weeksKeyboard() {
  return new InlineKeyboard()
    .text("4", "pw_4").text("6", "pw_6").text("8", "pw_8").text("12", "pw_12");
}

function daysKeyboard() {
  return new InlineKeyboard()
    .text("3", "pd_3").text("4", "pd_4").text("5", "pd_5");
}

// ── Helpers ────────────────────────────────────────────────────────────────
function today(): string {
  // en-CA → YYYY-MM-DD; дата по Бангкоку, а не UTC
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function bangkokNow(): { dow: number; hour: number } {
  const s = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
  const d = new Date(s);
  return { dow: d.getDay(), hour: d.getHours() };
}

// ── Стрик: сколько недель подряд есть хотя бы одна тренировка ───────────────
function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Пн=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function shiftWeek(key: string, weeks: number): string {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weekStreak(userId: number): number {
  const weeks = new Set(getWorkoutDates(userId).map(weekKey));
  let cur = weekKey(today());
  if (!weeks.has(cur)) cur = shiftWeek(cur, -1); // текущая неделя ещё может случиться
  let streak = 0;
  let freezeUsed = false; // «заморозка» (как в Nike Run Club): одна пропущенная неделя стрик не рушит
  while (true) {
    if (weeks.has(cur)) {
      streak++;
    } else if (streak > 0 && !freezeUsed) {
      freezeUsed = true; // пропуск прощён, но неделя в стрик не идёт
    } else {
      break;
    }
    cur = shiftWeek(cur, -1);
  }
  return streak;
}

// ── Медали месяца (механика Keep: виртуальные награды за объём месяца) ───────
const MEDALS: { min: number; emoji: string; label: string }[] = [
  { min: 18, emoji: "🥇", label: "золото" },
  { min: 14, emoji: "🥈", label: "серебро" },
  { min: 10, emoji: "🥉", label: "бронза" },
];

function medalLine(trainedDays: number): string {
  const earned = MEDALS.find((m) => trainedDays >= m.min);
  if (earned) {
    const next = MEDALS[MEDALS.indexOf(earned) - 1];
    const upgrade = next ? ` ${DOT} до ${next.emoji} осталось ${next.min - trainedDays}` : " — максимум!";
    return `${earned.emoji} <b>Медаль месяца: ${earned.label}</b>${upgrade}`;
  }
  const first = MEDALS[MEDALS.length - 1];
  return `🎖 До медали ${first.emoji} осталось ${first.min - trainedDays} тренировок (нужно ${first.min} за месяц)`;
}

// ── Разминка: ramp-подходы + раскладка блинов ────────────────────────────────
const BAR_KG = 20;
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function platesPerSide(weight: number): string {
  let rest = (weight - BAR_KG) / 2;
  if (rest <= 0) return "пустой гриф";
  const out: string[] = [];
  for (const p of PLATES) {
    while (rest >= p - 0.01) {
      out.push(String(p));
      rest -= p;
    }
  }
  return out.join("+") || "пустой гриф";
}

function warmupText(workKg: number): string {
  const steps: { pct: number; reps: number }[] = [
    { pct: 0.4, reps: 5 }, { pct: 0.55, reps: 4 }, { pct: 0.7, reps: 3 }, { pct: 0.85, reps: 2 },
  ];
  const lines: string[] = [`Гриф ${BAR_KG} кг × 10`];
  for (const st of steps) {
    const w = Math.round((workKg * st.pct) / 2.5) * 2.5;
    if (w <= BAR_KG + 2 || w >= workKg - 2) continue;
    lines.push(`${w} кг × ${st.reps}   <i>(${platesPerSide(w)})</i>`);
  }
  return (
    `🧊 <b>РАЗМИНКА до ${workKg} кг</b>\n${HR}\n\n` +
    lines.map((l) => `▪️ ${l}`).join("\n") +
    `\n▪️ <b>${workKg} кг — рабочий</b>   <i>(${platesPerSide(workKg)})</i>\n\n` +
    `<i>В скобках — блины на одну сторону грифа ${BAR_KG} кг.\nОтдых между разминочными: 60–90 сек.</i>`
  );
}

const TEMPLATE_MODELS = new Set(["531", "gzclp"]);

function buildProgram(
  model: string,
  input: { lifts: Lift[]; weeks: number; goal: Goal }
): GenResult {
  if (model === "531") return calc531(input);
  if (model === "gzclp") return calcGzclp(input);
  return calculatePeriodization({ ...input, model: model as PeriodizationModel });
}

interface Sess {
  day: number; focus: string; intensity: number;
  sets: number; reps: number; weightKg: number; rpe: number; detail?: string;
}

function rpeHint(rpe: number): string {
  if (rpe >= 9) return `💪 Тяжесть RPE ${rpe} — почти предел (0–1 повтор в запасе)`;
  if (rpe >= 8) return `💪 Тяжесть RPE ${rpe} — тяжело (~2 повтора в запасе)`;
  if (rpe >= 7) return `💪 Тяжесть RPE ${rpe} — уверенно (~3 повтора в запасе)`;
  return `💪 Тяжесть RPE ${rpe} — легко / разминочно`;
}

function formatSession(sess: Sess): string {
  if (sess.detail) {
    return (
      `🎯 <b>${esc(sess.focus)}</b>\n\n` +
      `<b>Рабочие подходы:</b>\n<code>${esc(sess.detail)}</code>\n\n` +
      `💡 <i>Число в скобках — % от твоего 1RM. Знак «+» — в последнем подходе сделай максимум повторений (оставь 1–2 в запасе).</i>\n` +
      `⏱ Отдых 2–4 мин · ${rpeHint(sess.rpe)}`
    );
  }
  return (
    `🎯 <b>${esc(sess.focus)}</b>\n\n` +
    `▪️ <b>${sess.sets} подходов × ${sess.reps} повторений</b>\n` +
    `▪️ Вес: <b>${sess.weightKg} кг</b> <i>(${sess.intensity}% от 1RM)</i>\n` +
    `▪️ Отдых: 2–4 мин между подходами\n` +
    `${rpeHint(sess.rpe)}`
  );
}

// ── Лог распарсенной тренировки + отмена ────────────────────────────────────
const undoStore = new Map<number, string[]>();
let undoCounter = 0;

function logParsed(userId: number, parsed: ParsedExercise[]): { html: string; undoId: number; maxW: number } {
  const ids: string[] = [];
  const lines: string[] = [];

  for (const ex of parsed) {
    // PR проверяем по самой тяжёлой группе ДО записи
    const heaviest = ex.groups.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
    const pr = checkPr(userId, ex.exercise, heaviest.weightKg, heaviest.reps);

    for (const g of ex.groups) {
      const row = addWorkout({
        userId,
        date: today(),
        exercise: ex.exercise,
        sets: g.sets,
        reps: g.reps,
        weightKg: g.weightKg,
      });
      ids.push(row.id);
    }

    const groupsStr = ex.groups
      .map((g) => `${g.sets}×${g.reps}${g.weightKg > 0 ? ` @ ${g.weightKg} кг` : " (свой вес)"}`)
      .join(" · ");
    lines.push(`🎯 <b>${esc(ex.exercise)}</b>\n<code>${groupsStr}</code>`);

    if (pr.isWeightPr) {
      lines.push(`🏆 <b>Новый рекорд веса: ${heaviest.weightKg} кг!</b> <i>(было ${pr.prevBestWeight})</i>`);
    } else if (pr.isE1rmPr) {
      lines.push(`🥇 <b>Рекорд по силе: расчётный 1RM ${pr.e1rm} кг!</b>`);
    }
  }

  const undoId = ++undoCounter;
  undoStore.set(undoId, ids);
  // не копим бесконечно
  if (undoStore.size > 50) {
    const oldest = undoStore.keys().next().value;
    if (oldest !== undefined) undoStore.delete(oldest);
  }

  const maxW = Math.max(...parsed.flatMap((p) => p.groups.map((g) => g.weightKg)));
  void notifyChallenge(userId); // счёт сопернику по челленджу, если он есть
  return {
    html: `✅ <b>ЗАПИСАНО</b>\n${HR}\n\n${lines.join("\n\n")}`,
    undoId,
    maxW,
  };
}

function undoKeyboard(undoId: number, warmKg = 0) {
  const rows = [
    [{ text: "↩️ Отменить запись", callback_data: `undo_${undoId}` }],
    [
      { text: "⏱ Отдых 2 мин", callback_data: "rest_120" },
      { text: "3 мин", callback_data: "rest_180" },
      { text: "4 мин", callback_data: "rest_240" },
    ],
  ];
  if (warmKg >= 30) {
    rows.push([{ text: `🧊 Разминка до ${warmKg} кг`, callback_data: `warm_${warmKg}` }]);
  }
  return { inline_keyboard: rows };
}

// ── Календарь месяца ────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function monthCalendar(userId: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const trained = new Set(
    getWorkoutDates(userId).filter((d) => d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
      .map((d) => parseInt(d.slice(8)))
  );

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Пн=0
  const todayNum = now.getDate();

  // эмодзи-сетка: 🟩 тренировка, 🔲 сегодня (без тренировки), ⬜ день без, ⬛ вне месяца
  let grid = "";
  let col = 0;
  for (let i = 0; i < firstDow; i++) { grid += "⬛"; col++; }
  for (let day = 1; day <= daysInMonth; day++) {
    grid += trained.has(day) ? "🟩" : day === todayNum ? "🔲" : "⬜";
    col++;
    if (col === 7) { grid += "\n"; col = 0; }
  }
  while (col > 0 && col < 7) { grid += "⬛"; col++; }

  return (
    `🗓 <b>${MONTH_NAMES[month]} ${year}</b>\n` +
    `<i>Тренировок: ${trained.size} ${DOT} ряд = неделя (Пн–Вс)</i>\n\n` +
    grid.trimEnd() +
    `\n\n🟩 тренировка ${DOT} 🔲 сегодня\n\n` +
    medalLine(trained.size)
  );
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("chart timeout")));
    req.on("error", reject);
  });
}

// ── Челлендж с другом ────────────────────────────────────────────────────────
// Приватные соревнования с друзьями удерживают лучше глобальных рейтингов
// (Strava Group Challenges); каждая ссылка-вызов — бесплатный канал роста.

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Число тренировочных дней каждого участника в окне челленджа. */
function challengeCounts(ch: Challenge): { fromCount: number; toCount: number } {
  const inRange = (uid: number) =>
    getWorkoutDates(uid).filter((d) => d >= ch.startDate && d <= ch.endDate).length;
  return { fromCount: inRange(ch.fromId), toCount: ch.toId ? inRange(ch.toId) : 0 };
}

function nameOf(userId: number): string {
  return getUser(userId)?.firstName || "Соперник";
}

function challengeScoreText(ch: Challenge, viewerId: number): string {
  const { fromCount, toCount } = challengeCounts(ch);
  const mine = viewerId === ch.fromId ? fromCount : toCount;
  const theirs = viewerId === ch.fromId ? toCount : fromCount;
  const oppName = nameOf(viewerId === ch.fromId ? ch.toId! : ch.fromId);
  const daysLeft = Math.max(0, Math.round(
    (new Date(ch.endDate + "T00:00:00Z").getTime() - new Date(today() + "T00:00:00Z").getTime()) / 86400_000
  ));
  const lead = mine > theirs ? "🏆 Ты ведёшь!" : mine < theirs ? "⚡ Ты отстаёшь — время тренироваться!" : "🤝 Ничья — всё решится в конце.";
  return (
    `⚔️ <b>ЧЕЛЛЕНДЖ: кто больше тренировок</b>\n${HR}\n\n` +
    `<b>Ты ${mine} : ${theirs} ${esc(oppName)}</b>\n\n` +
    `${lead}\n` +
    `<i>До конца: ${daysLeft === 0 ? "последний день!" : `${daysLeft} дн.`} (по ${ch.endDate.slice(8)}.${ch.endDate.slice(5, 7)} включительно)</i>\n\n` +
    `<i>Считаются дни с хотя бы одной записанной тренировкой.</i>`
  );
}

bot.hears("⚔️ Челлендж", async (ctx) => {
  const userId = ctx.from!.id;
  resetSession(userId);
  registerUser(ctx.chat.id, ctx.from?.first_name ?? "");

  const active = getActiveChallenge(userId, today());
  if (active) {
    await ctx.reply(challengeScoreText(active, userId), HTML);
    return;
  }

  const ch = createChallenge(userId);
  const invite = `https://t.me/${ctx.me.username}?start=ch_${ch.id}`;
  const shareUrl =
    `https://t.me/share/url?url=${encodeURIComponent(invite)}` +
    `&text=${encodeURIComponent("⚔️ Вызываю тебя на недельный челлендж: кто больше тренировок! Жми ссылку и принимай вызов.")}`;

  await ctx.reply(
    `⚔️ <b>ВЫЗОВИ ДРУГА</b>\n${HR}\n\n` +
    `Правила простые: <b>7 дней, кто больше дней с тренировками — тот победил.</b>\n\n` +
    `Отправь другу ссылку-вызов:\n${invite}\n\n` +
    `<i>Как только друг примет вызов — начнётся отсчёт, я буду присылать счёт обоим. Вместе тренироваться проще: соревнование с другом держит серию на треть дольше.</i>`,
    {
      reply_markup: { inline_keyboard: [[{ text: "📤 Отправить вызов другу", url: shareUrl }]] },
      ...HTML,
    }
  );
});

/** Уведомление сопернику при записи тренировки (не чаще раза в день). */
async function notifyChallenge(userId: number) {
  const ch = getActiveChallenge(userId, today());
  if (!ch?.toId) return;
  if (ch.lastPingFrom === userId && ch.lastPingDate === today()) return;
  setChallengePing(ch.id, userId, today());

  const oppId = ch.fromId === userId ? ch.toId : ch.fromId;
  const { fromCount, toCount } = challengeCounts(ch);
  const oppMine = oppId === ch.fromId ? fromCount : toCount;
  const oppTheirs = oppId === ch.fromId ? toCount : fromCount;
  try {
    await bot.api.sendMessage(
      oppId,
      `⚔️ <b>${esc(nameOf(userId))} только что записал тренировку!</b>\n\n` +
      `Счёт: ты <b>${oppMine} : ${oppTheirs}</b>` +
      (oppMine < oppTheirs ? `\n<i>Не дай себя обогнать 😤</i>` : ""),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "👍 Красава!", callback_data: `kudos_${userId}` }]],
        },
      }
    );
  } catch { /* соперник заблокировал бота */ }
}

// Kudos (Strava): социальное подкрепление — стрик длиннее на ~34% с соц. слоем
bot.callbackQuery(/^kudos_(\d+)$/, async (ctx) => {
  const targetId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery("👍");
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
  } catch { /* skip */ }
  try {
    await bot.api.sendMessage(
      targetId,
      `👍 <b>${esc(ctx.from.first_name ?? "Друг")}</b> поддержал твою тренировку!`,
      { parse_mode: "HTML" }
    );
  } catch { /* получатель заблокировал бота */ }
});

// ── /start ────────────────────────────────────────────────────────────────
const MODE_KEYBOARD = {
  inline_keyboard: [
    [{ text: "🙂 Хочу просто быть в форме", callback_data: "mode_simple" }],
    [{ text: "🏋️ Тренируюсь серьёзно (1RM, программы)", callback_data: "mode_pro" }],
  ],
};

async function sendSimpleWelcome(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, name: string) {
  await ctx.reply(
    `<b>💪 Привет, ${esc(name)}!</b>\n${HR}\n\n` +
    `Я помогу тебе держать форму, даже если ты никогда не тренировался:\n\n` +
    `🏋️ <b>Тренировка на сегодня</b> — готовый план дома или в зале. У каждого упражнения кнопка «❓ Как делать»: пошагово, с ошибками и видео.\n\n` +
    `📈 <b>Мой прогресс</b> — сколько тренировок, календарь, серия недель без пропусков.\n\n` +
    `🍗 <b>Питание</b> — сколько есть, чтобы худеть или набирать.\n\n` +
    `⏰ Хочешь, буду напоминать о тренировках? Нажми /remind\n\n` +
    `<i>Начни с кнопки «🏋️ Тренировка на сегодня» 👇</i>`,
    { reply_markup: SIMPLE_KEYBOARD, ...HTML }
  );
}

async function sendProWelcome(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, name: string) {
  await ctx.reply(
    `<b>💎 STRENGTH LAB</b>\n` +
    `<i>Твой личный тренировочный штаб</i>\n` +
    `${HR}\n\n` +
    `Привет, <b>${esc(name)}</b>. Всё для системной работы:\n\n` +
    `📝 <b>Запись тренировок</b> ${DOT} текстом или голосом 🎙\n` +
    `📊 <b>Прогресс</b> ${DOT} графики и PR\n` +
    `📋 <b>Программа</b> ${DOT} DUP, 5/3/1, GZCLP по неделям\n` +
    `🍗 <b>Питание</b> ${DOT} КБЖУ под цель\n` +
    `🧮 <b>1RM</b> ${DOT} максимум и таблица %\n` +
    `📈 <b>Отчёт недели</b> ${DOT} умный анализ прогресса\n\n` +
    `<i>Каждое воскресенье пришлю сводку автоматически.</i>`,
    {
      reply_markup: { inline_keyboard: [[{ text: "🎓 Я новичок — с чего начать?", callback_data: "guide_start" }]] },
      ...HTML,
    }
  );
  await ctx.reply(`Меню внизу 👇`, { reply_markup: MAIN_KEYBOARD });
}

bot.command("start", async (ctx) => {
  resetSession(ctx.from!.id);
  registerUser(ctx.chat.id, ctx.from?.first_name ?? "");
  const mode = userMode(ctx.from!.id);

  // Диплинк-вызов на челлендж: t.me/<bot>?start=ch_<id>
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (payload.startsWith("ch_")) {
    const chId = payload.slice(3);
    const existing = getChallengeById(chId);
    const userId = ctx.from!.id;

    if (!existing || existing.finished) {
      await ctx.reply(`⚔️ Этот вызов уже не действует. Создай свой — кнопка «⚔️ Челлендж».`);
    } else if (existing.fromId === userId) {
      await ctx.reply(`⚔️ Это твоя собственная ссылка — отправь её другу 😉`);
    } else if (existing.toId !== undefined) {
      await ctx.reply(`⚔️ К этому вызову уже присоединился другой соперник. Создай свой — кнопка «⚔️ Челлендж».`);
    } else if (getActiveChallenge(userId, today())) {
      await ctx.reply(`⚔️ У тебя уже идёт челлендж — сначала закончи его.`);
    } else {
      const start = today();
      const end = addDaysStr(start, 6); // 7 дней включительно
      const ch = joinChallenge(chId, userId, start, end);
      if (ch) {
        await ctx.reply(
          `⚔️ <b>ВЫЗОВ ПРИНЯТ!</b>\n${HR}\n\n` +
          `Ты против <b>${esc(nameOf(ch.fromId))}</b>: кто больше дней с тренировками за неделю.\n` +
          `Финиш: <b>${end.slice(8)}.${end.slice(5, 7)} включительно</b>. Счёт 0:0 — вперёд! 💪\n\n` +
          `<i>Проверить счёт: кнопка «⚔️ Челлендж».</i>`,
          HTML
        );
        try {
          await bot.api.sendMessage(
            ch.fromId,
            `⚔️ <b>${esc(ctx.from?.first_name ?? "Соперник")} принял твой вызов!</b>\n\n` +
            `Неделя пошла — кто больше дней с тренировками. Счёт 0:0. Не подведи 😤`,
            { parse_mode: "HTML" }
          );
        } catch { /* создатель заблокировал бота */ }
      }
    }
    // новому пользователю всё равно нужен выбор режима
    if (userMode(ctx.from!.id) !== null) return;
  }

  if (mode === "simple") {
    await sendSimpleWelcome(ctx, ctx.from?.first_name ?? "друг");
    return;
  }
  if (mode === "pro") {
    await sendProWelcome(ctx, ctx.from?.first_name ?? "атлет");
    return;
  }

  await ctx.reply(
    `<b>💪 Привет, ${esc(ctx.from?.first_name ?? "друг")}!</b>\n${HR}\n\n` +
    `Я тренировочный бот. Чтобы говорить с тобой на одном языке — один вопрос:\n\n` +
    `<b>Как ты тренируешься?</b>`,
    { reply_markup: MODE_KEYBOARD, ...HTML }
  );
});

bot.command("mode", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.reply(
    `<b>Сменить режим?</b>\n\n` +
    `🙂 <b>Простой</b> — готовые тренировки, без терминов\n` +
    `🏋️ <b>Про</b> — программы с периодизацией, 1RM, аналитика`,
    { reply_markup: MODE_KEYBOARD, ...HTML }
  );
});

bot.callbackQuery(/^mode_(simple|pro)$/, async (ctx) => {
  const mode = ctx.match[1] as "simple" | "pro";
  registerUser(ctx.from.id, ctx.from.first_name ?? "");
  updateUser(ctx.from.id, { mode });
  await ctx.answerCallbackQuery();

  // «Нулевой день» (находка MyFitnessPal): пользователь, сделавший реальное действие
  // в первую же сессию, остаётся в разы чаще — сразу ведём к действию, а не к чтению меню.
  if (mode === "simple") {
    await sendSimpleWelcome(ctx, ctx.from.first_name ?? "друг");
    await ctx.reply(
      `🎯 <b>Начнём прямо сейчас — где тебе удобнее заниматься?</b>\n\n<i>Покажу первую тренировку, займёт 20–30 минут. Это можно поменять в любой момент.</i>`,
      { reply_markup: PLACE_KEYBOARD, ...HTML }
    );
  } else {
    await sendProWelcome(ctx, ctx.from.first_name ?? "атлет");
    await ctx.reply(
      `🎯 <b>Первый шаг — прямо сейчас, 10 секунд:</b>\n\n` +
      `Вспомни последнюю тренировку и напиши её одной строкой, например:\n` +
      `<code>присед 100 5х5</code>\n\n` +
      `<i>С первой записи начнёт копиться история, рекорды и графики.</i>`,
      HTML
    );
  }
});

// ── Простой режим: тренировка на сегодня ────────────────────────────────────
const PLACE_KEYBOARD = {
  inline_keyboard: [
    [{ text: "🏠 Дома (без инвентаря)", callback_data: "splace_home" }],
    [{ text: "🏋️ В зале", callback_data: "splace_gym" }],
  ],
};

function currentSimpleWorkout(userId: number) {
  const u = getUser(userId);
  const place: Place = u?.simplePlace === "gym" ? "gym" : "home";
  const idx = u?.simpleIdx ?? 0;
  const plan = SIMPLE_PLANS[place];
  return { place, idx, w: plan[idx % plan.length] };
}

/** Совет по сложности на основе фидбэка после прошлых тренировок (подход Freeletics). */
function diffAdvice(userId: number, place: Place): string {
  const diff = getUser(userId)?.simpleDiff ?? 0;
  if (diff >= 3 && place === "home") {
    return `\n\n🔥 <i>Тебе стабильно легко — пора усложняться! Открой «❓ Как делать» и переходи на следующий вариант упражнений (например, с отжиманий от стены — к отжиманиям от стола).</i>`;
  }
  if (diff >= 1) {
    return `\n\n🔥 <i>Прошлый раз было легко — сегодня добавь по ${diff * 2} повторения к каждому подходу${place === "gym" ? " или +2.5 кг к весу" : ""}.</i>`;
  }
  if (diff <= -1) {
    return `\n\n🟢 <i>Прошлый раз было тяжело — сегодня сделай на 2 повторения меньше в каждом подходе или возьми облегчённый вариант («❓ Как делать» → «Если тяжело»). Это нормально, форма придёт.</i>`;
  }
  return "";
}

async function sendSimpleWorkout(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, userId: number) {
  const { place, w } = currentSimpleWorkout(userId);

  const items = w.items
    .map((e, i) =>
      `<b>${i + 1}. ${esc(e.name)}</b> ${DOT} ${esc(e.scheme)}\n` +
      `<i>${esc(e.short)}</i>`
    )
    .join("\n\n");

  const kb = new InlineKeyboard();
  w.items.forEach((e, i) => {
    kb.text(`❓ ${i + 1}`, `sdet_${i}`).text(`🟢 ${i + 1}`, `seas_${i}`);
    kb.row();
  });
  kb.text("✅ Выполнил — записать", "simple_done").row();
  kb.text("⚡ Нет времени — 15 минут", "simple_short").row();
  kb.text(place === "gym" ? "⚖️ Как выбрать вес" : "📈 Стало легко?", "simple_weight")
    .text("🔄 Дома/зал", "simple_place");

  await ctx.reply(
    `🏋️ <b>ТРЕНИРОВКА ${w.label}</b> ${DOT} ${place === "home" ? "дома" : "в зале"}\n${HR}\n\n` +
    `<i>Разминка: 5 минут быстрой ходьбы на месте + покрути руками и тазом. Тело должно согреться.</i>\n\n` +
    items +
    diffAdvice(userId, place) +
    `\n\n⏱ <i>Отдых между подходами: 1.5–2 минуты.\nНе знаешь, как делать упражнение, — жми «❓ Как делать».</i>`,
    { reply_markup: kb, ...HTML }
  );
}

bot.hears("🏋️ Тренировка на сегодня", async (ctx) => {
  const userId = ctx.from!.id;
  resetSession(userId);
  const u = getUser(userId);
  if (!u?.simplePlace) {
    await ctx.reply(
      `🏋️ <b>Где будешь заниматься?</b>\n\n<i>Это можно поменять в любой момент.</i>`,
      { reply_markup: PLACE_KEYBOARD, ...HTML }
    );
    return;
  }
  await sendSimpleWorkout(ctx, userId);
});

bot.callbackQuery(/^splace_(home|gym)$/, async (ctx) => {
  const place = ctx.match[1] as Place;
  registerUser(ctx.from.id, ctx.from.first_name ?? "");
  updateUser(ctx.from.id, { simplePlace: place });
  await ctx.answerCallbackQuery(place === "home" ? "Тренируемся дома 🏠" : "Тренируемся в зале 🏋️");
  await sendSimpleWorkout(ctx, ctx.from.id);
});

bot.callbackQuery("simple_place", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏋️ <b>Где будешь заниматься?</b>`, { reply_markup: PLACE_KEYBOARD, ...HTML });
});

// Облегчённый вариант упражнения (Muscle Booster: swap если тяжело)
bot.callbackQuery(/^seas_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const { w } = currentSimpleWorkout(ctx.from.id);
  const e = w.items[parseInt(ctx.match[1])];
  if (!e) return;
  await ctx.reply(
    `🟢 <b>ЛЕГЧЕ: ${esc(e.name)}</b>\n${HR}\n\n${esc(e.easier)}\n\n` +
    `<i>Сделай этот вариант вместо основного — засчитывается так же.</i>`,
    HTML
  );
});

// Подробная инструкция по упражнению
bot.callbackQuery(/^sdet_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const { w } = currentSimpleWorkout(ctx.from.id);
  const e = w.items[parseInt(ctx.match[1])];
  if (!e) return;

  const steps = e.steps.map((s, i) => `${i + 1}. ${esc(s)}`).join("\n");
  const mistakes = e.mistakes.map((m) => `${DOT} ${esc(m)}`).join("\n");
  const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(e.videoQuery)}`;

  await ctx.reply(
    `❓ <b>${esc(e.name.toUpperCase())}</b>\n` +
    `<i>${esc(e.scheme)}</i>\n${HR}\n\n` +
    `<b>Как делать:</b>\n${steps}\n\n` +
    `⚠️ <b>Частые ошибки:</b>\n${mistakes}\n\n` +
    `🟢 <b>Если тяжело:</b> ${esc(e.easier)}`,
    {
      reply_markup: { inline_keyboard: [[{ text: "▶️ Посмотреть видео", url: videoUrl }]] },
      ...HTML,
    }
  );
});

bot.callbackQuery("simple_weight", async (ctx) => {
  await ctx.answerCallbackQuery();
  const { place } = currentSimpleWorkout(ctx.from.id);
  const rule = place === "gym" ? WEIGHT_RULE : HOME_RULE;
  await ctx.reply(
    `❓ <b>${place === "gym" ? "КАК ВЫБРАТЬ ВЕС" : "СТАЛО ЛЕГКО?"}</b>\n${HR}\n\n${esc(rule)}`,
    HTML
  );
});

// Экспресс-версия на 15 минут: 3 упражнения × 2 подхода (у 400 млн юзеров Keep средняя тренировка — 20 мин)
bot.callbackQuery("simple_short", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;
  const { place, w } = currentSimpleWorkout(userId);

  const shortItems = w.items.slice(0, 3);
  const items = shortItems
    .map((e, i) =>
      `<b>${i + 1}. ${esc(e.name)}</b> ${DOT} ${esc(e.scheme.replace(/^3 подхода/, "2 подхода"))}\n` +
      `<i>${esc(e.short)}</i>`
    )
    .join("\n\n");

  const kb = new InlineKeyboard();
  shortItems.forEach((_, i) => {
    kb.text(`❓ ${i + 1}. Как делать`, `sdet_${i}`);
    if (i % 2 === 1) kb.row();
  });
  if (shortItems.length % 2 !== 0) kb.row();
  kb.text("✅ Выполнил — записать", "simple_done");

  await ctx.reply(
    `⚡ <b>ЭКСПРЕСС ${w.label}</b> ${DOT} ~15 минут ${DOT} ${place === "home" ? "дома" : "в зале"}\n${HR}\n\n` +
    `<i>Разминка: 2–3 минуты ходьбы на месте и махов руками.</i>\n\n` +
    items +
    `\n\n⏱ <i>Отдых между подходами: 1 минута.\n` +
    `Короткая тренировка лучше пропущенной — 15 минут тоже засчитываются!</i>`,
    { reply_markup: kb, ...HTML }
  );
});

const FEEDBACK_KEYBOARD = {
  inline_keyboard: [[
    { text: "😮‍💨 Тяжело", callback_data: "sfb_hard" },
    { text: "👌 Норм", callback_data: "sfb_ok" },
    { text: "😴 Легко", callback_data: "sfb_easy" },
  ]],
};

bot.callbackQuery("simple_done", async (ctx) => {
  const userId = ctx.from.id;
  const { idx, w, place } = currentSimpleWorkout(userId);
  const plan = SIMPLE_PLANS[place];

  addWorkout({
    userId,
    date: today(),
    exercise: `Тренировка ${w.label} (фулбоди)`,
    sets: 1,
    reps: 1,
    weightKg: 0,
    notes: "simple",
  });
  updateUser(userId, { simpleIdx: idx + 1 });
  void notifyChallenge(userId);

  const streak = weekStreak(userId);
  const total = getAllWorkouts(userId).length;
  const streakLine = streak >= 2 ? `\n🔥 Серия: <b>${streak} недель подряд</b> — так и держи!` : "";

  await ctx.answerCallbackQuery("Записано! 💪");
  await ctx.reply(
    `✅ <b>ТРЕНИРОВКА ЗАПИСАНА</b>\n${HR}\n\n` +
    `Отличная работа! Это твоя тренировка №${total}.${streakLine}\n\n` +
    `<i>Следующая — «Тренировка ${plan[(idx + 1) % plan.length].label}», через 1–2 дня отдыха.</i>\n\n` +
    `<b>Как зашло?</b> <i>По ответу подстрою следующую тренировку.</i>`,
    { reply_markup: FEEDBACK_KEYBOARD, ...HTML }
  );
});

// Фидбэк → адаптация следующей тренировки (подход Freeletics)
bot.callbackQuery(/^sfb_(hard|ok|easy)$/, async (ctx) => {
  const userId = ctx.from.id;
  const fb = ctx.match[1];
  const cur = getUser(userId)?.simpleDiff ?? 0;

  let next = cur;
  let msg: string;
  if (fb === "easy") {
    next = Math.min(cur + 1, 4);
    msg = `😴 Понял — в следующий раз будет посложнее: добавим повторений.`;
  } else if (fb === "hard") {
    next = Math.max(cur - 1, -1);
    msg = `😮‍💨 Понял — следующую сделаем чуть легче. Тяжело — это нормально, тело адаптируется.`;
  } else {
    msg = `👌 Отлично — нагрузка в самый раз, продолжаем по плану.`;
  }
  updateUser(userId, { simpleDiff: next });

  await ctx.answerCallbackQuery("Учёл!");
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
  } catch { /* skip */ }
  await ctx.reply(msg);
});

// ── Простой режим: прогресс и помощь ────────────────────────────────────────
bot.hears("📈 Мой прогресс", async (ctx) => {
  const userId = ctx.from!.id;
  resetSession(userId);
  const dates = getWorkoutDates(userId);
  if (dates.length === 0) {
    await ctx.reply(
      `📈 <b>МОЙ ПРОГРЕСС</b>\n${HR}\n\nПока нет ни одной тренировки.\n<i>Жми «🏋️ Тренировка на сегодня» — начнём!</i>`,
      HTML
    );
    return;
  }
  const month = today().slice(0, 7);
  const thisMonth = dates.filter((d) => d.startsWith(month)).length;
  const streak = weekStreak(userId);

  await ctx.reply(
    `📈 <b>МОЙ ПРОГРЕСС</b>\n${HR}\n\n` +
    `<code>Всего тренировок   ${dates.length}</code>\n` +
    `<code>В этом месяце      ${thisMonth}</code>\n` +
    `<code>Недель подряд      ${streak}</code>\n\n` +
    monthCalendar(userId),
    HTML
  );
});

bot.hears("❓ Помощь", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.reply(
    `❓ <b>КАК ПОЛЬЗОВАТЬСЯ</b>\n${HR}\n\n` +
    `🏋️ <b>Тренировка на сегодня</b> — готовый план дома или в зале. Не знаешь упражнение — жми «❓ Как делать»: объясню пошагово, покажу видео. Сделал всё — нажми «✅ Выполнил».\n\n` +
    `📈 <b>Мой прогресс</b> — календарь и серия недель без пропусков.\n\n` +
    `🍗 <b>Питание</b> — сколько калорий и белка тебе нужно под твою цель.\n\n` +
    `⚖️ <b>Вес тела</b> — записывай вес, увидишь график.\n\n` +
    `⚔️ <b>Челлендж</b> — вызови друга: кто больше тренировок за неделю.\n\n` +
    `⏰ <b>Напоминания</b> — /remind, выбери дни и время.\n\n` +
    `💪 Ходишь в зал со своей программой? Просто напиши что сделал: <code>присед 50 3х10</code> — я запишу.\n\n` +
    `<i>Опытный атлет? Переключись в про-режим: /mode — там программы с периодизацией, 1RM и аналитика.</i>`,
    { reply_markup: SIMPLE_KEYBOARD, ...HTML }
  );
});

// ── Гид для новичка ─────────────────────────────────────────────────────────
bot.callbackQuery("guide_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🎓 <b>С ЧЕГО НАЧАТЬ — 3 ШАГА</b>\n${HR}\n\n` +
    `<b>Шаг 1 ${DOT} Запиши первую тренировку</b>\n` +
    `Просто напиши в чат что сделал. Например сделал 3 подхода по 8 повторений с весом 40 кг:\n` +
    `<code>присед 40 3х8</code>\n` +
    `Или скажи голосовым 🎙: <i>«Присед 40 килограмм 3 подхода по 8»</i>. Всё.\n\n` +
    `<b>Шаг 2 ${DOT} Получи программу</b>\n` +
    `Нажми «📋 Программа». Не знаешь термины — не страшно:\n` +
    `${DOT} выбирай <b>GZCLP</b> — она для новичков\n` +
    `${DOT} 3 дня в неделю — оптимальный старт\n` +
    `${DOT} свой максимум (1RM) знать <b>не обязательно</b> — введи рабочий подход, например <code>40×8</code>, бот посчитает сам\n\n` +
    `<b>Шаг 3 ${DOT} Ходи в зал и жми «✅ Выполнено»</b>\n` +
    `Бот покажет что делать на каждой тренировке: упражнение, вес, подходы, отдых. ` +
    `Выполнил — отметил — получил следующую. Прогресс копится сам.\n\n` +
    `${HR}\n` +
    `💡 <b>Словарь на старте:</b>\n` +
    `${DOT} <b>1RM</b> — максимальный вес, который ты можешь поднять 1 раз\n` +
    `${DOT} <b>Подход (сет)</b> — серия повторений без отдыха\n` +
    `${DOT} <b>4×8</b> — 4 подхода по 8 повторений\n\n` +
    `<i>Остальное объясню по ходу — в программе есть кнопка «❓ Как читать».</i>`,
    HTML
  );
});

// ── /help ─────────────────────────────────────────────────────────────────
bot.command("help", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.reply(
    `❓ <b>СПРАВКА</b>\n${HR}\n\n` +
    `📝 <b>Записать тренировку</b>\nПросто напиши в чат: <code>присед 100 5х5</code>. Разные веса: <code>жим 60х8, 80х5, 100х3</code>. Несколько упражнений — с новой строки. Можно голосовым 🎙. Бот сам заметит рекорды. Кнопка «📝» — если удобнее пошагово.\n\n` +
    `📔 <b>Сегодня</b>\nВсё, что записано за день: тоннаж, стрик, удаление лишнего, экспорт CSV.\n\n` +
    `📊 <b>Прогресс</b>\nИстория, рекорд и график по каждому упражнению. Внутри — календарь месяца, карта восстановления мышц (какие группы готовы к нагрузке) и силовой балл 0–100.\n\n` +
    `⚔️ <b>Челлендж</b>\nВызови друга на неделю: кто больше дней с тренировками. Ссылка-вызов, живой счёт, итоги в конце.\n\n` +
    `🏆 <b>Рекорды</b>\nЛучший вес и расчётный максимум по всем упражнениям на одном экране.\n\n` +
    `⏱ <b>Таймер отдыха и 🧊 разминка</b>\nПод каждой записью — таймер 2/3/4 мин и разминочные подходы с раскладкой блинов.\n\n` +
    `⏰ <b>Напоминания</b> — /remind\nВыбери дни и час — бот напомнит о тренировке, если её ещё нет в дневнике.\n\n` +
    `📋 <b>Программа</b>\nГотовый план на недели: DUP, 5/3/1, GZCLP и другие. Вводишь 1RM по каждому движению — получаешь расписание с весами. Отмечай «Выполнено» — бот ведёт по циклу и логирует за тебя.\n\n` +
    `🧮 <b>1RM калькулятор</b>\n<code>100×5</code> — расчёт максимума, или одно число <code>140</code> — таблица % от известной одиночки.\n\n` +
    `🍗 <b>Питание</b>\nКалории и БЖУ под цель (масса/сушка/поддержание) — по формуле Миффлина – Сан-Жеора, с учётом твоего веса из дневника. Сфотографируй еду — посчитаю автоматически («📸 Еда»).\n\n` +
    `⚖️ <b>Вес тела</b>\nВводи вес — получишь график динамики.\n\n` +
    `📈 <b>Отчёт недели</b>\nТоннаж, тренды, застой, дисбаланс жим/тяга. Приходит сам по воскресеньям в 18:00.\n\n` +
    `<i>Сбились кнопки? Нажми /start</i>`,
    { reply_markup: MAIN_KEYBOARD, ...HTML }
  );
});

// ── Запись тренировки ─────────────────────────────────────────────────────
bot.hears("📝 Записать тренировку", async (ctx) => {
  const userId = ctx.from!.id;
  const s = getSession(userId);
  s.state = null;
  s.data = {};
  s.exList = buildExerciseList(userId);
  await ctx.reply(
    `📝 <b>НОВАЯ ЗАПИСЬ</b>\n${HR}\n\n` +
    `💡 <i>Быстрее без кнопок — просто напиши:</i> <code>присед 100 5х5</code>\n\n` +
    `<i>Или выбери упражнение:</i>`,
    { reply_markup: exerciseKeyboard(s.exList), ...HTML }
  );
});

bot.callbackQuery(/^exi_(.+)$/, async (ctx) => {
  const raw = ctx.match[1];
  const s = getSession(ctx.from!.id);
  await ctx.answerCallbackQuery();

  if (raw === "custom") {
    // Каталог по категориям вместо ручного ввода
    await ctx.reply(
      `📚 <b>КАТАЛОГ УПРАЖНЕНИЙ</b>\n${HR}\n\n<i>Выбери группу:</i>`,
      { reply_markup: categoryKeyboard(), ...HTML }
    );
    return;
  }

  const list = s.exList ?? buildExerciseList(ctx.from!.id);
  const exercise = list[parseInt(raw)];
  if (!exercise) {
    await ctx.reply("Не нашёл упражнение — нажми «📝 Записать тренировку» заново.");
    return;
  }

  s.data.exercise = exercise;
  s.state = "log_sets";
  await promptLoad(ctx, ctx.from!.id, exercise);
});

// Каталог: выбор категории
bot.callbackQuery(/^excat_(.+)$/, async (ctx) => {
  const raw = ctx.match[1];
  const s = getSession(ctx.from!.id);
  await ctx.answerCallbackQuery();

  if (raw === "manual") {
    s.state = "log_exercise_custom";
    await ctx.reply(`✏️ <b>Своё упражнение</b>\n${HR}\n\n<i>Введи название:</i>`, HTML);
    return;
  }

  const catIdx = parseInt(raw);
  const cat = CATALOG[catIdx];
  if (!cat) return;
  await ctx.reply(
    `${cat.emoji} <b>${esc(cat.name.toUpperCase())}</b>\n${HR}\n\n<i>Выбери упражнение:</i>`,
    { reply_markup: categoryExercisesKeyboard(catIdx), ...HTML }
  );
});

// Каталог: выбор упражнения из категории
bot.callbackQuery(/^cex_(\d+)_(\d+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  await ctx.answerCallbackQuery();
  const exercise = CATALOG[parseInt(ctx.match[1])]?.items[parseInt(ctx.match[2])];
  if (!exercise) return;
  s.data.exercise = exercise;
  s.state = "log_sets";
  await promptLoad(ctx, ctx.from!.id, exercise);
});

// Совместимость со старыми сообщениями, где коллбэк содержит имя упражнения
bot.callbackQuery(/^ex_(.+)$/, async (ctx) => {
  const raw = ctx.match[1];
  const s = getSession(ctx.from!.id);
  await ctx.answerCallbackQuery();

  if (raw === "custom") {
    s.state = "log_exercise_custom";
    await ctx.reply(`✏️ <b>Своё упражнение</b>\n${HR}\n\n<i>Введи название:</i>`, HTML);
    return;
  }

  s.data.exercise = raw;
  s.state = "log_sets";
  await ctx.reply(
    `✅ <b>${esc(raw)}</b>\n${HR}\n\nВведи нагрузку, например <code>4×5×120</code>`,
    HTML
  );
});

// ── 1RM калькулятор ───────────────────────────────────────────────────────
bot.hears("🧮 1RM калькулятор", async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.state = "orm_input";
  s.data = {};
  await ctx.reply(
    `🧮 <b>КАЛЬКУЛЯТОР 1RM</b>\n${HR}\n\n` +
    `<b>Вариант 1</b> — рассчитать по подходу:\n<code>вес × повторения</code>\n<i>Например: 100×5 или 90 8</i>\n\n` +
    `<b>Вариант 2</b> — ввести известный максимум:\n<code>одно число</code>\n<i>Например: 140 (если делал одиночку)</i>\n\n` +
    `💡 <i>Для расчёта точнее бери подход на 3–5 повторений.</i>`,
    HTML
  );
});

// ── Вес тела ───────────────────────────────────────────────────────────────
bot.hears("⚖️ Вес тела", async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.state = "bw_input";
  s.data = {};
  const bw = getBodyweight(ctx.from!.id, 1);
  const last = bw.length ? `\n\n<i>Последняя запись: ${bw[bw.length - 1].weightKg} кг</i>` : "";
  await ctx.reply(
    `⚖️ <b>ВЕС ТЕЛА</b>\n${HR}\n\n` +
    `Введи текущий вес в кг:\n\n<code>Например: 82.5</code>${last}`,
    HTML
  );
});

// ── Отчёт недели ─────────────────────────────────────────────────────────
bot.hears("📈 Отчёт недели", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.reply(buildWeeklyReport(ctx.from!.id), { reply_markup: MAIN_KEYBOARD, ...HTML });
});

// ── Прогресс ──────────────────────────────────────────────────────────────
bot.hears("📊 Прогресс", async (ctx) => {
  const userId = ctx.from!.id;
  const exercises = getExercises(userId);
  if (exercises.length === 0) {
    await ctx.reply(
      `📊 <b>ПРОГРЕСС</b>\n${HR}\n\n` +
      `Пока нет ни одной записи.\n<i>Напиши в чат:</i> <code>присед 100 5х5</code>`,
      HTML
    );
    return;
  }
  const s = getSession(userId);
  s.state = "progress_exercise";
  s.data = {};
  // callback_data ограничен 64 байтами — передаём индекс, а не имя
  const kb = new InlineKeyboard();
  exercises.forEach((ex, i) => {
    const label = ex.length > 28 ? ex.slice(0, 27) + "…" : ex;
    kb.text(label, `prg_${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  kb.row().text("🗓 Календарь месяца", "cal_month");
  kb.row().text("🦵 Восстановление мышц", "rec_map").text("💪 Силовой балл", "str_score");
  await ctx.reply(
    `📊 <b>ПРОГРЕСС</b>\n${HR}\n\n<i>Выбери упражнение:</i>`,
    { reply_markup: kb, ...HTML }
  );
});

// ── Карта восстановления мышц (rule-based аналог Fitbod recovery map) ────────
bot.callbackQuery("rec_map", async (ctx) => {
  await ctx.answerCallbackQuery();
  const map = recoveryMap(ctx.from.id, today());

  const icon = { loaded: "🔴", recovering: "🟡", fresh: "🟢" } as const;
  const label = { loaded: "нагружена", recovering: "восстанавливается", fresh: "готова" } as const;

  const lines = map.map((g) => {
    const when =
      g.daysAgo === null ? "давно не тренировалась" :
      g.daysAgo === 0 ? "сегодня" :
      g.daysAgo === 1 ? "вчера" : `${g.daysAgo} дн. назад`;
    return `${icon[g.status]} <b>${esc(g.name)}</b> — ${label[g.status]} <i>(${when})</i>`;
  });

  const ready = map.filter((g) => g.status === "fresh").map((g) => g.name);
  const advice = ready.length
    ? `\n💡 <b>Сегодня оптимально:</b> ${ready.join(", ").toLowerCase()}`
    : `\n💡 <i>Все группы под нагрузкой — хороший день для отдыха или лёгкого кардио.</i>`;

  await ctx.reply(
    `🦵 <b>ВОССТАНОВЛЕНИЕ МЫШЦ</b>\n${HR}\n\n` +
    lines.join("\n") +
    `\n${advice}\n\n` +
    `<i>Ориентир: крупной группе нужно ~48–72 часа на восстановление.</i>`,
    HTML
  );
});

// ── Силовой балл (rule-based аналог Fitbod Strength Score) ───────────────────
bot.callbackQuery("str_score", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;
  const res = strengthScore(userId, today());
  const trends = groupTrends(userId, today());

  if (res.lifts.length === 0 && trends.length === 0) {
    await ctx.reply(
      `💪 <b>СИЛОВОЙ БАЛЛ</b>\n${HR}\n\nПока мало данных. Записывай базовые движения (присед, жим лёжа, становая, жим стоя) — и я посчитаю твой уровень силы.`,
      HTML
    );
    return;
  }

  let liftBlock = "";
  if (res.lifts.length > 0) {
    const rows = res.lifts.map((l) => {
      const ratio = l.ratio !== null ? `${l.ratio}×BW` : "—";
      const score = l.score !== null ? `${l.score}/100` : "";
      return `<code>${esc(l.name).padEnd(10)} e1RM ${String(l.e1rm).padStart(3)}  ${ratio.padStart(7)}  ${score}</code>`;
    });
    liftBlock =
      `<i>Лучшие расчётные максимумы за 90 дней${res.bodyweight ? ` · твой вес ${res.bodyweight} кг` : ""}:</i>\n` +
      rows.join("\n") +
      (res.overall !== null
        ? `\n\n🎯 <b>Общий балл: ${res.overall}/100</b>\n<i>100 — уровень сильного атлета-любителя (присед 2.5×BW, жим 1.8×BW, тяга 3×BW).</i>`
        : `\n\n<i>Запиши вес тела («⚖️ Вес тела») — посчитаю балл относительно твоего веса.</i>`);
  }

  let trendBlock = "";
  if (trends.length > 0) {
    const rows = trends.map((t) => {
      const arrow = t.pct > 2 ? "📈" : t.pct < -2 ? "📉" : "➡️";
      const sign = t.pct > 0 ? "+" : "";
      return `${t.emoji} ${esc(t.name)}: ${arrow} ${sign}${t.pct}% <i>(${t.prev}→${t.cur} кг)</i>`;
    });
    trendBlock = `\n\n<b>Динамика за 30 дней (лучший e1RM):</b>\n` + rows.join("\n");
  }

  await ctx.reply(
    `💪 <b>СИЛОВОЙ БАЛЛ</b>\n${HR}\n\n` + liftBlock + trendBlock,
    HTML
  );
});

bot.callbackQuery("cal_month", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(monthCalendar(ctx.from.id), HTML);
});

bot.callbackQuery(/^prg_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const idx = parseInt(ctx.match[1]);
  const exercise = getExercises(userId)[idx];
  await ctx.answerCallbackQuery();
  if (!exercise) {
    await ctx.reply("Упражнение не найдено — открой «📊 Прогресс» заново.");
    return;
  }
  const entries = getWorkouts(userId, exercise, 12);
  if (entries.length === 0) {
    await ctx.reply("Записей по этому упражнению нет.");
    return;
  }

  const recent = entries.slice(-6);
  const maxWeight = Math.max(...entries.map((e) => e.weightKg));
  const first = entries[0].weightKg;
  const last = entries[entries.length - 1].weightKg;
  const delta = last - first;
  const trend = delta > 0 ? `📈 +${delta} кг` : delta < 0 ? `📉 ${delta} кг` : "➡️ без изменений";

  const rows = recent
    .map((e) => `${e.date.slice(5)}  ${String(e.sets)}×${String(e.reps)}  ${String(e.weightKg).padStart(4)} кг`)
    .join("\n");

  await ctx.reply(
    `📊 <b>${esc(exercise)}</b>\n${HR}\n\n` +
    `<code>${rows}</code>\n\n` +
    `🏆 <b>Рекорд:</b> ${maxWeight} кг\n` +
    `📌 <b>Динамика:</b> ${trend}`,
    HTML
  );

  if (entries.length >= 2) {
    try {
      const buf = await fetchImageBuffer(progressChartUrl(entries));
      await ctx.replyWithPhoto(new InputFile(buf, "progress.png"));
    } catch { /* skip */ }
  }
});

// ── Программа ────────────────────────────────────────────────────────────
bot.hears("📋 Программа", async (ctx) => {
  const prog = getActiveProgram(ctx.from!.id);
  if (!prog) {
    const s = getSession(ctx.from!.id);
    s.state = "prog_model";
    s.data = {};
    await ctx.reply(
      `📋 <b>НОВАЯ ПРОГРАММА</b>\n${HR}\n\n` +
      `Активной программы нет — соберём с нуля.\n\n` +
      `<b>Шаг 1 ${DOT} Выбери схему</b>\n\n` +
      `🔰 <i>Новичок — бери <b>GZCLP</b>: простая и надёжная.\n` +
      `Опытный — DUP или 5/3/1.</i>`,
      { reply_markup: modelKeyboard(), ...HTML }
    );
    return;
  }

  const weekData = prog.weeksData.find((w) => w.week === prog.currentWeek);
  const session = weekData?.sessions.find((s) => s.day === prog.currentDay);

  if (!session) {
    await ctx.reply(
      `🏆 <b>ПРОГРАММА ЗАВЕРШЕНА</b>\n${HR}\n\nОтличная работа! Создай новую.`,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
    return;
  }

  const kb = new InlineKeyboard()
    .text("✅ Выполнено", "prog_done")
    .text("⏭ Пропустить", "prog_skip")
    .row()
    .text("🎚 Как самочувствие?", "rdy_ask")
    .row()
    .text("📄 Вся программа", "prog_full")
    .text("❓ Как читать", "prog_help")
    .row();
  if (session.weightKg >= 30) kb.text("🧊 Разминка", `warm_${session.weightKg}`);
  kb.text("🗑 Сбросить", "prog_reset");

  const totalDays = prog.weeks * prog.daysPerWeek;
  const doneDays = (prog.currentWeek - 1) * prog.daysPerWeek + (prog.currentDay - 1);
  const pct = Math.round((doneDays / totalDays) * 100);
  const phaseTag =
    prog.currentWeek === prog.peakWeek ? "  🔥 <b>ПИК</b>" :
    prog.currentWeek === prog.deloadWeek ? "  💤 <b>РАЗГРУЗКА</b>" : "";

  const subtitle = prog.lifts?.length
    ? `${prog.lifts.length} движений`
    : `1RM ${prog.oneRmKg} кг`;
  await ctx.reply(
    `📋 <b>${esc(MODEL_LABELS[prog.model] ?? prog.model)}</b>\n` +
    `<i>${subtitle}</i>\n` +
    `${HR}\n\n` +
    `${bar(doneDays, totalDays)}  ${pct}%\n` +
    `<i>Неделя ${prog.currentWeek}/${prog.weeks} ${DOT} День ${prog.currentDay}</i>${phaseTag}\n\n` +
    formatSession(session),
    { reply_markup: kb, ...HTML }
  );
});

bot.callbackQuery("prog_done", async (ctx) => {
  await ctx.answerCallbackQuery("✅ Отмечено!");
  const userId = ctx.from.id;
  const prog = getActiveProgram(userId);
  if (!prog) return;

  const weekData = prog.weeksData.find((w) => w.week === prog.currentWeek);
  const session = weekData?.sessions.find((s) => s.day === prog.currentDay);
  let prBanner = "";
  if (session) {
    // фокус имеет вид «Присед · тяжёлый день» — логируем под чистым именем движения,
    // чтобы прогресс и рекорды считались по упражнению
    const liftName = session.focus.split("·")[0].trim() || session.focus;
    const pr = checkPr(userId, liftName, session.weightKg, session.reps);
    addWorkout({
      userId,
      date: today(),
      exercise: liftName,
      sets: session.sets,
      reps: session.reps,
      weightKg: session.weightKg,
      notes: `${prog.model} W${prog.currentWeek}D${prog.currentDay}`,
    });
    void notifyChallenge(userId);
    if (pr.isWeightPr) {
      prBanner = `\n🏆 <b>Новый рекорд веса в «${esc(liftName)}»: ${session.weightKg} кг!</b>\n`;
    } else if (pr.isE1rmPr) {
      prBanner = `\n🥇 <b>Рекорд по силе в «${esc(liftName)}»: расчётный 1RM ${pr.e1rm} кг!</b>\n`;
    }
  }

  const updated = advanceProgramDay(userId);
  if (!updated || !updated.active) {
    await ctx.reply(
      `🏆 <b>ПРОГРАММА ЗАВЕРШЕНА</b>\n${prBanner}${HR}\n\nВесь цикл пройден. Красавчик!`,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
    return;
  }

  const nextWeek = updated.weeksData.find((w) => w.week === updated.currentWeek);
  const nextSess = nextWeek?.sessions.find((s) => s.day === updated.currentDay);
  if (nextSess) {
    const totalDays = updated.weeks * updated.daysPerWeek;
    const doneDays = (updated.currentWeek - 1) * updated.daysPerWeek + (updated.currentDay - 1);
    const pct = Math.round((doneDays / totalDays) * 100);
    await ctx.reply(
      `✅ <b>Записано в дневник!</b>\n${prBanner}${HR}\n\n` +
      `${bar(doneDays, totalDays)}  ${pct}%\n` +
      `<b>Дальше</b> ${DOT} Неделя ${updated.currentWeek} ${DOT} День ${updated.currentDay}\n\n` +
      formatSession(nextSess),
      HTML
    );
  }
});

// ── Готовность к тренировке (подход JuggernautAI: нагрузка подстраивается под состояние)
bot.callbackQuery("rdy_ask", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🎚 <b>КАК СОСТОЯНИЕ СЕГОДНЯ?</b>\n${HR}\n\n<i>Сон, усталость, настрой — подстрою сегодняшнюю нагрузку.</i>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔥 Отлично — полон сил", callback_data: "rdy_good" }],
          [{ text: "👌 Нормально", callback_data: "rdy_mid" }],
          [{ text: "😮‍💨 Разбит: плохо спал / устал", callback_data: "rdy_bad" }],
        ],
      },
      ...HTML,
    }
  );
});

bot.callbackQuery(/^rdy_(good|mid|bad)$/, async (ctx) => {
  const level = ctx.match[1];
  await ctx.answerCallbackQuery();

  const prog = getActiveProgram(ctx.from.id);
  const weekData = prog?.weeksData.find((w) => w.week === prog.currentWeek);
  const session = weekData?.sessions.find((s) => s.day === prog!.currentDay);

  if (level === "good") {
    const extra = session && session.weightKg > 0
      ? `Идёшь по плану (${session.weightKg} кг). Чувствуешь запас в последнем подходе — можно добавить 2.5 кг или 1 повтор.`
      : `Идёшь по плану. Чувствуешь запас — добавь чуть-чуть в последнем подходе.`;
    await ctx.editMessageText(`🔥 <b>Полон сил — отлично!</b>\n\n${extra}`, HTML);
    return;
  }
  if (level === "mid") {
    await ctx.editMessageText(
      `👌 <b>Рабочее состояние.</b>\n\nДелай ровно по плану, без героизма. Стабильность бьёт интенсивность.`,
      HTML
    );
    return;
  }
  // bad: −10% к рабочему весу, объём сохраняем
  if (session && session.weightKg > 0) {
    const reduced = Math.round((session.weightKg * 0.9) / 2.5) * 2.5;
    await ctx.editMessageText(
      `😮‍💨 <b>Понял — сегодня работаем легче.</b>\n\n` +
      `Возьми <b>${reduced} кг вместо ${session.weightKg}</b> (−10%), подходы и повторения те же.\n\n` +
      `<i>Лёгкая тренировка в плохой день сохраняет прогресс лучше, чем пропуск или геройство. Выспись сегодня — недосып главный враг восстановления.</i>`,
      HTML
    );
  } else {
    await ctx.editMessageText(
      `😮‍💨 <b>Понял — сегодня работаем легче.</b>\n\n` +
      `Сократи нагрузку примерно на треть: меньше подходов или легче вариант. Главное — не пропускать совсем.`,
      HTML
    );
  }
});

bot.callbackQuery("prog_skip", async (ctx) => {
  await ctx.answerCallbackQuery("⏭ Пропущено");
  advanceProgramDay(ctx.from.id);
  await ctx.reply(
    `⏭ <b>День пропущен</b>\n\n<i>Нажми «📋 Программа» для следующей тренировки.</i>`,
    HTML
  );
});

bot.callbackQuery("prog_help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `❓ <b>КАК ЧИТАТЬ ПРОГРАММУ</b>\n${HR}\n\n` +
    `📊 <b>% (проценты)</b> — доля от твоего максимума на 1 раз (1RM).\n` +
    `<i>Пример: 1RM приседа 100 кг, значит 80% = 80 кг.</i>\n\n` +
    `🔢 <b>Подходы × повторения</b> — «5×3» значит 5 подходов по 3 повтора.\n\n` +
    `➕ <b>Знак «+» (AMRAP)</b> — в последнем подходе сделай столько повторений, сколько сможешь в чистой технике. Оставь 1–2 в запасе, не до полного отказа.\n\n` +
    `💪 <b>RPE (усилие, 1–10)</b> — насколько тяжело:\n` +
    `<code>RPE 6–7  легко, 3–4 в запасе</code>\n` +
    `<code>RPE 8    тяжело, ~2 в запасе</code>\n` +
    `<code>RPE 9    почти предел, 0–1</code>\n` +
    `<code>RPE 10   максимум, ничего не осталось</code>\n\n` +
    `🔥 <b>Пиковая неделя</b> — самая тяжёлая в цикле.\n` +
    `💤 <b>Разгрузка</b> — лёгкая неделя для восстановления.\n\n` +
    `🧊 <b>Разминка</b> — перед рабочими подходами сделай 2–3 лёгких с весом 40–60%.\n` +
    `⏱ <b>Отдых</b> между тяжёлыми подходами: 2–4 минуты.`,
    HTML
  );
});

bot.callbackQuery("prog_reset", async (ctx) => {
  await ctx.answerCallbackQuery("Программа сброшена");
  deactivatePrograms(ctx.from.id);
  await ctx.reply(
    `🗑 <b>Программа сброшена</b>\n${HR}\n\n<i>Открой «📋 Программа», чтобы собрать новую.</i>`,
    { reply_markup: MAIN_KEYBOARD, ...HTML }
  );
});

bot.callbackQuery("prog_full", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prog = getActiveProgram(ctx.from.id);
  if (!prog) return;

  const lines: string[] = [
    `📄 <b>ПОЛНАЯ ПРОГРАММА</b>`,
    `<i>${esc(MODEL_LABELS[prog.model] ?? prog.model)} ${DOT} ${prog.weeks} нед ${DOT} ${prog.daysPerWeek} дн/нед</i>`,
    HR,
  ];
  for (const w of prog.weeksData) {
    const mark =
      w.week === prog.peakWeek ? "  🔥 ПИК" :
      w.week === prog.deloadWeek ? "  💤 РАЗГРУЗКА" : "";
    lines.push(`\n<b>◆ Неделя ${w.week}</b>${mark}`);
    for (const s of w.sessions) {
      const load = s.detail ? esc(s.detail.split("\n")[0]) : `${s.sets}×${s.reps} @ ${s.weightKg}кг`;
      lines.push(`<code>Д${s.day} ${esc(s.focus)} — ${load}</code>`);
    }
  }

  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if ((cur + line + "\n").length > 3800) { chunks.push(cur); cur = line + "\n"; }
    else cur += line + "\n";
  }
  if (cur) chunks.push(cur);
  for (const chunk of chunks) await ctx.reply(chunk, HTML);
});

// ── Callback: создание программы ─────────────────────────────────────────
bot.callbackQuery(/^pm_(.+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.model = ctx.match[1];
  await ctx.answerCallbackQuery();

  if (TEMPLATE_MODELS.has(String(s.data.model))) {
    // Шаблоны не требуют выбора цели — сразу к длительности
    s.data.goal = "strength";
    s.state = "prog_weeks";
    await ctx.reply(
      `📅 <b>Длительность</b>\n${HR}\n\n<i>Сколько недель? (5/3/1 округлится до циклов по 4)</i>`,
      { reply_markup: weeksKeyboard(), ...HTML }
    );
    return;
  }

  s.state = "prog_goal";
  await ctx.reply(
    `🎯 <b>Шаг 2/4 ${DOT} Цель</b>\n${HR}\n\n<i>Что тренируем в приоритете?</i>`,
    { reply_markup: goalKeyboard(), ...HTML }
  );
});

bot.callbackQuery(/^pg_(.+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.goal = ctx.match[1];
  s.state = "prog_weeks";
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📅 <b>Шаг 3/4 ${DOT} Длительность</b>\n${HR}\n\n<i>Сколько недель в цикле?</i>`,
    { reply_markup: weeksKeyboard(), ...HTML }
  );
});

bot.callbackQuery(/^pw_(\d+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.weeks = parseInt(ctx.match[1]);
  s.state = "prog_days";
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🗓 <b>Шаг 4/4 ${DOT} Частота</b>\n${HR}\n\n<i>Сколько тренировок в неделю?</i>`,
    { reply_markup: daysKeyboard(), ...HTML }
  );
});

bot.callbackQuery(/^pd_(\d+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  const days = parseInt(ctx.match[1]);
  s.data.daysPerWeek = days;
  await ctx.answerCallbackQuery();

  // Готовим последовательный ввод 1RM по каждому базовому движению
  s.liftNames = LIFT_ORDER.slice(0, days);
  s.lifts = [];
  s.liftIdx = 0;
  s.state = "prog_lift_rm";

  await ctx.reply(
    `🏋️ <b>Рабочие веса</b>\n${HR}\n\n` +
    `Для каждого движения нужен твой максимум (1RM). Два способа:\n\n` +
    `${DOT} <b>Знаешь максимум</b> — введи одно число: <code>120</code>\n` +
    `${DOT} <b>Не знаешь</b> — введи любой рабочий подход <code>вес×повторения</code>, ` +
    `например <code>60×8</code> — посчитаю сам\n\n` +
    `<b>Движение 1/${days} ${DOT} ${esc(s.liftNames[0])}</b>`,
    HTML
  );
});

// ── Сегодня: дневник дня ─────────────────────────────────────────────────
function buildTodayView(userId: number): { text: string; kb: InlineKeyboard } {
  const rows = getAllWorkouts(userId).filter((w) => w.date === today());
  const streak = weekStreak(userId);
  const streakLine = streak >= 2 ? `\n🔥 <b>Стрик: ${streak} нед. подряд с тренировками</b>` : "";

  const kb = new InlineKeyboard();
  if (rows.length === 0) {
    kb.text("📤 Экспорт CSV", "exp_csv");
    return {
      text:
        `📔 <b>СЕГОДНЯ</b>\n${HR}\n\n` +
        `Записей пока нет.\n<i>Напиши в чат:</i> <code>присед 100 5х5</code>${streakLine}`,
      kb,
    };
  }

  const tonnage = rows.reduce((t, w) => t + w.sets * w.reps * w.weightKg, 0);
  const lines = rows.map((w, i) => {
    const load = w.weightKg > 0 ? ` @ ${w.weightKg} кг` : " (свой вес)";
    return `${i + 1}. <b>${esc(w.exercise)}</b> — ${w.sets}×${w.reps}${load}`;
  });

  rows.forEach((w, i) => {
    kb.text(`🗑 ${i + 1}`, `del_${w.id}`);
    if ((i + 1) % 4 === 0) kb.row();
  });
  if (rows.length % 4 !== 0) kb.row();
  kb.text("📤 Экспорт CSV", "exp_csv");

  return {
    text:
      `📔 <b>СЕГОДНЯ</b> ${DOT} ${today().slice(8)}.${today().slice(5, 7)}\n${HR}\n\n` +
      lines.join("\n") +
      `\n\n💪 <b>Тоннаж дня: ${Math.round(tonnage)} кг</b>${streakLine}\n\n` +
      `<i>🗑 с номером — удалить запись</i>`,
    kb,
  };
}

bot.hears("📔 Сегодня", async (ctx) => {
  resetSession(ctx.from!.id);
  const { text, kb } = buildTodayView(ctx.from!.id);
  await ctx.reply(text, { reply_markup: kb, ...HTML });
});

bot.callbackQuery(/^del_(.+)$/, async (ctx) => {
  removeWorkouts([ctx.match[1]]);
  await ctx.answerCallbackQuery("Удалено");
  const { text, kb } = buildTodayView(ctx.from.id);
  try {
    await ctx.editMessageText(text, { reply_markup: kb, ...HTML });
  } catch { /* сообщение не изменилось */ }
});

bot.callbackQuery("exp_csv", async (ctx) => {
  await ctx.answerCallbackQuery();
  const rows = getAllWorkouts(ctx.from.id);
  if (rows.length === 0) {
    await ctx.reply("Экспортировать пока нечего.");
    return;
  }
  const csv =
    "\uFEFFdate,exercise,sets,reps,weight_kg,notes\n" +
    rows
      .map((w) => `${w.date},"${w.exercise.replace(/"/g, '""')}",${w.sets},${w.reps},${w.weightKg},"${(w.notes ?? "").replace(/"/g, '""')}"`)
      .join("\n");
  await ctx.replyWithDocument(new InputFile(Buffer.from(csv, "utf-8"), "workouts.csv"), {
    caption: `📤 Все тренировки: ${rows.length} записей`,
  });
});

// ── Рекорды ──────────────────────────────────────────────────────────────
bot.hears("🏆 Рекорды", async (ctx) => {
  resetSession(ctx.from!.id);
  const all = getAllWorkouts(ctx.from!.id).filter((w) => w.weightKg > 0);
  if (all.length === 0) {
    await ctx.reply(
      `🏆 <b>РЕКОРДЫ</b>\n${HR}\n\nПока пусто. Запиши тренировку — рекорды появятся сами.`,
      HTML
    );
    return;
  }

  interface Rec { bestW: number; bestWDate: string; bestE1rm: number }
  const map = new Map<string, Rec>();
  for (const w of all) {
    const e1 = w.reps <= 1 ? w.weightKg : w.weightKg * (1 + w.reps / 30);
    const cur = map.get(w.exercise) ?? { bestW: 0, bestWDate: "", bestE1rm: 0 };
    if (w.weightKg > cur.bestW) { cur.bestW = w.weightKg; cur.bestWDate = w.date; }
    if (e1 > cur.bestE1rm) cur.bestE1rm = e1;
    map.set(w.exercise, cur);
  }

  const lines = [...map.entries()]
    .sort((a, b) => b[1].bestW - a[1].bestW)
    .map(([ex, r]) => {
      const d = `${r.bestWDate.slice(8)}.${r.bestWDate.slice(5, 7)}`;
      return `<b>${esc(ex)}</b>\n<code>${String(r.bestW).padStart(5)} кг  ${DOT}  ${d}  ${DOT}  e1RM ${Math.round(r.bestE1rm)}</code>`;
    });

  await ctx.reply(
    `🏆 <b>РЕКОРДЫ</b>\n${HR}\n\n${lines.join("\n\n")}\n\n` +
    `<i>e1RM — расчётный максимум на 1 раз (Эпли).</i>`,
    HTML
  );
});

// ── Разминка ─────────────────────────────────────────────────────────────
bot.callbackQuery(/^warm_(\d+(?:\.\d+)?)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(warmupText(parseFloat(ctx.match[1])), HTML);
});

// ── Напоминания ──────────────────────────────────────────────────────────
const REMIND_PRESETS: Record<string, { label: string; days: number[] }> = {
  mwf: { label: "Пн · Ср · Пт", days: [1, 3, 5] },
  tts: { label: "Вт · Чт · Сб", days: [2, 4, 6] },
  wkd: { label: "Пн – Пт", days: [1, 2, 3, 4, 5] },
  all: { label: "Каждый день", days: [0, 1, 2, 3, 4, 5, 6] },
};

bot.command("remind", async (ctx) => {
  resetSession(ctx.from!.id);
  const kb = new InlineKeyboard();
  for (const [key, p] of Object.entries(REMIND_PRESETS)) kb.text(p.label, `rem_${key}`).row();
  kb.text("🔕 Выключить напоминания", "rem_off");
  await ctx.reply(
    `⏰ <b>НАПОМИНАНИЯ О ТРЕНИРОВКАХ</b>\n${HR}\n\n` +
    `Выбери дни — пришлю напоминание, если в этот день ещё не было записи:`,
    { reply_markup: kb, ...HTML }
  );
});

bot.callbackQuery(/^rem_(.+)$/, async (ctx) => {
  const key = ctx.match[1];
  if (key === "off") {
    setReminder(ctx.from.id, null, null);
    await ctx.answerCallbackQuery("Выключено");
    await ctx.editMessageText(`🔕 <b>Напоминания выключены</b>`, HTML);
    return;
  }
  const preset = REMIND_PRESETS[key];
  if (!preset) return;
  const s = getSession(ctx.from.id);
  s.data.remDays = key;
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard();
  [7, 9, 12, 15, 17, 19].forEach((h, i) => {
    kb.text(`${h}:00`, `rh_${h}`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  await ctx.editMessageText(
    `⏰ <b>${preset.label}</b>\n\nВ котором часу напоминать? <i>(время Бангкока)</i>`,
    { reply_markup: kb, ...HTML }
  );
});

bot.callbackQuery(/^rh_(\d+)$/, async (ctx) => {
  const hour = parseInt(ctx.match[1]);
  const s = getSession(ctx.from.id);
  const preset = REMIND_PRESETS[String(s.data.remDays)];
  if (!preset) {
    await ctx.answerCallbackQuery("Начни заново: /remind");
    return;
  }
  setReminder(ctx.from.id, preset.days, hour);
  resetSession(ctx.from.id);
  await ctx.answerCallbackQuery("Готово");
  await ctx.editMessageText(
    `✅ <b>Напоминания включены</b>\n${HR}\n\n` +
    `📅 ${preset.label}\n🕐 ${hour}:00 (Бангкок)\n\n` +
    `<i>Если тренировка уже записана — напоминание не приходит. Выключить: /remind</i>`,
    HTML
  );
});

// ── Питание (КБЖУ) ───────────────────────────────────────────────────────
const GOAL_NUT_LABELS: Record<string, string> = {
  bulk: "Набор массы", cut: "Сушка / снижение жира", maint: "Поддержание",
};

function mealTodayBlock(userId: number, goal?: { kcal: number; proteinG: number }): string {
  const t = mealTotals(userId, today());
  if (t.count === 0) return "";
  const meals = getMeals(userId, today());
  const lines = meals.map((m) => `▪️ ${esc(m.name)}: ${m.kcal} ккал`).join("\n");
  let tail = "";
  if (goal) {
    const left = goal.kcal - t.kcal;
    tail = `\n<i>До цели: ${left > 0 ? `~${left} ккал осталось` : `+${-left} ккал сверх`}</i>`;
    const pLeft = goal.proteinG - t.proteinG;
    if (pLeft > 10) tail += ` · белка ещё ~${pLeft} г`;
  }
  return (
    `\n\n📸 <b>Съедено сегодня</b> (${t.count}):\n${lines}\n` +
    `<code>Итого  ${t.kcal} ккал  Б${t.proteinG} Ж${t.fatG} У${t.carbsG}</code>${tail}`
  );
}

function nutritionText(p: NutritionProfile, actualWeight?: number, userId?: number): string {
  const m = calcMacros(p, actualWeight);
  const w = actualWeight ?? p.weightKg;

  // Адаптивная корректировка по фактическому тренду веса (подход MacroFactor)
  let trendBlock = "";
  if (userId !== undefined) {
    const advice = weightTrendAdvice(getBodyweight(userId, 60), p.goal);
    if (advice) {
      const target = advice.kcalDelta !== 0 ? `\n<b>Новая цель: ${m.kcal + advice.kcalDelta} ккал/день</b>` : "";
      trendBlock = `\n\n📊 <b>По твоим взвешиваниям:</b>\n<i>${esc(advice.text)}</i>${target}`;
    }
  }

  const mealBlock = userId !== undefined ? mealTodayBlock(userId, { kcal: m.kcal, proteinG: m.proteinG }) : "";

  return (
    `🍗 <b>ПИТАНИЕ ${DOT} ${GOAL_NUT_LABELS[p.goal]}</b>\n${HR}\n\n` +
    `<i>Расчёт под вес ${w} кг (Миффлин – Сан-Жеор)</i>\n\n` +
    `🔥 <b>Калории: ${m.kcal} ккал/день</b>\n\n` +
    `<code>Белки     ${String(m.proteinG).padStart(4)} г   ${m.proteinG * 4} ккал</code>\n` +
    `<code>Жиры      ${String(m.fatG).padStart(4)} г   ${m.fatG * 9} ккал</code>\n` +
    `<code>Углеводы  ${String(m.carbsG).padStart(4)} г   ${m.carbsG * 4} ккал</code>\n\n` +
    `<code>Базовый обмен   ${m.bmr} ккал</code>\n` +
    `<code>Расход с учётом активности  ${m.tdee} ккал</code>` +
    mealBlock +
    trendBlock +
    `\n\n💡 <i>Белок раскидай на 3–5 приёмов. Сфотографируй еду — посчитаю КБЖУ автоматически (кнопка «📸 Еда»).</i>`
  );
}

bot.hears("🍗 Питание", async (ctx) => {
  const userId = ctx.from!.id;
  resetSession(userId);
  const u = getUser(userId);

  if (u?.nutrition) {
    const bw = getBodyweight(userId, 1);
    const actual = bw.length ? bw[bw.length - 1].weightKg : undefined;
    await ctx.reply(nutritionText(u.nutrition, actual, userId), {
      reply_markup: { inline_keyboard: [[{ text: "🔄 Заполнить заново", callback_data: "nut_restart" }]] },
      ...HTML,
    });
    return;
  }

  await ctx.reply(
    `🍗 <b>РАСЧЁТ ПИТАНИЯ</b>\n${HR}\n\n<b>Шаг 1/5 ${DOT} Цель:</b>`,
    {
      reply_markup: new InlineKeyboard()
        .text("📈 Набор массы", "ng_bulk").row()
        .text("🔥 Сушка / снижение жира", "ng_cut").row()
        .text("⚖️ Поддержание", "ng_maint"),
      ...HTML,
    }
  );
});

bot.callbackQuery("nut_restart", async (ctx) => {
  await ctx.answerCallbackQuery();
  resetSession(ctx.from.id);
  await ctx.reply(
    `🍗 <b>РАСЧЁТ ПИТАНИЯ</b>\n${HR}\n\n<b>Шаг 1/5 ${DOT} Цель:</b>`,
    {
      reply_markup: new InlineKeyboard()
        .text("📈 Набор массы", "ng_bulk").row()
        .text("🔥 Сушка / снижение жира", "ng_cut").row()
        .text("⚖️ Поддержание", "ng_maint"),
      ...HTML,
    }
  );
});

bot.callbackQuery(/^ng_(bulk|cut|maint)$/, async (ctx) => {
  const s = getSession(ctx.from.id);
  s.data.nutGoal = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `<b>Шаг 2/5 ${DOT} Активность:</b>`,
    {
      reply_markup: new InlineKeyboard()
        .text("🪑 1–3 тренировки/нед", "na_low").row()
        .text("🏃 3–5 тренировок/нед", "na_mid").row()
        .text("⚡ 6+ или физическая работа", "na_high"),
      ...HTML,
    }
  );
});

bot.callbackQuery(/^na_(low|mid|high)$/, async (ctx) => {
  const s = getSession(ctx.from.id);
  s.data.nutActivity = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `<b>Шаг 3/5 ${DOT} Пол:</b>`,
    {
      reply_markup: new InlineKeyboard().text("♂ Мужской", "ns_m").text("♀ Женский", "ns_f"),
      ...HTML,
    }
  );
});

function finishNutrition(userId: number, weightKg: number) {
  const s = getSession(userId);
  const profile: NutritionProfile = {
    sex: s.data.nutSex === "f" ? "f" : "m",
    age: Number(s.data.nutAge),
    heightCm: Number(s.data.nutHeight),
    weightKg,
    goal: (s.data.nutGoal as NutritionProfile["goal"]) ?? "maint",
    activity: (s.data.nutActivity as NutritionProfile["activity"]) ?? "mid",
  };
  setNutrition(userId, profile);
  resetSession(userId);
}

bot.callbackQuery(/^ns_(m|f)$/, async (ctx) => {
  const s = getSession(ctx.from.id);
  s.data.nutSex = ctx.match[1];
  s.state = "nut_age";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`<b>Шаг 4/5 ${DOT} Возраст</b>\n\n<i>Введи число, например:</i> <code>32</code>`, HTML);
});

// ── Авто-таймер отдыха ───────────────────────────────────────────────────
const restTimers = new Map<number, NodeJS.Timeout>();
let restCounter = 0;

async function maybeAutoRest(chatId: number, parsed: ParsedExercise[]) {
  // авто-таймер только при записи одиночного подхода — так логируют прямо в зале
  if (parsed.length !== 1 || parsed[0].groups.length !== 1 || parsed[0].groups[0].sets !== 1) return;
  const g = parsed[0].groups[0];
  const secs = g.reps <= 5 && g.weightKg > 0 ? 180 : 120;

  const tid = ++restCounter;
  const timer = setTimeout(async () => {
    restTimers.delete(tid);
    try {
      await bot.api.sendMessage(chatId, `⏱ <b>Отдых окончен — следующий подход!</b>`, { parse_mode: "HTML" });
    } catch { /* skip */ }
  }, secs * 1000);
  restTimers.set(tid, timer);

  try {
    await bot.api.sendMessage(
      chatId,
      `⏱ Авто-отдых: <b>${secs / 60} мин</b> — напомню.`,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "✖️ Стоп таймер", callback_data: `tstop_${tid}` }]] },
      }
    );
  } catch { /* skip */ }
}

bot.callbackQuery(/^tstop_(\d+)$/, async (ctx) => {
  const tid = parseInt(ctx.match[1]);
  const t = restTimers.get(tid);
  if (t) {
    clearTimeout(t);
    restTimers.delete(tid);
  }
  await ctx.answerCallbackQuery("Остановлен");
  try {
    await ctx.editMessageText(`⏱ <i>Таймер остановлен</i>`, HTML);
  } catch { /* skip */ }
});

// ── Таймер отдыха ────────────────────────────────────────────────────────
bot.callbackQuery(/^rest_(\d+)$/, async (ctx) => {
  const seconds = parseInt(ctx.match[1]);
  const chatId = ctx.chat?.id;
  const minutes = Math.round(seconds / 60);
  await ctx.answerCallbackQuery(`⏱ Таймер на ${minutes} мин запущен`);
  if (!chatId) return;
  setTimeout(async () => {
    try {
      await bot.api.sendMessage(chatId, `⏱ <b>Отдых окончен — следующий подход!</b>`, HTML);
    } catch { /* skip */ }
  }, seconds * 1000);
});

// ── Отмена записи ────────────────────────────────────────────────────────
bot.callbackQuery(/^undo_(\d+)$/, async (ctx) => {
  const undoId = parseInt(ctx.match[1]);
  const ids = undoStore.get(undoId);
  if (!ids) {
    await ctx.answerCallbackQuery("Уже нельзя отменить");
    return;
  }
  removeWorkouts(ids);
  undoStore.delete(undoId);
  await ctx.answerCallbackQuery("Запись удалена");
  await ctx.editMessageText(`↩️ <b>Запись отменена</b>`, HTML);
});

// ── Анализ еды по фото (Forkly / Zenetic) ───────────────────────────────────
bot.hears("📸 Еда", async (ctx) => {
  resetSession(ctx.from!.id);
  if (!mealVisionEnabled()) {
    await ctx.reply(
      `📸 <b>АНАЛИЗ ЕДЫ ПО ФОТО</b>\n${HR}\n\n` +
      `Нужен ключ на сервере (Railway → Variables → Redeploy):\n` +
      `• <code>GEMINI_API_KEY</code> — <a href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</a> (бесплатно)\n` +
      `• <code>OPENROUTER_API_KEY</code> — <a href="https://openrouter.ai/keys">openrouter.ai/keys</a> (бесплатно, без карты)`,
      { link_preview_options: { is_disabled: true }, ...HTML }
    );
    return;
  }
  const wk = weekKey(today());
  const u = getUser(ctx.from!.id);
  const used = u?.photoWeekKey === wk ? (u?.photoCount ?? 0) : 0;
  const left = isPremium(ctx.from!.id)
    ? "безлимит (Premium ✨)"
    : `${Math.max(0, 5 - used)} из 5 бесплатных на эту неделю`;
  await ctx.reply(
    `📸 <b>ЗАПИСЬ ЕДЫ</b>\n${HR}\n\n` +
    `• <b>Фото</b> — сфотографируй тарелку и отправь сюда\n` +
    `• <b>Текст</b> — напиши что съел:\n` +
    `<code>лосось 150 г, рис 200 г, салат</code>\n\n` +
    `<i>Осталось фото: ${left}. Точность ±15–25%.</i>\n\n` +
    `Безлимит фото: /premium`,
    { reply_markup: mainKeyboardFor(ctx.from!.id), ...HTML }
  );
  getSession(ctx.from!.id).state = "awaiting_meal_text";
});

bot.on("message:photo", async (ctx) => {
  await processMealPhoto(ctx);
});

// Фото, отправленное как «файл» (без сжатия) — тоже обрабатываем
bot.on("message:document", async (ctx) => {
  const mime = ctx.message.document.mime_type ?? "";
  if (!mime.startsWith("image/")) return;
  await processMealPhoto(ctx, ctx.message.document.file_id);
});

function mealGoalLine(userId: number): string {
  const day = mealTotals(userId, today());
  const u = getUser(userId);
  if (!u?.nutrition) return "";
  const bw = getBodyweight(userId, 1);
  const macros = calcMacros(u.nutrition, bw.at(-1)?.weightKg);
  const left = macros.kcal - day.kcal;
  return `\n<i>За день: ${day.kcal}/${macros.kcal} ккал` +
    (left > 0 ? ` · осталось ~${left}` : ` · +${-left} сверх цели`) + `</i>`;
}

function formatMealReply(meal: { name: string; kcal: number; proteinG: number; fatG: number; carbsG: number; note?: string }, goalLine: string) {
  return `✅ <b>${esc(meal.name)}</b>\n${HR}\n\n` +
    `<code>Ккал ${meal.kcal}  Б ${meal.proteinG}  Ж ${meal.fatG}  У ${meal.carbsG}</code>\n` +
    (meal.note ? `\n<i>${esc(meal.note)}</i>` : "") +
    goalLine;
}

function looksLikeMealText(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length < 4 || t.length > 200) return false;
  const foodWords = ["лосось", "рис", "салат", "куриц", "яйц", "овсян", "творог", "говядин", "рыба", "макарон", "греч", "авокадо", "salmon", "rice", "salad", "chicken", "egg", "beef", "fish", "pasta"];
  const hasFood = foodWords.some((w) => t.includes(w));
  const hasGrams = /\d+\s*(?:г|g|грам|gram)/i.test(t) || /\d{2,4}/.test(t);
  return hasFood && (hasGrams || t.includes(","));
}

async function processMealText(ctx: { from?: { id: number; first_name?: string }; chat: { id: number }; reply: (t: string, o?: object) => Promise<{ message_id: number }>; api: typeof bot.api }, text: string) {
  const userId = ctx.from!.id;
  registerUser(ctx.chat.id, ctx.from?.first_name ?? "");
  const status = await ctx.reply(`🔍 <i>Считаю…</i>`, HTML);
  try {
    const meal = await analyzeMealText(text);
    await saveMealFromAnalysis(userId, meal, false);
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      formatMealReply(meal, mealGoalLine(userId)),
      { parse_mode: "HTML" }
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      `⚠️ Не смог посчитать.\n\nПопробуй:\n<code>лосось 150 г, рис 200 г, салат</code>\n\n<i>${esc(errMsg.slice(0, 100))}</i>`,
      HTML
    );
    getSession(userId).state = "awaiting_meal_text";
  }
}

async function saveMealFromAnalysis(userId: number, meal: { name: string; kcal: number; proteinG: number; fatG: number; carbsG: number; note?: string }, countPhoto = true) {
  addMeal({
    userId,
    date: today(),
    name: meal.name,
    kcal: meal.kcal,
    proteinG: meal.proteinG,
    fatG: meal.fatG,
    carbsG: meal.carbsG,
  });
  if (countPhoto) bumpPhotoCount(userId, weekKey(today()));
}

async function processMealPhoto(
  ctx: { from?: { id: number; first_name?: string }; chat: { id: number }; reply: (t: string, o?: object) => Promise<{ message_id: number }>; api: typeof bot.api; message: { photo?: { file_id: string }[] } },
  fileIdOverride?: string
) {
  if (!mealVisionEnabled()) {
    await ctx.reply(
      `📸 <b>Анализ фото не подключён</b>\n\n` +
      `Добавь в Railway → Variables:\n` +
      `<code>GEMINI_API_KEY</code> — <a href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</a>\n` +
      `или <code>OPENROUTER_API_KEY</code> — <a href="https://openrouter.ai/keys">openrouter.ai/keys</a> (бесплатно)\n` +
      `и нажми <b>Redeploy</b>.`,
      { link_preview_options: { is_disabled: true }, ...HTML }
    );
    return;
  }

  const userId = ctx.from!.id;
  registerUser(ctx.chat.id, ctx.from?.first_name ?? "");
  resetSession(userId);
  const wk = weekKey(today());

  if (!canAnalyzePhoto(userId, wk)) {
    await ctx.reply(
      `📸 Лимит 5 фото-анализов в неделю исчерпан.\n\n` +
      `<i>Безлимит с Premium: /premium</i>`,
      HTML
    );
    return;
  }

  const status = await ctx.reply(`🔍 <i>Смотрю на тарелку…</i>`, HTML);
  try {
    let fileId = fileIdOverride;
    if (!fileId && ctx.message.photo?.length) {
      fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    }
    if (!fileId) {
      await ctx.api.editMessageText(ctx.chat.id, status.message_id, `⚠️ Не нашёл файл изображения.`, HTML);
      return;
    }

    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) throw new Error("no file_path from Telegram");
    const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
    const buf = await fetchImageBuffer(url);
    const mime = file.file_path.endsWith(".png") ? "image/png" : "image/jpeg";
    const meal = await analyzeMealPhoto(buf, mime);
    await saveMealFromAnalysis(userId, meal, true);

    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      formatMealReply(meal, mealGoalLine(userId)),
      { parse_mode: "HTML" }
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("meal photo error:", errMsg);
    let userMsg: string;
    if (errMsg.includes("OPENROUTER_API_KEY invalid") || errMsg.includes("Invalid character in header")) {
      userMsg = `⚠️ <b>Ключ OpenRouter вставлен неправильно.</b>\n\n` +
        `Railway → <code>OPENROUTER_API_KEY</code>:\n` +
        `1. Удали переменную полностью\n` +
        `2. Создай заново, вставь только:\n` +
        `<code>sk-or-v1-xxxxxxxx</code>\n` +
        `3. Без кавычек, без пробелов, без слова Bearer\n` +
        `4. Redeploy`;
    } else if (
      (errMsg.includes("openrouter 401") || errMsg.includes("openrouter 403")) &&
      !errMsg.includes("service_unavailable") &&
      !errMsg.includes("hf_fallback")
    ) {
      userMsg = `⚠️ <b>Ключ OpenRouter неверный.</b>\n\n` +
        `Создай новый на <a href="https://openrouter.ai/keys">openrouter.ai/keys</a> → Railway → <code>OPENROUTER_API_KEY</code> → Redeploy.`;
    } else if (errMsg.includes("groq 401") || errMsg.includes("groq 403")) {
      userMsg = `⚠️ <b>Ключ Groq неверный.</b>\n\n` +
        `Создай новый на <a href="https://console.groq.com">console.groq.com</a> → Railway → <code>GROQ_API_KEY</code> → Redeploy.`;
    } else if (
      errMsg.includes("gemini 400") ||
      errMsg.includes("gemini 401") ||
      errMsg.includes("gemini 403") ||
      errMsg.includes("API_KEY_INVALID") ||
      errMsg.includes("API key not valid")
    ) {
      userMsg = `⚠️ <b>Ключ Gemini не работает.</b>\n\n` +
        `Google отклоняет текущий ключ (скорее всего заблокирован после утечки).\n\n` +
        `1. <a href="https://aistudio.google.com/apikey">AI Studio</a> → удали старый ключ\n` +
        `2. <b>Создать ключ API</b> → кнопка <b>Ключ копирования</b>\n` +
        `3. Railway → Variables → <code>GEMINI_API_KEY</code> → вставь новый → Redeploy\n\n` +
        `<i>Не отправляй ключ в чат — Google блокирует утёкшие ключи.</i>\n\n` +
        `Альтернатива: <code>OPENROUTER_API_KEY</code> на <a href="https://openrouter.ai/keys">openrouter.ai/keys</a> (бесплатно).`;
    } else if (errMsg.includes("PERMISSION_DENIED") || errMsg.includes("403")) {
      userMsg = `⚠️ <b>Нет доступа к Gemini API.</b>\n\n` +
        `В AI Studio создай новый ключ (Create API key) и обнови в Railway.`;
    } else if (
      errMsg.includes("RESOURCE_EXHAUSTED") ||
      errMsg.includes("429") ||
      errMsg.includes("quota exhausted") ||
      errMsg.includes("service_unavailable") ||
      errMsg.includes("hf_fallback") ||
      errMsg.includes("hf caption") ||
      errMsg.includes("no content") ||
      errMsg.includes("blocked") ||
      errMsg.includes("openrouter failed") ||
      errMsg.includes("timeout")
    ) {
      getSession(userId).state = "awaiting_meal_text";
      userMsg =
        `⚠️ Фото сейчас не разобрать — нет рабочего AI-ключа на сервере.\n\n` +
        `<b>Напиши текстом</b> (работает сразу):\n` +
        `<code>лосось 150 г, рис 200 г, салат</code>\n\n` +
        `<i>Для фото: новый <code>GEMINI_API_KEY</code> в AI Studio или <code>OPENROUTER_API_KEY</code> на <a href="https://openrouter.ai/keys">openrouter.ai/keys</a> (бесплатно)</i>`;
    } else if (e instanceof MealPhotoUnreadableError || errMsg.includes("photo_unreadable:zero_macros") || errMsg.includes("hf_fallback_no_foods")) {
      getSession(userId).state = "awaiting_meal_text";
      userMsg =
        `⚠️ Не разобрал фото — плохо видно, размыто или не попала тарелка.\n\n` +
        `📸 <b>Пересними</b> сверху при хорошем свете и отправь снова.\n\n` +
        `Или, если удобнее, <b>опиши текстом</b>:\n` +
        `<code>лосось 150 г, рис 200 г, салат</code>`;
    } else if (errMsg.includes("GROQ_API_KEY not set") || errMsg.includes("OPENROUTER_API_KEY not set") || errMsg.includes("API_KEY")) {
      userMsg =
        `⚠️ <b>Нет рабочего ключа анализа еды.</b>\n\n` +
        `Добавь в Railway один из:\n` +
        `• <code>GEMINI_API_KEY</code> — <a href="https://aistudio.google.com/apikey">aistudio.google.com</a> (бесплатно)\n` +
        `• <code>OPENROUTER_API_KEY</code> — <a href="https://openrouter.ai/keys">openrouter.ai/keys</a> (бесплатно)`;
    } else {
      getSession(userId).state = "awaiting_meal_text";
      userMsg =
        `⚠️ Фото не разобрал.\n\n` +
        `<b>Напиши текстом:</b>\n` +
        `<code>лосось 150 г, рис 200 г, салат</code>`;
    }
    try {
      await ctx.api.editMessageText(ctx.chat.id, status.message_id, userMsg, HTML);
    } catch {
      await ctx.reply(userMsg, HTML);
    }
  }
}

// ── Premium (Telegram Stars) ───────────────────────────────────────────────
const PREMIUM_STARS = 250; // ~30 дней, оплата в Stars (XTR)

bot.command("premium", async (ctx) => {
  registerUser(ctx.chat.id, ctx.from?.first_name ?? "");
  const u = getUser(ctx.from!.id);
  if (isPremium(ctx.from!.id)) {
    await ctx.reply(
      `✨ <b>Premium активен</b> до <b>${u?.premiumUntil}</b>\n\n` +
      `Безлимитный анализ еды по фото включён.`,
      HTML
    );
    return;
  }
  await ctx.replyWithInvoice(
    "Strength Lab Premium",
    "30 дней: безлимитный анализ еды по фото + ранний доступ к новым фичам",
    `prem_${ctx.from!.id}_${Date.now()}`,
    "XTR",
    [{ label: "Premium 30 дней", amount: PREMIUM_STARS }],
    { provider_token: "" }
  );
});

bot.on("pre_checkout_query", async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("message:successful_payment", async (ctx) => {
  const pay = ctx.message.successful_payment;
  if (!pay || pay.currency !== "XTR") return;
  grantPremium(ctx.from!.id, 30);
  await ctx.reply(
    `✨ <b>Premium активирован на 30 дней!</b>\n\n` +
    `Теперь безлимитный анализ еды по фото. Спасибо за поддержку 💪`,
    { reply_markup: mainKeyboardFor(ctx.from!.id), ...HTML }
  );
});

// ── Голосовые сообщения → распознавание → лог ────────────────────────────
bot.on(["message:voice", "message:audio"], async (ctx) => {
  if (!voiceEnabled()) {
    await ctx.reply(
      `🎙 Голосовые пока не подключены.\n\n<i>Напиши тренировку текстом одной строкой:</i>\n<code>присед 100 5х5</code>`,
      HTML
    );
    return;
  }

  try {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
    const text = await transcribeVoice(url);

    if (!text) {
      await ctx.reply("🎙 Не расслышал. Попробуй ещё раз или напиши текстом.");
      return;
    }

    const parsed = parseWorkout(text);
    if (parsed.length === 0) {
      await ctx.reply(
        `🎙 Услышал: <i>«${esc(text)}»</i>\n\n` +
        `Не смог разобрать тренировку. Скажи в формате:\n<i>«Присед 100 килограмм 5 подходов по 5»</i>`,
        HTML
      );
      return;
    }

    const { html, undoId, maxW } = logParsed(ctx.from!.id, parsed);
    await ctx.reply(
      `🎙 <i>«${esc(text)}»</i>\n\n${html}`,
      { reply_markup: undoKeyboard(undoId, maxW), ...HTML }
    );
    await maybeAutoRest(ctx.chat.id, parsed);
  } catch (e) {
    console.error("voice error:", e);
    await ctx.reply("🎙 Ошибка распознавания. Напиши текстом: <code>присед 100 5х5</code>", HTML);
  }
});

// ── Обработка текстовых ответов (state machine) ───────────────────────────
bot.on("message:text", async (ctx) => {
  const userId = ctx.from!.id;
  const s = getSession(userId);
  const text = ctx.message.text.trim();

  if (text.startsWith("/") || MENU_BUTTONS.includes(text)) return;

  // ── Еда текстом (авто или после фото)
  if (s.state === "awaiting_meal_text" || looksLikeMealText(text)) {
    resetSession(userId);
    await processMealText(ctx, text);
    return;
  }

  // ── Custom exercise name
  if (s.state === "log_exercise_custom") {
    if (text.length > 40) {
      await ctx.reply(`⚠️ Слишком длинное название (макс. 40 символов). Сократи.`, HTML);
      return;
    }
    s.data.exercise = text;
    s.state = "log_sets";
    await ctx.reply(
      `✅ <b>${esc(text)}</b>\n${HR}\n\n` +
      `Введи нагрузку в формате\n<b>подходы × повторения × вес</b>\n\n<code>Например:  4×5×120</code>`,
      HTML
    );
    return;
  }

  // ── Log: нагрузка выбранного упражнения (любой формат, разные веса)
  if (s.state === "log_sets") {
    const groups = parseGroups(text);
    if (groups.length === 0) {
      await ctx.reply(
        `⚠️ Не понял формат. Примеры:\n\n` +
        `<code>4×5×120</code> — 4 подхода по 5 на 120 кг\n` +
        `<code>60х8, 80х5, 100х3</code> — разные веса\n` +
        `<code>4 подхода по 10 раз 30 кг</code> — словами`,
        HTML
      );
      return;
    }
    const exercise = String(s.data.exercise);
    resetSession(userId);
    const { html, undoId, maxW } = logParsed(userId, [{ exercise, groups }]);
    await ctx.reply(html, { reply_markup: undoKeyboard(undoId, maxW), ...HTML });
    await maybeAutoRest(ctx.chat.id, [{ exercise, groups }]);
    return;
  }

  // ── 1RM input
  if (s.state === "orm_input") {
    const nums = text.replace(/[×xхХ]/g, " ").split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length === 0 || nums[0] <= 0) {
      await ctx.reply(
        `⚠️ Не понял.\n\n<i>Расчёт:</i> <code>вес × повторения</code> (напр. 100×5)\n<i>Или известный 1RM:</i> <code>одно число</code> (напр. 140)`,
        HTML
      );
      return;
    }

    let oneRm: number;
    let sourceLine: string;
    let warning = "";

    if (nums.length === 1) {
      // Прямой ввод известного 1RM
      oneRm = Math.round(nums[0] * 10) / 10;
      sourceLine = `Введён известный максимум`;
    } else {
      const [weight, reps] = nums;
      oneRm = calcOneRm(weight, reps);
      sourceLine = `Расчёт из подхода <code>${weight} кг × ${reps}</code>`;
      if (reps >= 8) {
        warning =
          `\n\n⚠️ <i>${reps} повторений — это тест выносливости. Формула на многоповторке ` +
          `часто занижает реальный максимум. Для точности возьми подход на 3–5 повторений ` +
          `или введи известную одиночку одним числом.</i>`;
      }
    }

    const table = pctTable(oneRm);
    const rows = table
      .map((r) => `${String(r.pct).padStart(3)}%  ${String(r.weightKg).padStart(5)} кг  ×${r.reps}`)
      .join("\n");
    resetSession(userId);
    await ctx.reply(
      `🧮 <b>1RM${nums.length === 1 ? "" : " · РАСЧЁТ"}</b>\n${HR}\n\n` +
      `${sourceLine}\n\n` +
      `💪 <b>Максимум ${nums.length === 1 ? "" : "≈ "}${oneRm} кг</b>\n\n` +
      `<b>Таблица процентов:</b>\n<code>${rows}</code>` +
      warning,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
    return;
  }

  // ── Bodyweight input
  if (s.state === "bw_input") {
    const val = parseFloat(text.replace(",", "."));
    if (isNaN(val) || val < 30 || val > 300) {
      await ctx.reply(`⚠️ Введи корректный вес в кг.\n<i>Например:</i> <code>82.5</code>`, HTML);
      return;
    }
    addBodyweight(userId, val);
    const bw = getBodyweight(userId, 30);
    resetSession(userId);

    let deltaLine = "";
    if (bw.length >= 2) {
      const d = Math.round((bw[bw.length - 1].weightKg - bw[0].weightKg) * 10) / 10;
      const arrow = d > 0 ? `📈 +${d}` : d < 0 ? `📉 ${d}` : "➡️ 0";
      deltaLine = `\n<i>Динамика за период: ${arrow} кг</i>`;
    }

    await ctx.reply(
      `⚖️ <b>ВЕС ЗАПИСАН</b>\n${HR}\n\n<b>${val} кг</b>${deltaLine}`,
      { reply_markup: mainKeyboardFor(userId), ...HTML }
    );

    if (bw.length >= 2) {
      try {
        const buf = await fetchImageBuffer(bodyweightChartUrl(bw));
        await ctx.replyWithPhoto(new InputFile(buf, "bodyweight.png"));
      } catch { /* skip */ }
    }
    return;
  }

  // ── Program: ввод 1RM по каждому движению (число или вес×повторения)
  if (s.state === "prog_lift_rm" && s.lifts && s.liftNames && s.liftIdx !== undefined) {
    const nums = text.replace(",", ".").replace(/[×xхХ]/g, " ").split(/\s+/).map(Number).filter((n) => !isNaN(n) && n > 0);
    if (nums.length === 0) {
      await ctx.reply(
        `⚠️ Не понял.\n\n${DOT} Знаешь максимум: <code>120</code>\n${DOT} Не знаешь: рабочий подход <code>60×8</code>`,
        HTML
      );
      return;
    }

    let val: number;
    let calcNote = "";
    if (nums.length >= 2) {
      // вес × повторения → расчёт 1RM
      const [w, r] = nums;
      if (w < 10 || w > 500 || r < 1 || r > 30) {
        await ctx.reply(`⚠️ Странные числа. Пример: <code>60×8</code> (вес 60 кг, 8 повторений)`, HTML);
        return;
      }
      val = calcOneRm(w, r);
      calcNote = ` <i>(посчитал из ${w}×${r})</i>`;
    } else {
      val = Math.round(nums[0] * 10) / 10;
      if (val < 20 || val > 500) {
        await ctx.reply(`⚠️ Введи корректный вес в кг.\n<i>Например:</i> <code>120</code> или <code>60×8</code>`, HTML);
        return;
      }
    }

    s.lifts.push({ name: s.liftNames[s.liftIdx], oneRmKg: val });
    s.liftIdx += 1;

    // Ещё остались движения — спрашиваем следующее
    if (s.liftIdx < s.liftNames.length) {
      const total = s.liftNames.length;
      await ctx.reply(
        `✅ ${esc(s.lifts[s.liftIdx - 1].name)}: 1RM ${val} кг${calcNote}\n${HR}\n\n` +
        `<b>Движение ${s.liftIdx + 1}/${total} ${DOT} ${esc(s.liftNames[s.liftIdx])}</b>\n` +
        `<i>Максимум одним числом или подход</i> <code>вес×повторения</code>`,
        HTML
      );
      return;
    }

    // Все движения введены — генерируем программу
    const { model, goal, weeks } = s.data as { model: string; goal: Goal; weeks: number };
    const lifts = s.lifts;
    const result = buildProgram(model, { lifts, weeks, goal });
    const actualWeeks = result.weeks.length;

    saveProgram({
      userId,
      model, goal,
      oneRmKg: lifts[0].oneRmKg,
      lifts,
      weeks: actualWeeks,
      daysPerWeek: lifts.length,
      weeksData: result.weeks,
      peakWeek: result.peakWeek,
      deloadWeek: result.deloadWeek,
      currentWeek: 1,
      currentDay: 1,
      active: true,
    });

    const firstSession = result.weeks[0]?.sessions[0];
    const liftsLine = lifts.map((l) => `<code>${esc(l.name)} — ${l.oneRmKg} кг</code>`).join("\n");
    resetSession(userId);

    const goalLine = TEMPLATE_MODELS.has(model) ? "" : `<code>Цель    ${esc(GOAL_LABELS[goal] ?? goal)}</code>\n`;
    await ctx.reply(
      `✨ <b>ПРОГРАММА ГОТОВА</b>\n${HR}\n\n` +
      `<code>Модель  ${esc(MODEL_LABELS[model] ?? model)}</code>\n` +
      goalLine +
      `<code>Объём   ${actualWeeks} нед × ${lifts.length} дн</code>\n\n` +
      `<b>1RM по движениям:</b>\n${liftsLine}\n\n` +
      `${HR}\n<b>🚀 Первая тренировка</b>\n\n` +
      (firstSession ? formatSession(firstSession) : "") +
      `\n\n<i>Термины непонятны? «📋 Программа» → «❓ Как читать».</i>`,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
    return;
  }

  // ── Питание: возраст → рост → вес
  if (s.state === "nut_age") {
    const age = parseInt(text);
    if (isNaN(age) || age < 10 || age > 90) {
      await ctx.reply(`⚠️ Введи возраст числом, например <code>32</code>`, HTML);
      return;
    }
    s.data.nutAge = age;
    s.state = "nut_height";
    await ctx.reply(`<b>Шаг 5/5 ${DOT} Рост в см</b>\n\n<i>Например:</i> <code>180</code>`, HTML);
    return;
  }

  if (s.state === "nut_height") {
    const h = parseInt(text);
    if (isNaN(h) || h < 120 || h > 230) {
      await ctx.reply(`⚠️ Введи рост в сантиметрах, например <code>180</code>`, HTML);
      return;
    }
    s.data.nutHeight = h;

    // Вес берём из дневника, если он там есть
    const bw = getBodyweight(userId, 1);
    if (bw.length > 0) {
      finishNutrition(userId, bw[bw.length - 1].weightKg);
      const u = getUser(userId);
      if (u?.nutrition) {
        await ctx.reply(nutritionText(u.nutrition, bw[bw.length - 1].weightKg, userId), {
          reply_markup: mainKeyboardFor(userId), ...HTML,
        });
      }
      return;
    }

    s.state = "nut_weight";
    await ctx.reply(`<b>И последнее ${DOT} Вес в кг</b>\n\n<i>Например:</i> <code>82.5</code>`, HTML);
    return;
  }

  if (s.state === "nut_weight") {
    const w = parseFloat(text.replace(",", "."));
    if (isNaN(w) || w < 30 || w > 300) {
      await ctx.reply(`⚠️ Введи вес в кг, например <code>82.5</code>`, HTML);
      return;
    }
    finishNutrition(userId, w);
    const u = getUser(userId);
    if (u?.nutrition) {
      await ctx.reply(nutritionText(u.nutrition, w, userId), { reply_markup: mainKeyboardFor(userId), ...HTML });
    }
    return;
  }

  // ── Нет активного диалога — пробуем распознать тренировку свободным текстом
  const parsed = parseWorkout(text);
  if (parsed.length > 0) {
    const { html, undoId, maxW } = logParsed(userId, parsed);
    await ctx.reply(html, { reply_markup: undoKeyboard(undoId, maxW), ...HTML });
    await maybeAutoRest(ctx.chat.id, parsed);
    return;
  }

  if (userMode(userId) === "simple") {
    await ctx.reply(
      `Не понял 🤔\n\n` +
      `Хочешь записать тренировку — напиши, например:\n<code>присед 50 3х10</code>\n\n` +
      `<i>Или пользуйся кнопками внизу. Помощь — «❓ Помощь».</i>`,
      { reply_markup: SIMPLE_KEYBOARD, ...HTML }
    );
    return;
  }

  await ctx.reply(
    `Не понял 🤔\n\n` +
    `<b>Записать тренировку — просто напиши:</b>\n` +
    `<code>присед 100 5х5</code>\n` +
    `<code>жим 60х8, 80х5, 100х3</code>\n` +
    `<code>подтягивания 4х10</code>\n\n` +
    `<i>Несколько упражнений — с новой строки. Или голосовым 🎙\nОстальное — в меню ниже, справка /help</i>`,
    { reply_markup: MAIN_KEYBOARD, ...HTML }
  );
});

// ── Авто-сводка по воскресеньям (18:00 Бангкок) ───────────────────────────
cron.schedule("0 18 * * 0", async () => {
  for (const u of getUsers()) {
    try {
      if (u.mode === "simple") {
        const dates = getWorkoutDates(u.chatId);
        const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        const thisWeek = dates.filter((d) => d >= weekAgo).length;
        const streak = weekStreak(u.chatId);
        const msg = thisWeek > 0
          ? `📈 <b>Итог недели: ${thisWeek} тренировк${thisWeek === 1 ? "а" : thisWeek < 5 ? "и" : "ок"}</b> 💪\n` +
            (streak >= 2 ? `🔥 Серия: ${streak} недель подряд — так держать!` : `Продолжай в том же духе!`)
          : `На этой неделе тренировок не было. Ничего страшного — новая неделя, новый старт. Жми «🏋️ Тренировка на сегодня» 💪`;
        await bot.api.sendMessage(u.chatId, msg, HTML);
      } else {
        await bot.api.sendMessage(u.chatId, buildWeeklyReport(u.chatId), HTML);
      }
    } catch { /* пользователь заблокировал бота — пропускаем */ }
  }
}, { timezone: "Asia/Bangkok" });

// ── Напоминания о тренировках (каждый час, по расписанию юзера) ────────────
// Затухание (находка MyFitnessPal): если напоминания игнорируют — замолкаем,
// иначе бот отправляется в мут и пользователь потерян навсегда.
cron.schedule("0 * * * *", async () => {
  const { dow, hour } = bangkokNow();
  for (const u of getUsers()) {
    if (u.remindersPaused) continue;
    if (!u.reminderDays?.includes(dow) || u.reminderHour !== hour) continue;

    const dates = getWorkoutDates(u.chatId);
    // уже тренировался сегодня — не дёргаем, счётчик игноров сбрасываем
    if (dates.includes(today())) {
      if (u.remindersMissed) updateUser(u.chatId, { remindersMissed: 0 });
      continue;
    }

    // итог прошлого напоминания: была ли тренировка после него
    let missed = u.remindersMissed ?? 0;
    if (u.lastReminderDate && u.lastReminderDate < today()) {
      const trainedSince = dates.some((d) => d >= u.lastReminderDate!);
      missed = trainedSince ? 0 : missed + 1;
    }

    if (missed >= 3) {
      updateUser(u.chatId, { remindersPaused: true, remindersMissed: missed });
      try {
        await bot.api.sendMessage(
          u.chatId,
          `🔕 <b>Ставлю напоминания на паузу.</b>\n\n` +
          `Три подряд остались без тренировки — не хочу надоедать.\n` +
          `<i>Когда будешь готов вернуться — включи заново: /remind. Я тут.</i>`,
          { parse_mode: "HTML" }
        );
      } catch { /* пользователь заблокировал бота */ }
      continue;
    }

    try {
      await bot.api.sendMessage(
        u.chatId,
        `⏰ <b>Сегодня тренировка!</b>\n\n<i>После зала просто напиши сюда что сделал — например</i> <code>присед 100 5х5</code>`,
        { parse_mode: "HTML" }
      );
      updateUser(u.chatId, { lastReminderDate: today(), remindersMissed: missed });
    } catch { /* пользователь заблокировал бота */ }
  }
}, { timezone: "Asia/Bangkok" });

// ── Итоги челленджей (ежедневно 21:00 Бангкок) ─────────────────────────────
cron.schedule("0 21 * * *", async () => {
  for (const ch of getExpiredChallenges(today())) {
    finishChallenge(ch.id);
    const { fromCount, toCount } = challengeCounts(ch);

    const send = async (uid: number, mine: number, theirs: number, oppId: number) => {
      const opp = esc(nameOf(oppId));
      const verdict =
        mine > theirs ? `🏆 <b>ТЫ ПОБЕДИЛ!</b> Красавчик — так держать.` :
        mine < theirs ? `😤 <b>${opp} победил ${theirs}:${mine}.</b> Реванш? Жми «⚔️ Челлендж» и вызывай снова.` :
        `🤝 <b>Ничья ${mine}:${theirs}.</b> Достойно — оба молодцы.`;
      try {
        await bot.api.sendMessage(
          uid,
          `⚔️ <b>ЧЕЛЛЕНДЖ ЗАВЕРШЁН</b>\n${HR}\n\n` +
          `Итог: ты <b>${mine} : ${theirs}</b> ${opp}\n\n${verdict}`,
          { parse_mode: "HTML" }
        );
      } catch { /* пользователь заблокировал бота */ }
    };

    await send(ch.fromId, fromCount, toCount, ch.toId!);
    await send(ch.toId!, toCount, fromCount, ch.fromId);
  }
}, { timezone: "Asia/Bangkok" });

// ── Отказоустойчивость ─────────────────────────────────────────────────────
bot.catch((err) => {
  console.error("Handler error:", err.error);
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

// ── Start polling ─────────────────────────────────────────────────────────
async function main() {
  await bot.api.setMyCommands([
    { command: "start", description: "Главное меню" },
    { command: "mode", description: "Режим: простой / про" },
    { command: "remind", description: "Напоминания о тренировках" },
    { command: "premium", description: "Premium подписка (Stars)" },
    { command: "help", description: "Справка по функциям" },
  ]);
  await bot.start({
    onStart: () => {
      console.log("✅ Bot running…");
      console.log(`   Voice: ${voiceEnabled() ? "on" : "OFF (no GROQ_API_KEY)"}`);
      console.log(`   Meal photo: ${mealVisionEnabled() ? `on (${mealVisionProvider()})` : "OFF (no vision API key)"}`);
    },
  });
}

main();
