/**
 * Бот: бесплатный «Старт 3 дня» (?start=restart_3d).
 */
import { Bot, InlineKeyboard, type Context } from "grammy";
import { getUser, getUsers, registerUser, updateUser, type UserRecord } from "./db";
import {
  RESTART_FREE_DAYS,
  paidRestartOffer,
  restartDayPlan,
} from "./restart-program";
import { getBrandLinks } from "./channel/brand";

const HR = "━━━━━━━━━━━━━━━━━━━━";

function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function isRestartPayload(payload: string): boolean {
  return payload === "restart" || payload === "restart_3d" || payload === "restart3d";
}

export function restartProgress(u: UserRecord | undefined): {
  active: boolean;
  done: number;
  currentDay: number;
  canDoToday: boolean;
} {
  if (!u?.restartActive) {
    return { active: false, done: 0, currentDay: 1, canDoToday: false };
  }
  const done = u.restartDoneDays ?? 0;
  const currentDay = Math.min(done + 1, RESTART_FREE_DAYS);
  const last = u.restartLastDoneDate;
  const t = todayBangkok();
  const canDoToday = done < RESTART_FREE_DAYS && last !== t;
  return { active: true, done, currentDay, canDoToday };
}

function buildDayMessage(u: UserRecord, day: number): string {
  const plan = restartDayPlan(day);
  if (!plan) return "План не найден.";
  const tasks = plan.tasks
    .map((t) => `• <b>${esc(t.label)}</b> — ${esc(t.detail)}`)
    .join("\n");
  return (
    `🌱 <b>СТАРТ · ${esc(plan.title)}</b>\n${HR}\n\n` +
    `${esc(plan.intro)}\n\n` +
    `<b>Движение (~15 мин)</b>\n${plan.workout}\n\n` +
    `<b>Еще сегодня</b>\n${tasks}\n\n` +
    `<i>Не идеально. Сделано.</i>`
  );
}

function finishMessage(): string {
  const offer = paidRestartOffer();
  return (
    `🌱 <b>Три дня закрыты</b>\n${HR}\n\n` +
    `Ты три раза подряд держал слово. Это не форма за три дня. Это доказательство, что можешь не слиться на старте.\n\n` +
    `<b>Дальше</b> — ${esc(offer.line)}\n\n` +
    `<i>Бесплатный мини-курс закончен. Платный «30 дней» — каждый день задание, я на связи, люди идут рядом.</i>`
  );
}

function finishKeyboard(): InlineKeyboard {
  const offer = paidRestartOffer();
  const kb = new InlineKeyboard();
  if (offer.url.startsWith("http")) {
    kb.url(`➡️ ${offer.label}`, offer.url).row();
  }
  const { dmUrl } = getBrandLinks();
  kb.url("💬 Вопрос / СТАРТ30", dmUrl);
  return kb;
}

export function restartKeyboard(canDone: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (canDone) kb.text("✅ Сделал сегодня", "restart_done").row();
  kb.text("📋 Текущий день", "restart_today");
  return kb;
}

export async function beginRestart(ctx: Context, firstName: string): Promise<void> {
  const userId = ctx.from!.id;
  registerUser(userId, firstName);
  const u = getUser(userId);
  const prog = restartProgress(u);

  if (prog.active && prog.done >= RESTART_FREE_DAYS) {
    await ctx.reply(finishMessage(), {
      parse_mode: "HTML",
      reply_markup: finishKeyboard(),
    });
    return;
  }

  updateUser(userId, {
    restartActive: true,
    restartStarted: u?.restartStarted ?? todayBangkok(),
    ref: u?.ref ?? "restart_3d",
    mode: "simple",
    simplePlace: "home",
    simpleLevel: "start",
    simpleIdx: 0,
  });

  const after = restartProgress(getUser(userId));
  const day = after.currentDay;
  await ctx.reply(
    `🌱 <b>Старт · 3 дня</b>\n${HR}\n\n` +
      `Привет, <b>${esc(firstName)}</b>. Без зала, без «с понедельника». ` +
      `Каждый день одно короткое задание. Отметил «сделал» — идешь дальше.\n\n` +
      `<i>Пропустил день — не начинай с нуля. Просто открой /restart и продолжи.</i>`,
    { parse_mode: "HTML" }
  );
  await ctx.reply(buildDayMessage(getUser(userId)!, day), {
    parse_mode: "HTML",
    reply_markup: restartKeyboard(after.canDoToday),
  });
}

