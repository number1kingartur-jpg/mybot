// ── Гайды (файлы: планы питания и тренировок) ───────────────────────────────
// Перенесено из index.ts без изменения поведения.

import { Bot } from "grammy";
import { sendGuidesMenu, sendGuideFile } from "../guides";
import { HR, DOT, HTML } from "./shared";

export function registerGuidesHandlers(bot: Bot, resetSession: (userId: number) => void) {
  bot.hears("📥 Гайды", async (ctx) => {
    resetSession(ctx.from!.id);
    await sendGuidesMenu(ctx);
  });

  // ── Гайды ───────────────────────────────────────────────────────────────────
  bot.command("guides", async (ctx) => {
    resetSession(ctx.from!.id);
    await sendGuidesMenu(ctx);
  });

  bot.command("guide", async (ctx) => {
    resetSession(ctx.from!.id);
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!arg) {
      await sendGuidesMenu(ctx);
      return;
    }
    const ok = await sendGuideFile(ctx, arg);
    if (!ok) {
      await ctx.reply(
        `Гайд не найден. Доступные: <code>7day</code>, <code>7mistakes</code>, <code>kbju</code>\n\nИли /guides`,
        HTML
      );
    }
  });

  bot.callbackQuery(/^guide_dl_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Отправляю файл…" });
    const slug = ctx.match![1];
    const ok = await sendGuideFile(ctx, slug);
    if (!ok) await ctx.reply("Гайд не найден. /guides", HTML);
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
}
