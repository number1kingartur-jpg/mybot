import "dotenv/config";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import https from "https";
import cron from "node-cron";
import {
  addWorkout, getWorkouts, getExercises,
  saveProgram, getActiveProgram, advanceProgramDay, deactivatePrograms,
  checkPr, addBodyweight, getBodyweight,
  registerUser, getUsers,
} from "./db";
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
  "📝 Записать тренировку", "📊 Прогресс",
  "📋 Программа", "🧮 1RM калькулятор",
  "⚖️ Вес тела", "📈 Отчёт недели",
];

// ── Keyboards ──────────────────────────────────────────────────────────────
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📝 Записать тренировку" }, { text: "📊 Прогресс" }],
    [{ text: "📋 Программа" }, { text: "🧮 1RM калькулятор" }],
    [{ text: "⚖️ Вес тела" }, { text: "📈 Отчёт недели" }],
  ],
  resize_keyboard: true,
};

const EXERCISE_KEYBOARD = new InlineKeyboard()
  .text("🦵 Присед", "ex_Присед").text("🏋️ Жим лёжа", "ex_Жим лёжа").row()
  .text("💀 Становая", "ex_Становая").text("🔺 ОХ жим", "ex_ОХ жим").row()
  .text("💪 Подтягивания", "ex_Подтягивания").text("🚣 Тяга", "ex_Тяга").row()
  .text("✏️ Другое упражнение", "ex_custom");

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
  return new Date().toISOString().slice(0, 10);
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

async function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
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
    `📝 <b>Запись тренировок</b> ${DOT} лог + детект рекордов\n` +
    `📊 <b>Прогресс</b> ${DOT} графики и PR\n` +
    `📋 <b>Программа</b> ${DOT} DUP, 5/3/1, GZCLP по неделям\n` +
    `🧮 <b>1RM</b> ${DOT} максимум и таблица %\n` +
    `⚖️ <b>Вес тела</b> ${DOT} динамика на графике\n` +
    `📈 <b>Отчёт недели</b> ${DOT} умный анализ прогресса\n\n` +
    `<i>Каждое воскресенье пришлю сводку автоматически 👇</i>`,
    { reply_markup: MAIN_KEYBOARD, ...HTML }
  );
});

// ── Запись тренировки ─────────────────────────────────────────────────────
bot.hears("📝 Записать тренировку", async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.state = null;
  s.data = {};
  await ctx.reply(
    `📝 <b>НОВАЯ ЗАПИСЬ</b>\n${HR}\n\n<i>Выбери упражнение:</i>`,
    { reply_markup: EXERCISE_KEYBOARD, ...HTML }
  );
});

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
    `✅ <b>${esc(raw)}</b>\n${HR}\n\n` +
    `Введи нагрузку в формате\n<b>подходы × повторения × вес</b>\n\n` +
    `<code>Например:  4×5×120</code>\n<code>или просто: 3 8 100</code>`,
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
  const bw = getBodyweight(1);
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
  await ctx.reply(buildWeeklyReport(), { reply_markup: MAIN_KEYBOARD, ...HTML });
});

