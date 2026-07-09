import "dotenv/config";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import https from "https";
import {
  addWorkout, getWorkouts, getExercises,
  saveProgram, getActiveProgram, advanceProgramDay,
} from "./db";
import { calcOneRm, pctTable } from "./calc/orm";
import { calculatePeriodization, type PeriodizationModel, type Goal } from "./calc/periodization";
import { progressChartUrl } from "./chart";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error("BOT_TOKEN not set in .env");

const bot = new Bot(TOKEN);

// ── Session state ──────────────────────────────────────────────────────────
type State =
  | null
  | "log_exercise_custom"
  | "log_sets"
  | "orm_input"
  | "prog_1rm"
  | "prog_model"
  | "prog_goal"
  | "prog_weeks"
  | "prog_days"
  | "prog_confirm"
  | "progress_exercise";

interface UserState {
  state: State;
  data: Record<string, string | number>;
}
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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** ▰▰▰▱▱ прогресс-бар */
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
};

// ── Keyboards ──────────────────────────────────────────────────────────────
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📝 Записать тренировку" }, { text: "📊 Прогресс" }],
    [{ text: "📋 Программа" }, { text: "🧮 1RM калькулятор" }],
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
    .text("〰️ Волновая нагрузка", "pm_wave");
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

interface Sess {
  day: number; focus: string; intensity: number;
  sets: number; reps: number; weightKg: number; rpe: number;
}

/** Красивая карточка тренировочной сессии */
function formatSession(sess: Sess): string {
  return (
    `🎯 <b>${esc(sess.focus)}</b>\n` +
    `<code>Нагрузка   ${sess.sets} × ${sess.reps} @ ${sess.weightKg} кг</code>\n` +
    `<code>Интенсивн. ${sess.intensity}% 1RM</code>\n` +
    `<code>Усилие     RPE ${sess.rpe}</code>`
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

const HTML = { parse_mode: "HTML" as const };

// ── /start ────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.reply(
    `<b>💎 STRENGTH LAB</b>\n` +
    `<i>Твой личный тренировочный штаб</i>\n` +
    `${HR}\n\n` +
    `Привет, <b>Артур</b>. Здесь всё для системной работы:\n\n` +
    `📝 <b>Запись тренировок</b> ${DOT} лог сетов и весов\n` +
    `📊 <b>Прогресс</b> ${DOT} графики и рекорды\n` +
    `📋 <b>Программа</b> ${DOT} периодизация по неделям\n` +
    `🧮 <b>1RM</b> ${DOT} расчёт максимума и %\n\n` +
    `<i>Выбери действие в меню ниже 👇</i>`,
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
    await ctx.reply(
      `✏️ <b>Своё упражнение</b>\n${HR}\n\n<i>Введи название:</i>`,
      HTML
    );
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
    `Введи рабочий подход в формате\n<b>вес × повторения</b>\n\n` +
    `<code>Например:  100×5</code>\n<code>или просто: 90 8</code>`,
    HTML
  );
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
      const url = progressChartUrl(entries);
      const buf = await fetchImageBuffer(url);
      await ctx.replyWithPhoto(new InputFile(buf, "progress.png"));
    } catch {
      // Chart fetch failed — skip
    }
  }
});

