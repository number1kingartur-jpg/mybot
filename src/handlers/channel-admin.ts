// ── Канал и админ-метрики (только владелец бота) ────────────────────────────
// Перенесено из index.ts без изменения поведения: /kmstats и всё семейство
// /channel* команд, которыми пользуется только владелец (isOwner).

import { Bot } from "grammy";
import { isOwner, getChannelLastPublish } from "../db";
import { retentionSnapshot } from "../metrics";
import {
  channelPostingEnabled,
  channelStatusText,
  channelId,
  channelToday,
  previewNextPost,
  publishNextChannelPost,
  publishChannelPostById,
} from "../channel/publisher";
import {
  brandingHelpText,
  setChannelAbout,
  setChannelPhoto,
  setChannelTitle,
} from "../channel/branding";
import { deleteChannelMessages, resolveChannelChatId } from "../channel/channel-delete";
import { HTML, esc, today, fetchImageBuffer } from "./shared";

export function registerChannelAdminHandlers(bot: Bot, token: string) {
  // ── Метрики удержания (только владелец) ──────────────────────────────────────
  bot.command("kmstats", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    const snap = retentionSnapshot(today());
    const funnelLine = snap.funnelOverlap
      ? `Из активных за 7 дней уже клиенты воронки: <b>${snap.funnelOverlap.active7dInFunnel}</b> из ${snap.funnelOverlap.active7dTotal}`
      : `Из активных за 7 дней уже клиенты воронки: нет данных (файл воронки не найден)`;
    await ctx.reply(
      `<b>Удержание KINGMODE</b>\n` +
        `Всего пользователей: <b>${snap.usersTotal}</b>\n` +
        `Активны за 7 дней: <b>${snap.active7d}</b> (из них с серией 7+ дней: ${snap.streakDistribution.d7plus})\n` +
        `Активны за 30 дней: <b>${snap.active30d}</b>\n` +
        `${funnelLine}`,
      HTML
    );
  });

  // ── Канал: автовыкладка (только владелец) ───────────────────────────────────
  bot.command("channel", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    await ctx.reply(channelStatusText(), HTML);
  });

  bot.command("channel_brand", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    await ctx.reply(brandingHelpText(), HTML);
  });

  bot.command("channel_name", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    if (!channelId()) {
      await ctx.reply("Задай <code>TELEGRAM_CHANNEL_ID</code> в Railway.", HTML);
      return;
    }
    const name = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!name) {
      await ctx.reply("Напиши: <code>/channel_name KINGMODE</code>", HTML);
      return;
    }
    try {
      await setChannelTitle(bot.api, name);
      await ctx.reply(`✅ Название канала: <b>${esc(name)}</b>`, HTML);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`⚠️ ${esc(msg)}\n\n<i>Нужны права админа «Изменение профиля».</i>`, HTML);
    }
  });

  bot.command("channel_about", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    if (!channelId()) {
      await ctx.reply("Задай <code>TELEGRAM_CHANNEL_ID</code> в Railway.", HTML);
      return;
    }
    const about = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!about) {
      await ctx.reply(
        "Напиши описание одной строкой:\n<code>/channel_about Метод: план → цифры → результат. @Raschettbot</code>",
        HTML
      );
      return;
    }
    try {
      await setChannelAbout(bot.api, about);
      await ctx.reply(`✅ Описание канала обновлено.`, HTML);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`⚠️ ${esc(msg)}`, HTML);
    }
  });

  async function applyChannelPhotoFromMessage(ctx: {
    from?: { id: number };
    message?: { photo?: { file_id: string }[]; reply_to_message?: { photo?: { file_id: string }[] } };
    reply: (t: string, o?: object) => Promise<unknown>;
    api: typeof bot.api;
  }) {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    if (!channelId()) {
      await ctx.reply("Задай <code>TELEGRAM_CHANNEL_ID</code> в Railway.", HTML);
      return;
    }
    const photos = ctx.message?.reply_to_message?.photo ?? ctx.message?.photo;
    if (!photos?.length) {
      await ctx.reply(
        "Отправь <b>фото</b> с подписью <code>/channel_photo</code>\nили ответь <code>/channel_photo</code> на картинку.",
        HTML
      );
      return;
    }
    const fileId = photos[photos.length - 1].file_id;
    try {
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) throw new Error("no file_path");
      const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const buf = await fetchImageBuffer(url);
      await setChannelPhoto(bot.api, buf);
      await ctx.reply("✅ Шапка (аватар канала) обновлена.", HTML);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`⚠️ ${esc(msg)}\n\n<i>Права: админ + изменение профиля.</i>`, HTML);
    }
  }

  bot.command("channel_photo", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    await applyChannelPhotoFromMessage(ctx);
  });

  bot.on("message:photo", async (ctx, next) => {
    const cap = ctx.message.caption?.trim() ?? "";
    if (cap.startsWith("/channel_photo") && isOwner(ctx.from!.id)) {
      await applyChannelPhotoFromMessage(ctx);
      return;
    }
    await next();
  });

  bot.command("channel_post", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    if (!channelPostingEnabled()) {
      await ctx.reply(
        `📢 Автовыкладка выключена.\n\n` +
        `Railway → Variables:\n` +
        `<code>TELEGRAM_CHANNEL_ID</code> = @канал или -100...\n` +
        `<code>CHANNEL_POST_ENABLED</code> = 1\n` +
        `<code>BOT_USERNAME</code> = имя_бота без @\n` +
        `Бот должен быть <b>админом</b> канала с правом публикации.`,
        HTML
      );
      return;
    }
    const preview = previewNextPost();
    if (!preview.post) {
      await ctx.reply(preview.html, HTML);
      return;
    }
    const { post, html } = preview;
    await ctx.reply(`👀 <b>Превью</b> (следующий пост: <code>${esc(post.id)}</code>)\n\n${html}`, HTML);
    const result = await publishNextChannelPost(bot.api, { force: true });
    if (result.ok) {
      await ctx.reply(`✅ Опубликовано в канал: <b>${esc(post.title)}</b> (<code>${result.postId}</code>)`, HTML);
    } else {
      await ctx.reply(`⚠️ Не вышло: <i>${esc(result.error ?? "unknown")}</i>`, HTML);
    }
  });

  /** Удалить последнюю публикацию бота (все части серии). */
  bot.command("channel_delete_last", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    const last = getChannelLastPublish();
    if (!last?.messageIds?.length) {
      await ctx.reply("Нет записи последней публикации. Укажи ID: <code>/channel_delete 42</code>", HTML);
      return;
    }
    const result = await deleteChannelMessages(bot.api, last.messageIds);
    if (result.deleted > 0) {
      await ctx.reply(
        `🗑 Удалено <b>${result.deleted}</b> сообщ. (пост <code>${esc(last.postId)}</code>)\n` +
        `ID: ${last.messageIds.map((id) => `<code>${id}</code>`).join(", ")}`,
        HTML
      );
    } else {
      await ctx.reply(
        `⚠️ Не удалось.\n${result.errors.map(esc).join("\n")}\n\n` +
        `Права бота: админ + <b>удаление сообщений</b>.`,
        HTML
      );
    }
  });

  /** Удалить сообщение в канале: /channel_delete 123 или ответ на пересланный пост. */
  bot.command("channel_delete", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }

    let messageIds: number[] = [];
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const linkMatch = arg.match(/t\.me\/\w+\/(\d+)/);
    const nums = arg.match(/\d+/g);

    if (linkMatch) messageIds = [parseInt(linkMatch[1], 10)];
    else if (nums?.length) messageIds = nums.map((n) => parseInt(n, 10));

    const reply = ctx.message?.reply_to_message;
    if (!messageIds.length && reply) {
      const origin = reply.forward_origin;
      if (origin?.type === "channel") {
        messageIds = [origin.message_id];
      }
      // старый формат пересылки
      const legacy = reply as { forward_from_chat?: { id: number }; forward_from_message_id?: number };
      if (!messageIds.length && legacy.forward_from_message_id) {
        messageIds = [legacy.forward_from_message_id];
      }
    }

    if (!messageIds.length) {
      await ctx.reply(
        `<b>Удаление поста в канале</b>\n\n` +
        `1. <code>/channel_delete_last</code> — последний пост бота (все части)\n` +
        `2. <code>/channel_delete 42</code> — по номеру из ссылки t.me/kingmode_fit/42\n` +
        `3. Перешли пост боту → ответь <code>/channel_delete</code>\n\n` +
        `<i>Бот = админ канала с правом удаления.</i>`,
        HTML
      );
      return;
    }

    const result = await deleteChannelMessages(bot.api, messageIds);
    if (result.deleted > 0) {
      await ctx.reply(`🗑 Удалено: ${result.deleted} сообщ.`, HTML);
    } else {
      const chat = await resolveChannelChatId(bot.api);
      await ctx.reply(
        `⚠️ Не удалось удалить.\n` +
        result.errors.map(esc).join("\n") +
        `\n\nКанал: <code>${esc(chat ?? "?")}</code>\n` +
        `Проверь: бот админ → право <b>Delete messages</b>.`,
        HTML
      );
    }
  });

  /** Опубликовать конкретный пост: /channel_post_id sleep */
  bot.command("channel_post_id", async (ctx) => {
    if (!isOwner(ctx.from!.id)) {
      await ctx.reply("Команда только для владельца бота.", HTML);
      return;
    }
    const postId = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!postId) {
      await ctx.reply("Напиши: <code>/channel_post_id sleep</code>", HTML);
      return;
    }
    const result = await publishChannelPostById(bot.api, postId, { markDate: channelToday() });
    if (result.ok) await ctx.reply(`✅ Опубликован <code>${esc(postId)}</code>`, HTML);
    else await ctx.reply(`⚠️ ${esc(result.error ?? "error")}`, HTML);
  });
}
