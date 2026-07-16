import { InlineKeyboard, type Api } from "grammy";
import { brandKeyboard, getBrandLinks } from "./brand";
import { postImageFile } from "./images";
import { labelParts, formatPostPreview, partCount, splitPostText } from "./split";
import { CHANNEL_POSTS, type ChannelPost } from "./posts";
import { getChannelState, markChannelPosted, saveChannelLastPublish } from "../db";

const DEFAULT_CHANNEL = "@kingmode_fit";

function cleanChannelId(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "") || DEFAULT_CHANNEL;
}

const CHANNEL_ID = cleanChannelId(process.env.TELEGRAM_CHANNEL_ID);
/** Вкл по умолчанию; выключить: CHANNEL_POST_ENABLED=0 */
const ENABLED =
  process.env.CHANNEL_POST_ENABLED !== "0" &&
  process.env.CHANNEL_POST_ENABLED !== "false";

/** Слоты публикации (часы, Bangkok). По умолчанию 10:00, 15:00, 19:00 — 3 поста в день. */
export function channelPostSlots(): number[] {
  const raw = process.env.CHANNEL_POST_SLOTS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
  }
  const cron = process.env.CHANNEL_POST_CRON?.trim();
  if (cron) {
    const parts = cron.split(/\s+/);
    if (parts[1]?.includes(",")) {
      return parts[1]
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
    }
    if (parts[1]) {
      const h = parseInt(parts[1], 10);
      if (Number.isFinite(h)) return [h];
    }
  }
  return [10, 15, 19];
}

const POST_SLOTS = channelPostSlots();

/** Постов в день = число слотов (по умолчанию 3). */
const POSTS_PER_DAY = Math.max(
  POST_SLOTS.length,
  parseInt(process.env.CHANNEL_POSTS_PER_DAY ?? String(POST_SLOTS.length), 10) || POST_SLOTS.length
);

/** Для статуса / логов */
export const CHANNEL_CRON = `0 ${POST_SLOTS.join(",")} * * *`;

export function channelPostsPerDay(): number {
  return POSTS_PER_DAY;
}

export function channelSlotsLabel(): string {
  return POST_SLOTS.map((h) => `${h}:00`).join(" · ");
}

export function channelToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function postedTodayIds(today: string, state = getChannelState()): Set<string> {
  return new Set(state.posted.filter((p) => p.date === today).map((p) => p.postId));
}

export function channelPostTotal(): number {
  return CHANNEL_POSTS.length;
}

export function reserveDaysNew(): number {
  return Math.ceil(remainingPostCount() / POSTS_PER_DAY);
}

function postedEverIds(state = getChannelState()): Set<string> {
  return new Set(state.posted.map((p) => p.postId));
}

/** new — есть неопубликованные; exhausted — все вышли, повторов нет. */
export function queueMode(): "new" | "exhausted" {
  return remainingPostCount() > 0 ? "new" : "exhausted";
}

export function channelPostingEnabled(): boolean {
  return ENABLED && Boolean(CHANNEL_ID);
}

export function channelId(): string | undefined {
  return CHANNEL_ID || undefined;
}

function resolveParts(post: ChannelPost, withPhoto: boolean): string[] {
  if (post.parts?.length) return post.parts;
  return splitPostText(post.body, { withPhoto });
}

function formatPost(post: ChannelPost): string {
  const photo = Boolean(postImageFile(post));
  return formatPostPreview(post.body, post.parts, photo);
}

function postKeyboard(post: ChannelPost): InlineKeyboard {
  const kb = brandKeyboard();
  if (post.guideStart) {
    const { botUser } = getBrandLinks();
    const start = post.guideStart.startsWith("guide") ? post.guideStart : `guide_${post.guideStart}`;
    kb.row().url("📥 Забрать гайд", `https://t.me/${botUser}?start=${start}`);
  }
  return kb;
}

