/**
 * Опубликовать посты в канал по id.
 * node scripts/publish-channel-posts.mjs data sleep plateau
 */
import "dotenv/config";
import { Bot } from "grammy";
import { publishChannelPostById } from "../dist/channel/publisher.js";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: node scripts/publish-channel-posts.mjs <id> [id...]");
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN missing");
  process.exit(1);
}

const bot = new Bot(token);
for (const id of ids) {
  const r = await publishChannelPostById(bot.api, id);
  console.log(id, r.ok ? "ok" : r.error);
  await new Promise((res) => setTimeout(res, 1200));
}