// ── Программа ────────────────────────────────────────────────────────────
bot.hears("📋 Программа", async (ctx) => {
  const prog = getActiveProgram();
  if (!prog) {
    const s = getSession(ctx.from!.id);
    s.state = "prog_1rm";
    s.data = {};
    await ctx.reply(
      `📋 <b>НОВАЯ ПРОГРАММА</b>\n${HR}\n\n` +
      `Активной программы нет — соберём с нуля.\n\n` +
      `Введи свой <b>1RM</b> <i>(вес на 1 повторение)</i>:\n\n` +
      `<code>Например: 120</code>`,
      HTML
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
    .text("📄 Вся программа", "prog_full");

  const totalDays = prog.weeks * prog.daysPerWeek;
  const doneDays = (prog.currentWeek - 1) * prog.daysPerWeek + (prog.currentDay - 1);
  const pct = Math.round((doneDays / totalDays) * 100);
  const phaseTag =
    prog.currentWeek === prog.peakWeek ? "  🔥 <b>ПИК</b>" :
    prog.currentWeek === prog.deloadWeek ? "  💤 <b>РАЗГРУЗКА</b>" : "";

  await ctx.reply(
    `📋 <b>${esc(MODEL_LABELS[prog.model] ?? prog.model)}</b>\n` +
    `<i>${GOAL_LABELS[prog.goal] ?? prog.goal} ${DOT} 1RM ${prog.oneRmKg} кг</i>\n` +
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

bot.callbackQuery("prog_full", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prog = getActiveProgram();
  if (!prog) return;

  const lines: string[] = [
    `📄 <b>ПОЛНАЯ ПРОГРАММА</b>`,
    `<i>${esc(MODEL_LABELS[prog.model] ?? prog.model)} ${DOT} ${prog.weeks} нед ${DOT} 1RM ${prog.oneRmKg} кг</i>`,
    HR,
  ];
  for (const w of prog.weeksData) {
    const mark =
      w.week === prog.peakWeek ? "  🔥 ПИК" :
      w.week === prog.deloadWeek ? "  💤 РАЗГРУЗКА" : "";
    lines.push(`\n<b>◆ Неделя ${w.week}</b>${mark}`);
    for (const s of w.sessions) {
      lines.push(
        `<code>Д${s.day} ${esc(s.focus).padEnd(12)} ${s.sets}×${s.reps} @ ${s.weightKg}кг RPE${s.rpe}</code>`
      );
    }
  }

  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if ((cur + line + "\n").length > 3800) {
      chunks.push(cur);
      cur = line + "\n";
    } else {
      cur += line + "\n";
    }
  }
  if (cur) chunks.push(cur);

  for (const chunk of chunks) {
    await ctx.reply(chunk, HTML);
  }
});

// ── Callback: создание программы ─────────────────────────────────────────
bot.callbackQuery(/^pm_(.+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.model = ctx.match[1];
  s.state = "prog_goal";
  await ctx.answerCallbackQuery();
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
  s.data.daysPerWeek = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const { model, goal, weeks, daysPerWeek, oneRm } = s.data as {
    model: PeriodizationModel; goal: Goal; weeks: number; daysPerWeek: number; oneRm: number;
  };

  const result = calculatePeriodization({ oneRmKg: oneRm, weeks, daysPerWeek, model, goal });

  saveProgram({
    model, goal,
    oneRmKg: oneRm,
    weeks,
    daysPerWeek,
    weeksData: result.weeks,
    peakWeek: result.peakWeek,
    deloadWeek: result.deloadWeek,
    currentWeek: 1,
    currentDay: 1,
    active: true,
  });

  const firstSession = result.weeks[0]?.sessions[0];
  resetSession(ctx.from!.id);

  await ctx.reply(
    `✨ <b>ПРОГРАММА ГОТОВА</b>\n${HR}\n\n` +
    `<code>Модель     ${esc(MODEL_LABELS[model] ?? model)}</code>\n` +
    `<code>Цель       ${esc(GOAL_LABELS[goal] ?? goal)}</code>\n` +
    `<code>Объём      ${weeks} нед × ${daysPerWeek} дн</code>\n` +
    `<code>База 1RM   ${oneRm} кг</code>\n\n` +
    `${HR}\n<b>🚀 Первая тренировка</b>\n\n` +
    (firstSession ? formatSession(firstSession) : ""),
    { reply_markup: MAIN_KEYBOARD, ...HTML }
  );
});

// ── Обработка текстовых ответов (state machine) ───────────────────────────
bot.on("message:text", async (ctx) => {
  const userId = ctx.from!.id;
  const s = getSession(userId);
  const text = ctx.message.text.trim();

  if (text.startsWith("/") || ["📝 Записать тренировку", "📊 Прогресс", "📋 Программа", "🧮 1RM калькулятор"].includes(text)) {
    return;
  }

  // ── Custom exercise name
  if (s.state === "log_exercise_custom") {
    s.data.exercise = text;
    s.state = "log_sets";
    await ctx.reply(
      `✅ <b>${esc(text)}</b>\n${HR}\n\n` +
      `Введи нагрузку в формате\n<b>подходы × повторения × вес</b>\n\n` +
      `<code>Например:  4×5×120</code>`,
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
    addWorkout({ date: today(), exercise, sets, reps, weightKg });
    resetSession(userId);

    const est1rm = calcOneRm(weightKg, reps);
    await ctx.reply(
      `✅ <b>ЗАПИСАНО</b>\n${HR}\n\n` +
      `🎯 <b>${esc(exercise)}</b>\n` +
      `<code>${sets} × ${reps} @ ${weightKg} кг</code>\n` +
      `<code>≈ 1RM ${est1rm} кг</code>`,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
    return;
  }

  // ── 1RM input
  if (s.state === "orm_input") {
    const nums = text.replace(/[×xхХ]/g, " ").split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length < 2) {
      await ctx.reply(
        `⚠️ Не понял формат.\n\n<i>Нужно:</i> <code>вес × повторения</code>\n<i>Например:</i> <code>100×5</code>`,
        HTML
      );
      return;
    }
    const [weight, reps] = nums;
    const oneRm = calcOneRm(weight, reps);
    const table = pctTable(oneRm);
    const rows = table
      .map((r) => `${String(r.pct).padStart(3)}%  ${String(r.weightKg).padStart(5)} кг  ×${r.reps}`)
      .join("\n");
    resetSession(userId);
    await ctx.reply(
      `🧮 <b>РАСЧЁТ 1RM</b>\n${HR}\n\n` +
      `Из подхода <code>${weight} кг × ${reps}</code>\n\n` +
      `💪 <b>Твой максимум ≈ ${oneRm} кг</b>\n\n` +
      `<b>Таблица процентов:</b>\n<code>${rows}</code>`,
      { reply_markup: MAIN_KEYBOARD, ...HTML }
    );
    return;
  }

  // ── Program: 1RM
  if (s.state === "prog_1rm") {
    const val = parseFloat(text);
    if (isNaN(val) || val < 20) {
      await ctx.reply(
        `⚠️ Введи корректный вес.\n<i>Например:</i> <code>120</code>`,
        HTML
      );
      return;
    }
    s.data.oneRm = val;
    s.state = "prog_model";
    await ctx.reply(
      `🌊 <b>Шаг 1/4 ${DOT} Модель</b>\n${HR}\n\n<i>Выбери схему периодизации:</i>`,
      { reply_markup: modelKeyboard(), ...HTML }
    );
    return;
  }
});

// ── Start polling ─────────────────────────────────────────────────────────
bot.start({
  onStart: () => console.log("✅ Bot running…"),
});
