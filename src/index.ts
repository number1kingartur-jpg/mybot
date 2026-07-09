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

// ── Keyboards ──────────────────────────────────────────────────────────────
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📝 Записать тренировку" }, { text: "📊 Прогресс" }],
    [{ text: "📋 Программа" }, { text: "🧮 1RM калькулятор" }],
  ],
  resize_keyboard: true,
};

const EXERCISE_KEYBOARD = new InlineKeyboard()
  .text("Присед", "ex_Присед").text("Жим лёжа", "ex_Жим лёжа").row()
  .text("Становая", "ex_Становая").text("ОХ жим", "ex_ОХ жим").row()
  .text("Подтягивания", "ex_Подтягивания").text("Тяга", "ex_Тяга").row()
  .text("✏️ Другое", "ex_custom");

function modelKeyboard() {
  return new InlineKeyboard()
    .text("DUP (ежедневная волна)", "pm_dup").row()
    .text("Линейная прогрессия", "pm_linear").row()
    .text("Волновая нагрузка", "pm_wave");
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

function formatSession(sess: { day: number; focus: string; intensity: number; sets: number; reps: number; weightKg: number; rpe: number }) {
  return `📌 *${sess.focus}*\n` +
    `Интенсивность: ${sess.intensity}%\n` +
    `${sess.sets} × ${sess.reps} повт. · *${sess.weightKg} кг* · RPE ${sess.rpe}`;
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
  await ctx.reply(
    "👋 Привет, Артур\\! Я твой личный тренировочный бот\\.\n\n" +
    "Выбери действие в меню:",
    { reply_markup: MAIN_KEYBOARD, parse_mode: "MarkdownV2" }
  );
});

// ── Запись тренировки ─────────────────────────────────────────────────────
bot.hears("📝 Записать тренировку", async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.state = null;
  s.data = {};
  await ctx.reply("Выбери упражнение:", { reply_markup: EXERCISE_KEYBOARD });
});

bot.callbackQuery(/^ex_(.+)$/, async (ctx) => {
  const raw = ctx.match[1];
  const s = getSession(ctx.from!.id);
  await ctx.answerCallbackQuery();

  if (raw === "custom") {
    s.state = "log_exercise_custom";
    await ctx.reply("Введи название упражнения:");
    return;
  }

  s.data.exercise = raw;
  s.state = "log_sets";
  await ctx.reply(
    `✅ *${raw}*\n\nВведи: подходы × повторения × вес\n_Пример: 4×5×120 или 3 8 100_`,
    { parse_mode: "Markdown" }
  );
});

// ── 1RM калькулятор ───────────────────────────────────────────────────────
bot.hears("🧮 1RM калькулятор", async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.state = "orm_input";
  s.data = {};
  await ctx.reply("Введи: вес × повторения\n_Пример: 100×5 или 90 8_", { parse_mode: "Markdown" });
});

