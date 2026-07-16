import { InlineKeyboard, type Api } from "grammy";
import { brandKeyboard, getBrandLinks } from "./brand";
import { postImageFile } from "./images";
import { labelParts, formatPostPreview, partCount, splitPostText } from "./split";
import { CHANNEL_POSTS, type ChannelPost } from "./posts";
import { getChannelState, markChannelPosted } from "../db";

const DEFAULT_CHANNEL = "@kingmode_fit";

function cleanChannelId(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "") || DEFAULT_CHANNEL;
}

const CHANNEL_ID = cleanChannelId(process.env.TELEGRAM_CHANNEL_ID);
/** Вкл по умолчанию; выключить: CHANNEL_POST_ENABLED=0 */
const ENABLED =
  process.env.CHANNEL_POST_ENABLED !== "0" &&
  process.env.CHANNEL_POST_ENABLED !== "false";

/** Постов в день (каждый слот cron = один пост, пока не достигнут лимит). */
const POSTS_PER_DAY = Math.max(1, parseInt(process.env.CHANNEL_POSTS_PER_DAY ?? "3", 10) || 3);

/** Cron: по умолчанию 10:00, 15:00, 19:00 Bangkok — каждый день */
export const CHANNEL_CRON = process.env.CHANNEL_POST_CRON?.trim() || "0 10,15,19 * * *";

export function channelPostsPerDay(): number {
  return POSTS_PER_DAY;
}

export function channelToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function lastPostedById(state = getChannelState()): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of state.posted) {
    const prev = map.get(row.postId);
    if (!prev || row.date > prev) map.set(row.postId, row.date);
  }
  return map;
}

/** Полный цикл перед повтором того же postId. */
function rotationMinDays(): number {
  const env = parseInt(process.env.CHANNEL_ROTATION_DAYS ?? "", 10);
  if (env > 0) return env;
  return Math.ceil(CHANNEL_POSTS.length / POSTS_PER_DAY);
}

export function channelPostTotal(): number {
  return CHANNEL_POSTS.length;
}

export function reserveDaysNew(): number {
  return Math.ceil(remainingPostCount() / POSTS_PER_DAY);
}

function pickOldestPost(pool: ChannelPost[], lastById: Map<string, string>): ChannelPost {
  let oldest = pool[0];
  let oldestDate = lastById.get(oldest.id) ?? "0000-00-00";
  for (const post of pool) {
    const d = lastById.get(post.id) ?? "0000-00-00";
    if (d < oldestDate) {
      oldestDate = d;
      oldest = post;
    }
  }
  return oldest;
}

function postedEverIds(state = getChannelState()): Set<string> {
  return new Set(state.posted.map((p) => p.postId));
}

export function queueMode(): "new" | "rotation" {
  return remainingPostCount() > 0 ? "new" : "rotation";
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

async function sendChannelPost(api: Api, post: ChannelPost): Promise<void> {
  const photo = postImageFile(post);
  const parts = labelParts(resolveParts(post, Boolean(photo)));
  const kb = postKeyboard(post);
  let threadId: number | undefined;

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
    } else {
      const msg = await api.sendMessage(CHANNEL_ID!, text, {
        link_preview_options: { is_disabled: true },
        reply_markup: replyMarkup,
        ...(threadId ? { reply_parameters: { message_id: threadId } } : {}),
      });
      if (!threadId) threadId = msg.message_id;
    }

    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

/** Следующий пост: новые → после паузы → самый давний. Материал всегда есть. */
export function pickNextPost(today = channelToday()): ChannelPost {
  if (CHANNEL_POSTS.length === 0) {
    throw new Error("CHANNEL_POSTS empty — add content to posts.ts");
  }
  const state = getChannelState();
  const ever = postedEverIds(state);
  const neverPosted = CHANNEL_POSTS.filter((p) => !ever.has(p.id));
  if (neverPosted.length > 0) return neverPosted[0];

  const lastById = lastPostedById(state);
  const minDays = rotationMinDays();
  const cooled = CHANNEL_POSTS.filter((p) => {
    const last = lastById.get(p.id);
    if (!last) return true;
    return daysBetween(last, today) >= minDays;
  });
  const pool = cooled.length > 0 ? cooled : CHANNEL_POSTS;
  return pickOldestPost(pool, lastById);
}

export function remainingPostCount(): number {
  const ever = postedEverIds();
  return CHANNEL_POSTS.filter((p) => !ever.has(p.id)).length;
}

export function previewNextPost(): { post: ChannelPost; html: string; mode: "new" | "rotation" } {
  const post = pickNextPost();
  const mode = queueMode();
  const modeNote =
    mode === "rotation"
      ? `\n\n<i>Режим ротации — повтор через ${rotationMinDays()}+ дн. после полного цикла.</i>`
      : "";
  return { post, html: formatPost(post) + modeNote, mode };
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
  opts?: { markDate?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!CHANNEL_ID) return { ok: false, error: "TELEGRAM_CHANNEL_ID not set" };
  const post = CHANNEL_POSTS.find((p) => p.id === postId);
  if (!post) return { ok: false, error: `unknown post: ${postId}` };
  try {
    await sendChannelPost(api, post);
    if (opts?.markDate) markChannelPosted(post.id, opts.markDate);
    console.log(`channel post ok: ${post.id} → ${CHANNEL_ID}`);
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

  const today = opts?.today ?? channelToday();
  if (!opts?.force && !canPostToday(today)) {
    return { ok: false, error: `daily limit (${POSTS_PER_DAY})` };
  }

  const post = pickNextPost(today);

  try {
    await sendChannelPost(api, post);
    markChannelPosted(post.id, today);
    const left = remainingPostCount();
    if (left > 0 && left <= 10) {
      console.warn(`channel queue low: ${left} new posts left — add to posts-bank.ts`);
    }
    console.log(`channel post ok: ${post.id} → ${CHANNEL_ID} (${left} new left)`);
    return { ok: true, postId: post.id };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("channel post error:", err);
    return { ok: false, error: err };
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
  const next = pickNextPost();
  const mode = queueMode();
  return (
    `📢 <b>Автовыкладка в канал</b>\n\n` +
    `Статус: ${channelPostingEnabled() ? "✅ включена" : "⏸ выключена"}\n` +
    `Канал: <code>${esc(channelId() ?? "не задан")}</code>\n` +
    `Расписание: <code>${CHANNEL_CRON}</code> (Asia/Bangkok)\n` +
    `Сегодня: <b>${doneToday}/${POSTS_PER_DAY}</b> постов\n` +
    `В базе: <b>${total}</b> · вышло: ${unique} · новых: <b>${left}</b> (~${reserve} дн.)\n` +
    `Режим: <b>${mode === "new" ? "новые темы" : `ротация (цикл ${rotationMinDays()} дн.)`}</b>\n` +
    `Материал: <b>всегда</b> (новые → ротация)\n` +
    (last ? `Последний: <code>${last.postId}</code> (${last.date})\n` : "") +
    `\nСледующий: <b>${esc(next.title) + partInfo(next)}</b>\n\n` +
    `<code>/channel_name</code> · <code>/channel_about</code> · <code>/channel_photo</code>`
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