// ── Прогресс ──────────────────────────────────────────────────────────────
bot.hears("📊 Прогресс", async (ctx) => {
  const exercises = getExercises();
  if (exercises.length === 0) {
    await ctx.reply(
      `📊 <b>ПРОГРЕСС</b>\n${HR}\n\n` +
      `Пока нет ни одной записи.\n<i>Начни с «📝 Записать тренировку»</i>`,
      HTML
    );
    return;
  }
  const s = getSession(ctx.from!.id);
  s.state = "progress_exercise";
  s.data = {};
  const kb = new InlineKeyboard();
  exercises.forEach((ex, i) => {
    kb.text(ex, `prg_${ex}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  await ctx.reply(
    `📊 <b>ПРОГРЕСС</b>\n${HR}\n\n<i>Выбери упражнение:</i>`,
    { reply_markup: kb, ...HTML }
  );
});

bot.callbackQuery(/^prg_(.+)$/, async (ctx) => {
  const exercise = ctx.match[1];
  await ctx.answerCallbackQuery();
  const entries = getWorkouts(exercise, 12);
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
  const prog = getActiveProgram();
  if (!prog) {
    const s = getSession(ctx.from!.id);
    s.state = "prog_model";
    s.data = {};
    await ctx.reply(
      `📋 <b>НОВАЯ ПРОГРАММА</b>\n${HR}\n\n` +
      `Активной программы нет — соберём с нуля.\n\n` +
      `<b>Шаг 1 ${DOT} Модель периодизации</b>`,
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
    .row()
    .text("🗑 Сбросить", "prog_reset");

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
  const prog = getActiveProgram();
  if (!prog) return;

  const weekData = prog.weeksData.find((w) => w.week === prog.currentWeek);
  const session = weekData?.sessions.find((s) => s.day === prog.currentDay);
  if (session) {
    addWorkout({
      date: today(),
      exercise: `Программа: ${session.focus}`,
      sets: session.sets,
      reps: session.reps,
      weightKg: session.weightKg,
      notes: `${prog.model} W${prog.currentWeek}D${prog.currentDay}`,
    });
  }

  const updated = advanceProgramDay();
  if (!updated || !updated.active) {
    await ctx.reply(
      `🏆 <b>ПРОГРАММА ЗАВЕРШЕНА</b>\n${HR}\n\nВесь цикл пройден. Красавчик!`,
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
      `✅ <b>Записано в дневник!</b>\n${HR}\n\n` +
      `${bar(doneDays, totalDays)}  ${pct}%\n` +
      `<b>Дальше</b> ${DOT} Неделя ${updated.currentWeek} ${DOT} День ${updated.currentDay}\n\n` +
      formatSession(nextSess),
      HTML
    );
  }
});

bot.callbackQuery("prog_skip", async (ctx) => {
  await ctx.answerCallbackQuery("⏭ Пропущено");
  advanceProgramDay();
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
  deactivatePrograms();
  await ctx.reply(
    `🗑 <b>Программа сброшена</b>\n${HR}\n\n<i>Открой «📋 Программа», чтобы собрать новую.</i>`,
    { reply_markup: MAIN_KEYBOARD, ...HTML }
  );
});

bot.callbackQuery("prog_full", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prog = getActiveProgram();
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
    `🏋️ <b>1RM по движениям</b>\n${HR}\n\n` +
    `Каждый день считается от своего максимума.\n\n` +
    `<b>Движение 1/${days} ${DOT} ${esc(s.liftNames[0])}</b>\n` +
    `<i>Введи 1RM в кг (вес на 1 раз):</i>\n\n<code>Например: 120</code>`,
    HTML
  );
});

// ── Обработка текстовых ответов (state machine) ───────────────────────────
bot.on("message:text", async (ctx) => {
  const userId = ctx.from!.id;
  const s = getSession(userId);
  const text = ctx.message.text.trim();

  if (text.startsWith("/") || MENU_BUTTONS.includes(text)) return;

  // ── Custom exercise name
  if (s.state === "log_exercise_custom") {
    s.data.exercise = text;
    s.state = "log_sets";
    await ctx.reply(
      `✅ <b>${esc(text)}</b>\n${HR}\n\n` +
      `Введи нагрузку в формате\n<b>подходы × повторения × вес</b>\n\n<code>Например:  4×5×120</code>`,
      HTML
    );
    return;
  }

  // ── Log: parse sets × reps × weight
  if (s.state === "log_sets") {
    const nums = text.replace(/[×xхХ]/g, " ").split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length < 3) {
      await ctx.reply(
        `⚠️ Не понял формат.\n\n<i>Нужно:</i> <code>подходы × повторения × вес</code>\n<i>Например:</i> <code>4×5×120</code>`,
        HTML
      );
      return;
    }
    const [sets, reps, weightKg] = nums;
    const exercise = String(s.data.exercise);

    const pr = checkPr(exercise, weightKg, reps);
    addWorkout({ date: today(), exercise, sets, reps, weightKg });
    resetSession(userId);

    let prBanner = "";
    if (pr.isWeightPr) {
      prBanner = `\n\n🏆 <b>НОВЫЙ РЕКОРД ВЕСА!</b>\n<i>Прошлый лучший: ${pr.prevBestWeight} кг → теперь ${weightKg} кг</i>`;
    } else if (pr.isE1rmPr) {
      prBanner = `\n\n🥇 <b>РЕКОРД ПО СИЛЕ!</b>\n<i>Расчётный 1RM: ${pr.prevBestE1rm} → ${pr.e1rm} кг</i>`;
    }

    await ctx.reply(
      `✅ <b>ЗАПИСАНО</b>\n${HR}\n\n` +
      `🎯 <b>${esc(exercise)}</b>\n` +
      `<code>${sets} × ${reps} @ ${weightKg} кг</code>\n` +
      `<code>≈ 1RM ${pr.e1rm} кг</code>` +
      prBanner,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
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
    addBodyweight(val);
    const bw = getBodyweight(30);
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

  // ── Program: ввод 1RM по каждому движению
  if (s.state === "prog_lift_rm" && s.lifts && s.liftNames && s.liftIdx !== undefined) {
    const val = parseFloat(text.replace(",", "."));
    if (isNaN(val) || val < 20 || val > 500) {
      await ctx.reply(`⚠️ Введи корректный 1RM в кг.\n<i>Например:</i> <code>120</code>`, HTML);
      return;
    }

    s.lifts.push({ name: s.liftNames[s.liftIdx], oneRmKg: val });
    s.liftIdx += 1;

    // Ещё остались движения — спрашиваем следующее
    if (s.liftIdx < s.liftNames.length) {
      const total = s.liftNames.length;
      await ctx.reply(
        `✅ ${esc(s.lifts[s.liftIdx - 1].name)}: ${val} кг\n${HR}\n\n` +
        `<b>Движение ${s.liftIdx + 1}/${total} ${DOT} ${esc(s.liftNames[s.liftIdx])}</b>\n` +
        `<i>Введи 1RM в кг:</i>`,
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
});

// ── Авто-сводка по воскресеньям (18:00 Бангкок) ───────────────────────────
cron.schedule("0 18 * * 0", async () => {
  const report = buildWeeklyReport();
  for (const u of getUsers()) {
    try {
      await bot.api.sendMessage(u.chatId, report, HTML);
    } catch { /* пользователь заблокировал бота — пропускаем */ }
  }
}, { timezone: "Asia/Bangkok" });

// ── Start polling ─────────────────────────────────────────────────────────
bot.start({
  onStart: () => console.log("✅ Bot running…"),
});
