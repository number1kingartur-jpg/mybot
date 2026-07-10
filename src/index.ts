import "dotenv/config";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import https from "https";
import cron from "node-cron";
import {
  addWorkout, getWorkouts, getAllWorkouts, getExercises, getWorkoutDates, removeWorkouts,
  saveProgram, getActiveProgram, advanceProgramDay, deactivatePrograms,
  checkPr, addBodyweight, getBodyweight,
  registerUser, getUsers, setReminder,
} from "./db";
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
  | "progress_exercise";

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
];

// ── Keyboards ──────────────────────────────────────────────────────────────
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📝 Записать тренировку" }, { text: "📔 Сегодня" }],
    [{ text: "📊 Прогресс" }, { text: "🏆 Рекорды" }],
    [{ text: "📋 Программа" }, { text: "🧮 1RM калькулятор" }],
    [{ text: "⚖️ Вес тела" }, { text: "📈 Отчёт недели" }],
  ],
  resize_keyboard: true,
};

const PRESET_EXERCISES = ["Присед", "Жим лёжа", "Становая", "ОХ жим", "Подтягивания", "Тяга"];
const EXERCISE_EMOJI: Record<string, string> = {
  "Присед": "🦵", "Жим лёжа": "🏋️", "Становая": "💀",
  "ОХ жим": "🔺", "Подтягивания": "💪", "Тяга": "🚣",
};

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

async function promptLoad(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, exercise: string) {
  await ctx.reply(
    `✅ <b>${esc(exercise)}</b>\n${HR}\n\n` +
    `Введи нагрузку — любой формат:\n\n` +
    `<code>4×5×120</code> — 4 подхода по 5 на 120 кг\n` +
    `<code>60х8, 80х5, 100х3</code> — разные веса\n` +
    `<code>4 подхода по 10 раз 30 кг</code> — словами`,
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
  while (weeks.has(cur)) {
    streak++;
    cur = shiftWeek(cur, -1);
  }
  return streak;
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
    `\n\n🟩 тренировка ${DOT} 🔲 сегодня`
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

// ── /start ────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  resetSession(ctx.from!.id);
  registerUser(ctx.chat.id, ctx.from?.first_name ?? "");
  await ctx.reply(
    `<b>💎 STRENGTH LAB</b>\n` +
    `<i>Твой личный тренировочный штаб</i>\n` +
    `${HR}\n\n` +
    `Привет, <b>${esc(ctx.from?.first_name ?? "атлет")}</b>. Всё для системной работы:\n\n` +
    `📝 <b>Запись тренировок</b> ${DOT} текстом или голосом 🎙\n` +
    `📊 <b>Прогресс</b> ${DOT} графики и PR\n` +
    `📋 <b>Программа</b> ${DOT} DUP, 5/3/1, GZCLP по неделям\n` +
    `🧮 <b>1RM</b> ${DOT} максимум и таблица %\n` +
    `⚖️ <b>Вес тела</b> ${DOT} динамика на графике\n` +
    `📈 <b>Отчёт недели</b> ${DOT} умный анализ прогресса\n\n` +
    `<i>Каждое воскресенье пришлю сводку автоматически.</i>`,
    {
      reply_markup: { inline_keyboard: [[{ text: "🎓 Я новичок — с чего начать?", callback_data: "guide_start" }]] },
      ...HTML,
    }
  );
  await ctx.reply(`Меню внизу 👇`, { reply_markup: MAIN_KEYBOARD });
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
    `📊 <b>Прогресс</b>\nИстория, рекорд и график по каждому упражнению. Внутри — календарь месяца: видно, в какие дни тренировался.\n\n` +
    `🏆 <b>Рекорды</b>\nЛучший вес и расчётный максимум по всем упражнениям на одном экране.\n\n` +
    `⏱ <b>Таймер отдыха и 🧊 разминка</b>\nПод каждой записью — таймер 2/3/4 мин и разминочные подходы с раскладкой блинов.\n\n` +
    `⏰ <b>Напоминания</b> — /remind\nВыбери дни и час — бот напомнит о тренировке, если её ещё нет в дневнике.\n\n` +
    `📋 <b>Программа</b>\nГотовый план на недели: DUP, 5/3/1, GZCLP и другие. Вводишь 1RM по каждому движению — получаешь расписание с весами. Отмечай «Выполнено» — бот ведёт по циклу и логирует за тебя.\n\n` +
    `🧮 <b>1RM калькулятор</b>\n<code>100×5</code> — расчёт максимума, или одно число <code>140</code> — таблица % от известной одиночки.\n\n` +
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
  await promptLoad(ctx, exercise);
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
  await promptLoad(ctx, exercise);
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
  await ctx.reply(
    `📊 <b>ПРОГРЕСС</b>\n${HR}\n\n<i>Выбери упражнение:</i>`,
    { reply_markup: kb, ...HTML }
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
      { reply_markup: MAIN_KEYBOARD, ...HTML }
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

  // ── Нет активного диалога — пробуем распознать тренировку свободным текстом
  const parsed = parseWorkout(text);
  if (parsed.length > 0) {
    const { html, undoId, maxW } = logParsed(userId, parsed);
    await ctx.reply(html, { reply_markup: undoKeyboard(undoId, maxW), ...HTML });
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
      await bot.api.sendMessage(u.chatId, buildWeeklyReport(u.chatId), HTML);
    } catch { /* пользователь заблокировал бота — пропускаем */ }
  }
}, { timezone: "Asia/Bangkok" });

// ── Напоминания о тренировках (каждый час, по расписанию юзера) ────────────
cron.schedule("0 * * * *", async () => {
  const { dow, hour } = bangkokNow();
  for (const u of getUsers()) {
    if (!u.reminderDays?.includes(dow) || u.reminderHour !== hour) continue;
    // уже тренировался сегодня — не дёргаем
    if (getWorkoutDates(u.chatId).includes(today())) continue;
    try {
      await bot.api.sendMessage(
        u.chatId,
        `⏰ <b>Сегодня тренировка!</b>\n\n<i>После зала просто напиши сюда что сделал — например</i> <code>присед 100 5х5</code>`,
        { parse_mode: "HTML" }
      );
    } catch { /* пользователь заблокировал бота */ }
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
    { command: "remind", description: "Напоминания о тренировках" },
    { command: "help", description: "Справка по функциям" },
  ]);
  await bot.start({
    onStart: () => console.log("✅ Bot running…"),
  });
}

main();