// ── Прогресс ──────────────────────────────────────────────────────────────
bot.hears("📊 Прогресс", async (ctx) => {
  const exercises = getExercises();
  if (exercises.length === 0) {
    await ctx.reply("Пока нет записей. Сначала запиши тренировку 📝");
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
  await ctx.reply("Выбери упражнение:", { reply_markup: kb });
});

bot.callbackQuery(/^prg_(.+)$/, async (ctx) => {
  const exercise = ctx.match[1];
  await ctx.answerCallbackQuery();
  const entries = getWorkouts(exercise, 12);
  if (entries.length === 0) {
    await ctx.reply("Записей по этому упражнению нет.");
    return;
  }

  // Text summary
  const lines = entries.slice(-5).map(
    (e) => `📅 ${e.date}  —  ${e.sets}×${e.reps} · *${e.weightKg} кг*`
  ).join("\n");
  const maxWeight = Math.max(...entries.map((e) => e.weightKg));
  await ctx.reply(
    `*${exercise}* — последние записи:\n\n${lines}\n\n🏆 Лучший результат: *${maxWeight} кг*`,
    { parse_mode: "Markdown" }
  );

  // Chart
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
      "Активной программы нет. Создадим новую.\n\n" +
      "Введи свой *1RM* (вес в кг, с которым делаешь 1 повторение):\n_Пример: 120_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const weekData = prog.weeksData.find((w) => w.week === prog.currentWeek);
  const session = weekData?.sessions.find((s) => s.day === prog.currentDay);

  const kb = new InlineKeyboard()
    .text("✅ Выполнено", "prog_done")
    .text("⏭ Пропустить", "prog_skip")
    .row()
    .text("📄 Вся программа", "prog_full");

  if (!session) {
    await ctx.reply("🎉 Программа завершена! Создай новую.", { reply_markup: MAIN_KEYBOARD });
    return;
  }

  await ctx.reply(
    `📋 *${prog.model.toUpperCase()}* · ${prog.weeks} нед · ${prog.daysPerWeek} дн/нед\n` +
    `1RM: ${prog.oneRmKg} кг\n\n` +
    `*Неделя ${prog.currentWeek} · День ${prog.currentDay}*\n\n` +
    formatSession(session),
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

bot.callbackQuery("prog_done", async (ctx) => {
  await ctx.answerCallbackQuery("✅ Отмечено!");
  const prog = getActiveProgram();
  if (!prog) return;

  // Log it as a workout
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
    await ctx.reply("🏆 Программа завершена! Отличная работа!", { reply_markup: MAIN_KEYBOARD });
    return;
  }

  const nextWeek = updated.weeksData.find((w) => w.week === updated.currentWeek);
  const nextSess = nextWeek?.sessions.find((s) => s.day === updated.currentDay);
  if (nextSess) {
    await ctx.reply(
      `✅ Записано!\n\n*Следующая тренировка:*\n` +
      `Неделя ${updated.currentWeek} · День ${updated.currentDay}\n\n` +
      formatSession(nextSess),
      { parse_mode: "Markdown" }
    );
  }
});

bot.callbackQuery("prog_skip", async (ctx) => {
  await ctx.answerCallbackQuery("⏭ Пропущено");
  advanceProgramDay();
  await ctx.reply("День пропущен. Нажми «📋 Программа» для следующей тренировки.");
});

bot.callbackQuery("prog_full", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prog = getActiveProgram();
  if (!prog) return;

  const lines: string[] = [];
  for (const w of prog.weeksData) {
    const mark = w.week === prog.peakWeek ? " 🔥ПИК" : w.week === prog.deloadWeek ? " 💤РАЗГРУЗКА" : "";
    lines.push(`\n*Неделя ${w.week}${mark}*`);
    for (const s of w.sessions) {
      lines.push(`  День ${s.day}: ${s.focus} · ${s.intensity}% · ${s.sets}×${s.reps} · ${s.weightKg}кг · RPE${s.rpe}`);
    }
  }

  const chunks = [];
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
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }
});

// ── Callback: создание программы ─────────────────────────────────────────
bot.callbackQuery(/^pm_(.+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.model = ctx.match[1];
  s.state = "prog_goal";
  await ctx.answerCallbackQuery();
  await ctx.reply("Выбери цель:", { reply_markup: goalKeyboard() });
});

bot.callbackQuery(/^pg_(.+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.goal = ctx.match[1];
  s.state = "prog_weeks";
  await ctx.answerCallbackQuery();
  await ctx.reply("Количество недель:", { reply_markup: weeksKeyboard() });
});

bot.callbackQuery(/^pw_(\d+)$/, async (ctx) => {
  const s = getSession(ctx.from!.id);
  s.data.weeks = parseInt(ctx.match[1]);
  s.state = "prog_days";
  await ctx.answerCallbackQuery();
  await ctx.reply("Дней в неделю:", { reply_markup: daysKeyboard() });
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
    `✅ Программа создана!\n\n` +
    `*${model.toUpperCase()}* · ${weeks} нед · ${daysPerWeek} дн/нед\n` +
    `1RM: ${oneRm} кг\n\n` +
    `*Первая тренировка:*\n\n` +
    (firstSession ? formatSession(firstSession) : ""),
    { parse_mode: "Markdown" }
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
      `✅ *${text}*\n\nВведи: подходы × повторения × вес\n_Пример: 4×5×120 или 3 8 100_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ── Log: parse sets × reps × weight
  if (s.state === "log_sets") {
    const nums = text.replace(/[×xхХ]/g, " ").split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length < 3) {
      await ctx.reply("Не понял. Введи в формате: 4×5×120 (подходы × повторения × вес)");
      return;
    }
    const [sets, reps, weightKg] = nums;
    const exercise = String(s.data.exercise);
    addWorkout({ date: today(), exercise, sets, reps, weightKg });
    resetSession(userId);
    await ctx.reply(
      `✅ *Записано!*\n\n📌 ${exercise}\n${sets} × ${reps} повт. · *${weightKg} кг*`,
      { parse_mode: "Markdown", reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  // ── 1RM input
  if (s.state === "orm_input") {
    const nums = text.replace(/[×xхХ]/g, " ").split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length < 2) {
      await ctx.reply("Введи в формате: вес × повторения (пример: 100×5)");
      return;
    }
    const [weight, reps] = nums;
    const oneRm = calcOneRm(weight, reps);
    const table = pctTable(oneRm);
    const rows = table.map((r) => `${r.pct}%  —  ${r.weightKg} кг  ×  ${r.reps} повт.`).join("\n");
    resetSession(userId);
    await ctx.reply(
      `🧮 *1RM ≈ ${oneRm} кг*\n_(${weight} кг × ${reps} повт.)_\n\n` +
      `\`\`\`\n${rows}\n\`\`\``,
      { parse_mode: "Markdown", reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  // ── Program: 1RM
  if (s.state === "prog_1rm") {
    const val = parseFloat(text);
    if (isNaN(val) || val < 20) {
      await ctx.reply("Введи корректный вес (например: 120)");
      return;
    }
    s.data.oneRm = val;
    s.state = "prog_model";
    await ctx.reply("Выбери модель периодизации:", { reply_markup: modelKeyboard() });
    return;
  }
});

// ── Start polling ─────────────────────────────────────────────────────────
bot.start({
  onStart: () => console.log("✅ Bot running…"),
});
