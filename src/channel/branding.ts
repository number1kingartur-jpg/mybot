import type { Api } from "grammy";
import { InputFile } from "grammy";
import https from "https";
import { channelId } from "./publisher";

function chatId(): string {
  const id = channelId();
  if (!id) throw new Error("TELEGRAM_CHANNEL_ID not set");
  return id;
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export function brandingHelpText(): string {
  return (
    `🎨 <b>Оформление канала/группы</b>\n\n` +
    `<code>/channel_name</code> Новое название\n` +
    `<code>/channel_about</code> Текст описания (шапка в профиле)\n` +
    `<code>/channel_photo</code> — ответь этой командой на фото\n` +
    `или отправь фото с подписью <code>/channel_photo</code>\n\n` +
    `<i>Бот должен быть админом с правом «Изменение профиля группы».</i>`
  );
}

export async function setChannelTitle(api: Api, title: string): Promise<void> {
  const t = title.trim().slice(0, 128);
  if (!t) throw new Error("empty title");
  await api.setChatTitle(chatId(), t);
}

export async function setChannelAbout(api: Api, about: string): Promise<void> {
  await api.setChatDescription(chatId(), about.trim().slice(0, 255));
}

export async function setChannelPhoto(api: Api, image: Buffer): Promise<void> {
  if (image.length < 100) throw new Error("image too small");
  await api.setChatPhoto(chatId(), new InputFile(image, "channel.jpg"));
}

/** При старте: CHANNEL_TITLE, CHANNEL_DESCRIPTION, CHANNEL_PHOTO_URL из Railway. */
export async function applyBrandingFromEnv(api: Api): Promise<string[]> {
  const applied: string[] = [];
  if (!channelId()) return applied;

  try {
    if (process.env.CHANNEL_TITLE?.trim()) {
      await setChannelTitle(api, process.env.CHANNEL_TITLE);
      applied.push("title");
    }
    if (process.env.CHANNEL_DESCRIPTION?.trim()) {
      await setChannelAbout(api, process.env.CHANNEL_DESCRIPTION);
      applied.push("about");
    }
    const photoUrl = process.env.CHANNEL_PHOTO_URL?.trim();
    if (photoUrl) {
      const buf = await fetchBuffer(photoUrl);
      await setChannelPhoto(api, buf);
      applied.push("photo");
    }
  } catch (e) {
    console.error("channel branding env:", e instanceof Error ? e.message : e);
  }
  return applied;
}

export async function getChannelInfo(api: Api): Promise<{ title?: string; about?: string }> {
  try {
    const chat = await api.getChat(chatId());
    return {
      title: chat.title,
      about: "description" in chat ? chat.description : undefined,
    };
  } catch {
    return {};
  }
}