export async function sendRestartToday(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  registerUser(userId, ctx.from?.first_name ?? "");
  const prog = restartProgress(getUser(userId));

  if (!prog.active) {
    await ctx.reply(
      `🌱 Программа «Старт 3 дня» еще не начата.\n\nЖми /start или ссылку из канала.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🌱 Начать 3 дня", "restart_begin"),
      }
    );
    return;
  }

  if (prog.done >= RESTART_FREE_DAYS) {
    await ctx.reply(finishMessage(), {
      parse_mode: "HTML",
      reply_markup: finishKeyboard(),
    });
    return;
  }

  const u = getUser(userId)!;
  await ctx.reply(buildDayMessage(u, prog.currentDay), {
    parse_mode: "HTML",
    reply_markup: restartKeyboard(prog.canDoToday),
  });
}

export async function markRestartDone(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  const u = getUser(userId);
  const prog = restartProgress(u);

  if (!prog.active || !prog.canDoToday) {
    await ctx.answerCallbackQuery({
      text: prog.done >= RESTART_FREE_DAYS ? "Уже все 3 дня закрыты" : "Сегодня уже отмечено",
      show_alert: true,
    });
    return;
  }

  const t = todayBangkok();
  const newDone = (u?.restartDoneDays ?? 0) + 1;
  updateUser(userId, {
    restartDoneDays: newDone,
    restartLastDoneDate: t,
  });

  await ctx.answerCallbackQuery({ text: `День ${newDone} закрыт ✓` });

  if (newDone >= RESTART_FREE_DAYS) {
    await ctx.reply(finishMessage(), {
      parse_mode: "HTML",
      reply_markup: finishKeyboard(),
    });
    return;
  }

  const nextDay = newDone + 1;
  await ctx.reply(
    `✅ <b>День ${newDone} в копилке.</b>\n\n` +
      `Завтра откроется день ${nextDay}. Напомню утром или жми «Текущий день».\n\n` +
      `<i>Один пропуск не конец. Два подряд — уже привычка. Не делай два.</i>`,
    { parse_mode: "HTML" }
  );
}

export function usersForRestartReminder(): UserRecord[] {
  const t = todayBangkok();
  return getUsers().filter((u) => {
    if (!u.restartActive) return false;
    const done = u.restartDoneDays ?? 0;
    if (done >= RESTART_FREE_DAYS) return false;
    if (!u.restartLastDoneDate) return false;
    return u.restartLastDoneDate < t;
  });
}

export function buildRestartReminderText(u: UserRecord): string {
  const prog = restartProgress(u);
  const plan = restartDayPlan(prog.currentDay);
  const title = plan?.title ?? `день ${prog.currentDay}`;
  return (
    `🌱 <b>Старт · ${esc(title)}</b>\n\n` +
    `Вчера ты отметил прогресс. Сегодня следующий шаг — 15 минут, дома.\n\n` +
    `<i>/restart — открыть задание</i>`
  );
}

type RestartHooks = {
  sendAppWelcome?: (ctx: Context, name: string) => Promise<void>;
  appOnly: boolean;
};

export function registerRestartBot(bot: Bot, hooks: RestartHooks): void {
  bot.command("restart", async (ctx) => {
    await sendRestartToday(ctx);
  });

  bot.callbackQuery("restart_begin", async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginRestart(ctx, ctx.from.first_name ?? "друг");
  });

  bot.callbackQuery("restart_today", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendRestartToday(ctx);
  });

  bot.callbackQuery("restart_done", async (ctx) => {
    await markRestartDone(ctx);
  });
}

export async function handleRestartStartPayload(
  ctx: Context,
  payload: string,
  hooks: RestartHooks
): Promise<boolean> {
  if (!isRestartPayload(payload)) return false;
  await beginRestart(ctx, ctx.from?.first_name ?? "друг");
  if (hooks.appOnly && hooks.sendAppWelcome) {
    await hooks.sendAppWelcome(ctx, ctx.from?.first_name ?? "друг");
  }
  return true;
}
