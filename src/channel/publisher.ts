import type { Api } from "grammy";
import { CHANNEL_POSTS, type ChannelPost } from "./posts";
import { getChannelState, markChannelPosted } from "../db";

const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID?.trim().replace(/^['"]|['"]$/g, "");
const BOT_USERNAME = process.env.BOT_USERNAME?.trim().replace(/^@/, "");
const ENABLED =
  process.env.CHANNEL_POST_ENABLED === "1" ||
  process.env.CHANNEL_POST_ENABLED === "true";

/** Cron: по умолчанию пн/ср/пт 10:00 Бангкок */
export const CHANNEL_CRON = process.env.CHANNEL_POST_CRON?.trim() || "0 10 * * 1,3,5";

export function channelPostingEnabled(): boolean {
  return ENABLED && Boolean(CHANNEL_ID);
}

export function channelId(): string | undefined {
  return CHANNEL_ID || undefined;
}

function ctaLine(): string {
  const bot = BOT_USERNAME ? `@${BOT_USERNAME}` : "бот RASCHET";
  return `\n\n${"—".repeat(12)}\n📲 Тренировки, питание, прогресс → ${bot}`;
}

function formatPost(post: ChannelPost): string {
  const text = `<b>${post.title}</b>\n\n${post.body}${ctaLine()}`;
  if (text.length <= 4096) return text;
  return text.slice(0, 4080) + "…" + ctaLine();
}

/** Следующий пост: тот, что давно не публиковали; цикл по кругу. */
export function pickNextPost(): ChannelPost {
  const state = getChannelState();
  const postedSet = new Set(state.posted.map((p) => p.postId));
  const neverPosted = CHANNEL_POSTS.filter((p) => !postedSet.has(p.id));
  if (neverPosted.length > 0) return neverPosted[0];

  const lastById = new Map(state.posted.map((p) => [p.postId, p.date]));
  let oldest: ChannelPost = CHANNEL_POSTS[0];
  let oldestDate = "9999-99-99";
  for (const post of CHANNEL_POSTS) {
    const d = lastById.get(post.id) ?? "0000-00-00";
    if (d < oldestDate) {
      oldestDate = d;
      oldest = post;
    }
  }
  return oldest;
}

export function previewNextPost(): { post: ChannelPost; html: string } {
  const post = pickNextPost();
  return { post, html: formatPost(post) };
}

/** Уже постили сегодня? */
export function postedToday(today: string): boolean {
  return getChannelState().posted.some((p) => p.date === today);
}

export async function publishNextChannelPost(
  api: Api,
  opts?: { force?: boolean; today?: string }
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!CHANNEL_ID) return { ok: false, error: "TELEGRAM_CHANNEL_ID not set" };

  const today = opts?.today ?? new Date().toISOString().slice(0, 10);
  if (!opts?.force && postedToday(today)) {
    return { ok: false, error: "already posted today" };
  }

  const post = pickNextPost();
  const html = formatPost(post);

  try {
    await api.sendMessage(CHANNEL_ID, html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    markChannelPosted(post.id, today);
    console.log(`channel post ok: ${post.id} → ${CHANNEL_ID}`);
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
  const unique = new Set(state.posted.map((p) => p.postId)).size;
  const last = state.posted.at(-1);
  return (
    `📢 <b>Автовыкладка в канал</b>\n\n` +
    `Статус: ${channelPostingEnabled() ? "✅ включена" : "⏸ выключена"}\n` +
    `Канал: <code>${esc(channelId() ?? "не задан")}</code>\n` +
    `Расписание: <code>${CHANNEL_CRON}</code> (Asia/Bangkok)\n` +
    `Постов в базе: ${total}, опубликовано уникальных: ${unique}\n` +
    (last ? `Последний: <code>${last.postId}</code> (${last.date})\n` : "") +
    `\nСледующий: <b>${esc(pickNextPost().title)}</b>\n\n` +
    `<code>/channel_name</code> · <code>/channel_about</code> · <code>/channel_photo</code>`
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
