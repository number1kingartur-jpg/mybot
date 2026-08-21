/**
 * Вход в Mini App только для участников чата KINGMODE.
 *
 * Telegram не умеет закрыть Mini App «только своим»: кнопка в группе это удобство,
 * а не замок. Замок здесь: после проверки initData сервер спрашивает getChatMember.
 * Бот должен быть админом того чата, иначе Telegram не отвечает по чужим людям
 * и вход закрывается для всех, кроме владельца.
 */

import { take } from "./guard";

export type AccessKind = "channel" | "group";

export type JoinBody = {
  error: "join";
  message: string;
  kind: AccessKind;
  title: string;
  url?: string;
};

export type AccessResult = { ok: true } | { ok: false; body: JoinBody };

const TTL_OK_MS = 60_000;
const TTL_NO_MS = 30_000;

type CacheRow = { allowed: boolean; exp: number };
const cache = new Map<number, CacheRow>();

function clean(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "");
}

/** Чат, в котором должны состоять. Свой id важнее канала автопостинга. */
export function accessChatId(): string | undefined {
  const own = clean(process.env.ACCESS_CHAT_ID);
  if (own) return own;
  const channel = clean(process.env.TELEGRAM_CHANNEL_ID);
  return channel || "@kingmode_fit";
}

export function accessChatTitle(): string {
  return clean(process.env.ACCESS_CHAT_TITLE) || clean(process.env.CHANNEL_TITLE) || "KINGMODE";
}

export function accessChatKind(chatId = accessChatId()): AccessKind {
  const forced = clean(process.env.ACCESS_CHAT_KIND).toLowerCase();
  if (forced === "group" || forced === "группа") return "group";
  if (forced === "channel" || forced === "канал") return "channel";
  if (!chatId) return "channel";
  // Числовой id это супергруппа или канал с -100. Без явного kind считаем группой:
  // публичный @username чаще канал.
  if (/^-?\d+$/.test(chatId)) return "group";
  return "channel";
}

/**
 * Замок включён на @kingmode_fit, пока не выключить ACCESS_GATE=0.
 * Артур 20.08: вход только для подписчиков этого канала.
 */
export function accessEnabled(): boolean {
  const raw = clean(process.env.ACCESS_GATE).toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return Boolean(accessChatId());
}

export function isMemberStatus(status: string | undefined): boolean {
  return status === "creator" || status === "administrator" || status === "member" || status === "restricted";
}

export function joinUrl(chatId?: string, invite?: string): string | undefined {
  const link = clean(invite || process.env.ACCESS_INVITE_URL);
  if (link) {
    if (/^https?:\/\//i.test(link)) return link;
    if (link.startsWith("t.me/")) return `https://${link}`;
    if (link.startsWith("@")) return `https://t.me/${link.slice(1)}`;
    return `https://t.me/${link.replace(/^\/+/, "")}`;
  }
  const id = clean(chatId || accessChatId());
  if (!id) return undefined;
  if (/^https?:\/\//i.test(id)) return id;
  if (id.startsWith("t.me/")) return `https://${id}`;
  if (id.startsWith("@")) return `https://t.me/${id.slice(1)}`;
  // Числовой id без инвайта ссылку не даёт: у приватной группы её нет в API без прав.
  return undefined;
}

export function joinBody(chatId = accessChatId()): JoinBody {
  const kind = accessChatKind(chatId);
  const title = accessChatTitle();
  const where = kind === "group" ? "группу" : "канал";
  const url = joinUrl(chatId);
  const body: JoinBody = {
    error: "join",
    kind,
    title,
    message: `Сначала вступи в ${where} ${title}. Там задания и разборы. Без этого приложение закрыто.`,
  };
  if (url) body.url = url;
  return body;
}

export function parseMemberApi(api: {
  ok?: boolean;
  result?: { status?: string };
}): boolean {
  if (!api || api.ok !== true) return false;
  return isMemberStatus(api.result?.status);
}

async function telegramMember(chatId: string, userId: number, botToken: string): Promise<boolean> {
  const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
  url.searchParams.set("chat_id", chatId);
  url.searchParams.set("user_id", String(userId));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const api = (await res.json()) as { ok?: boolean; result?: { status?: string } };
    return parseMemberApi(api);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function cached(userId: number): boolean | undefined {
  const row = cache.get(userId);
  if (!row) return undefined;
  if (row.exp <= Date.now()) {
    cache.delete(userId);
    return undefined;
  }
  return row.allowed;
}

function remember(userId: number, allowed: boolean): void {
  cache.set(userId, {
    allowed,
    exp: Date.now() + (allowed ? TTL_OK_MS : TTL_NO_MS),
  });
}

/** Сброс кэша: кнопка «Я уже внутри» не должна ждать минуту. */
export function forgetAccess(userId: number): void {
  cache.delete(userId);
}

export async function checkAccess(opts: {
  userId: number;
  botToken: string;
  owner: boolean;
  refresh?: boolean;
}): Promise<AccessResult> {
  if (!accessEnabled()) return { ok: true };
  if (opts.owner) return { ok: true };
  const chatId = accessChatId();
  if (!chatId) return { ok: true };

  if (opts.refresh && take(`join-refresh:${opts.userId}`, 1, 60_000)) {
    forgetAccess(opts.userId);
  }
  const hit = cached(opts.userId);
  if (hit === true) return { ok: true };
  if (hit === false) return { ok: false, body: joinBody(chatId) };

  const allowed = await telegramMember(chatId, opts.userId, opts.botToken);
  remember(opts.userId, allowed);
  if (allowed) return { ok: true };
  return { ok: false, body: joinBody(chatId) };
}