async function sendChannelPost(api: Api, post: ChannelPost): Promise<number[]> {
  const photo = postImageFile(post);
  const parts = labelParts(resolveParts(post, Boolean(photo)));
  const kb = postKeyboard(post);
  let threadId: number | undefined;
  const messageIds: number[] = [];

  for (let i = 0; i < parts.length; i++) {
    const text = parts[i];
    const isLast = i === parts.length - 1;
    const replyMarkup = isLast ? kb : undefined;

    if (i === 0 && photo) {
      const msg = await api.sendPhoto(CHANNEL_ID!, photo, {
        caption: text,
        reply_markup: replyMarkup,
      });
      threadId = msg.message_id;
      messageIds.push(msg.message_id);
    } else {
      const msg = await api.sendMessage(CHANNEL_ID!, text, {
        link_preview_options: { is_disabled: true },
        reply_markup: replyMarkup,
        ...(threadId ? { reply_parameters: { message_id: threadId } } : {}),
      });
      if (!threadId) threadId = msg.message_id;
      messageIds.push(msg.message_id);
    }

    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return messageIds;
}

/**
 * Следующий пост — только тот, что ещё ни разу не выходил.
 * Повторов нет. Очередь пуста → null.
 */
export function pickNextPost(today = channelToday()): ChannelPost | null {
  if (CHANNEL_POSTS.length === 0) return null;
  const state = getChannelState();
  const ever = postedEverIds(state);
  const todayIds = postedTodayIds(today, state);
  const neverPosted = CHANNEL_POSTS.filter((p) => !ever.has(p.id) && !todayIds.has(p.id));
  return neverPosted[0] ?? null;
}

let publishLock = false;
let exhaustedLoggedDate: string | undefined;

export function remainingPostCount(): number {
  const ever = postedEverIds();
  return CHANNEL_POSTS.filter((p) => !ever.has(p.id)).length;
}

export function previewNextPost():
  | { post: ChannelPost; html: string; mode: "new" }
  | { post: null; html: string; mode: "exhausted" } {
  const post = pickNextPost();
  if (!post) {
    return {
      post: null,
      html:
        `<b>Очередь исчерпана</b>\n\n` +
        `Все ${CHANNEL_POSTS.length} постов уже вышли в канал.\n` +
        `Повторов нет. Добавь новые посты в <code>posts-extra.ts</code> и задеплой.`,
      mode: "exhausted",
    };
  }
  return { post, html: formatPost(post), mode: "new" };
}

function partInfo(post: ChannelPost): string {
  const n = partCount(post.body, post.parts, Boolean(postImageFile(post)));
  return n > 1 ? ` · ${n} части` : "";
}

/** Сколько постов уже вышло сегодня (Bangkok). */
export function postsTodayCount(today = channelToday()): number {
  return getChannelState().posted.filter((p) => p.date === today).length;
}

export function canPostToday(today = channelToday()): boolean {
  return postsTodayCount(today) < POSTS_PER_DAY;
}

export async function publishChannelPostById(
  api: Api,
  postId: string,
  opts?: { markDate?: string; allowRepeat?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (!CHANNEL_ID) return { ok: false, error: "TELEGRAM_CHANNEL_ID not set" };
  const post = CHANNEL_POSTS.find((p) => p.id === postId);
  if (!post) return { ok: false, error: `unknown post: ${postId}` };
  const ever = postedEverIds();
  if (!opts?.allowRepeat && ever.has(postId)) {
    return { ok: false, error: `post already published once: ${postId}` };
  }
  try {
    const messageIds = await sendChannelPost(api, post);
    if (opts?.markDate) {
      markChannelPosted(post.id, opts.markDate);
      saveChannelLastPublish(post.id, messageIds, opts.markDate);
    }
    console.log(`channel post ok: ${post.id} → ${CHANNEL_ID} msgs=${messageIds.join(",")}`);
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}

export async function publishNextChannelPost(
  api: Api,
  opts?: { force?: boolean; today?: string }
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!CHANNEL_ID) return { ok: false, error: "TELEGRAM_CHANNEL_ID not set" };
  if (publishLock) return { ok: false, error: "publish in progress" };

  const today = opts?.today ?? channelToday();
  if (!opts?.force && !canPostToday(today)) {
    return { ok: false, error: `daily limit (${POSTS_PER_DAY})` };
  }

  const post = pickNextPost(today);
  if (!post) {
    if (exhaustedLoggedDate !== today) {
      console.warn(`channel queue exhausted (${CHANNEL_POSTS.length} posts published, no repeats)`);
      exhaustedLoggedDate = today;
    }
    return { ok: false, error: "queue exhausted (no repeats)" };
  }

  if (postedTodayIds(today).has(post.id)) {
    return { ok: false, error: `already posted today: ${post.id}` };
  }

  publishLock = true;
  try {
    const messageIds = await sendChannelPost(api, post);
    markChannelPosted(post.id, today);
    saveChannelLastPublish(post.id, messageIds, today);
    const left = remainingPostCount();
    if (left > 0 && left <= 10) {
      console.warn(`channel queue low: ${left} posts left — add to posts-extra.ts`);
    }
    if (left === 0) {
      console.warn(`channel queue exhausted — autopost will stop until new posts added`);
    }
    console.log(`channel post ok: ${post.id} → ${CHANNEL_ID} (${left} left, no repeats)`);
    return { ok: true, postId: post.id };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("channel post error:", err);
    return { ok: false, error: err };
  } finally {
    publishLock = false;
  }
}

export function channelStatusText(): string {
  const state = getChannelState();
  const total = CHANNEL_POSTS.length;
  const unique = postedEverIds(state).size;
  const left = remainingPostCount();
  const last = state.posted.at(-1);
  const today = channelToday();
  const doneToday = postsTodayCount(today);
  const reserve = reserveDaysNew();
  const mode = queueMode();
  const next = pickNextPost();
  return (
    `📢 <b>Автовыкладка в канал</b>\n\n` +
    `Статус: ${channelPostingEnabled() ? "✅ включена" : "⏸ выключена"}\n` +
    `Канал: <code>${esc(channelId() ?? "не задан")}</code>\n` +
    `Расписание: <b>${esc(channelSlotsLabel())}</b> (Asia/Bangkok, ${POST_SLOTS.length}×/день)\n` +
    `Сегодня: <b>${doneToday}/${POSTS_PER_DAY}</b> постов\n` +
    `В базе: <b>${total}</b> · вышло: ${unique} · осталось: <b>${left}</b>` +
    (left > 0 ? ` (~${reserve} дн.)` : "") +
    `\n` +
    `Повторы: <b>никогда</b> (каждый id — один раз)\n` +
    `Режим: <b>${mode === "new" ? "новые посты" : "очередь пуста — добавь контент"}</b>\n` +
    (last ? `Последний: <code>${last.postId}</code> (${last.date})\n` : "") +
    (next
      ? `\nСледующий: <b>${esc(next.title) + partInfo(next)}</b>\n`
      : `\n<i>Следующих постов нет — очередь исчерпана.</i>\n`) +
    `\n<code>/channel_delete_last</code> · <code>/channel_delete ID</code>\n` +
    `<code>/channel_name</code> · <code>/channel_about</code> · <code>/channel_photo</code>`
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
