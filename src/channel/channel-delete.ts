import type { Api } from "grammy";
import { channelId } from "./publisher";

let cachedChatId: string | undefined;

/** @username → -100… для надёжного deleteMessage. */
export async function resolveChannelChatId(api: Api): Promise<string | undefined> {
  if (cachedChatId) return cachedChatId;
  const raw = channelId();
  if (!raw) return undefined;
  if (/^-100\d+$/.test(raw)) {
    cachedChatId = raw;
    return raw;
  }
  try {
    const chat = await api.getChat(raw);
    cachedChatId = String(chat.id);
    return cachedChatId;
  } catch {
    return raw;
  }
}

export async function deleteChannelMessages(
  api: Api,
  messageIds: number[]
): Promise<{ deleted: number; errors: string[] }> {
  const chatId = await resolveChannelChatId(api);
  if (!chatId) return { deleted: 0, errors: ["channel not configured"] };

  let deleted = 0;
  const errors: string[] = [];
  for (const mid of messageIds) {
    try {
      await api.deleteMessage(chatId, mid);
      deleted++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      errors.push(`${mid}: ${err}`);
    }
  }
  return { deleted, errors };
}
