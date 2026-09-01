// ── Напоминания о тренировках (/remind) ──────────────────────────────────────
// Перенесено из index.ts без изменения поведения. Фоновая cron-рассылка
// напоминаний осталась в index.ts — она завязана на общий список пользователей
// и другие доменные хелперы, здесь только интерактивная настройка.

import { Bot, InlineKeyboard } from "grammy";
import { setReminder } from "../db";
import { HR, HTML } from "./shared";

const REMIND_PRESETS: Record<string, { label: string; days: number[] }> = {
  mwf: { label: "Пн · Ср · Пт", days: [1, 3, 5] },
  tts: { label: "Вт · Чт · Сб", days: [2, 4, 6] },
  wkd: { label: "Пн – Пт", days: [1, 2, 3, 4, 5] },
  all: { label: "Каждый день", days: [0, 1, 2, 3, 4, 5, 6] },
};

interface SessionLike {
  data: Record<string, string | number>;
}

export function registerRemindersHandlers(
  bot: Bot,
  getSession: (userId: number) => SessionLike,
  resetSession: (userId: number) => void
) {
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
}
