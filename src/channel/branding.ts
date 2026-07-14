import type { Api } from "grammy";
import { InputFile } from "grammy";
import https from "https";
import { BRAND } from "./brand";
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
    `🎨 <b>Оформление @kingmode_fit</b>\n\n` +
    `<code>/channel_name</code> — название\n` +
    `<code>/channel_about</code> — описание профиля\n` +
    `<code>/channel_photo</code> — аватар (ответ на фото)\n\n` +
    `Бренд: <b>${BRAND.name}</b> · ${BRAND.tagline}`
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

export async function applyBrandingFromEnv(api: Api): Promise<string[]> {
  const applied: string[] = [];
  if (!channelId()) return applied;

  try {
    const title = process.env.CHANNEL_TITLE?.trim() || BRAND.channelTitle;
    const about = process.env.CHANNEL_DESCRIPTION?.trim() || BRAND.channelAbout;
    await setChannelTitle(api, title);
    applied.push("title");
    await setChannelAbout(api, about);
    applied.push("about");
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
