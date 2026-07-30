/**
 * Заменить фото в уже опубликованных постах @kingmode_fit (без удаления).
 * node scripts/fix-channel-photos.mjs           — все PHOTO в канале
 * node scripts/fix-channel-photos.mjs 45 46 51   — конкретные id
 * node scripts/fix-channel-photos.mjs --dry-run
 */
import "dotenv/config";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname } from "path";
import { Blob } from "buffer";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const owner = parseInt(process.env.ADMIN_ID || process.env.OWNER_ID || "1775515654", 10);
const dryRun = process.argv.includes("--dry-run");
const idsArg = process.argv.slice(2).filter((x) => !x.startsWith("--")).map((x) => parseInt(x, 10)).filter(Boolean);

const siteUrl = (process.env.KINGMODE_SITE_URL || "https://arturkingfitness.com").replace(/\/$/, "");
const dmUser = (process.env.KINGMODE_DM_USERNAME || "arturking10").replace(/^@/, "");
const botUser = (process.env.BOT_USERNAME || "Raschettbot").replace(/^@/, "");

const keyboard = {
  inline_keyboard: [
    [
      { text: "🌐 Сайт", url: siteUrl },
      { text: "💬 Личка", url: `https://t.me/${dmUser}` },
      { text: "🤖 Бот", url: `https://t.me/${botUser}?start=kingmode` },
    ],
  ],
};

/** Старые посты канала (не из очереди CHANNEL_POSTS). */
const LEGACY_PHOTO = {
  6: "lifestyle",
  8: "show_up",
  9: "discipline",
  45: "data",
  46: "recovery",
  48: "plateau",
};

/** Короткие версии текста (старые посты до рерайта). */
const PREFIX_MAP = [
  ["раньше я тоже верил ощущениям", "data"],
  ["три ночи по 5 часов", "sleep"],
  ["упёрся в плато", "plateau"],
];

const ASSETS = join(process.cwd(), "assets", "channel");

const apiJson = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function postBody(post) {
  return post.parts?.length ? post.parts.join("\n\n") : post.body;
}

function matchPostId(caption) {
  const c = norm(caption);
  if (!c) return null;

  for (const [prefix, id] of PREFIX_MAP) {
    if (c.startsWith(prefix)) return id;
  }

  let best = null;
  let bestLen = 0;
  for (const post of CHANNEL_POSTS) {
    const body = norm(postBody(post));
    for (const n of [80, 60, 40, 30]) {
      const head = body.slice(0, n);
      const cap = c.slice(0, n);
      if (head.length < 20) continue;
      if (c.includes(head.slice(0, Math.min(35, head.length))) || head.includes(cap.slice(0, 35))) {
        if (head.length > bestLen) {
          bestLen = head.length;
          best = post.id;
        }
      }
    }
  }
  return best;
}

function assetPath(postId) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = join(ASSETS, postId + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

async function fetchChannelPhoto(messageId) {
  const r = await apiJson("forwardMessage", {
    chat_id: owner,
    from_chat_id: channel,
    message_id: messageId,
    disable_notification: true,
  });
  if (!r.ok) return null;
  const m = r.result;
  await apiJson("deleteMessage", { chat_id: owner, message_id: m.message_id });
  return m;
}

async function editPhoto(messageId, postId, caption) {
  const path = assetPath(postId);
  if (!path) return { ok: false, description: `no asset for ${postId}` };

  for (let attempt = 0; attempt < 5; attempt++) {
    const form = new FormData();
    form.append("chat_id", channel);
    form.append("message_id", String(messageId));
    form.append(
      "media",
      JSON.stringify({
        type: "photo",
        media: "attach://photo",
        caption: caption.slice(0, 1024),
      })
    );
    form.append("photo", new Blob([readFileSync(path)]), postId + extname(path));
    form.append("reply_markup", JSON.stringify(keyboard));

    const r = await fetch(`https://api.telegram.org/bot${token}/editMessageMedia`, {
      method: "POST",
      body: form,
    }).then((res) => res.json());

    if (r.ok) return r;
    const wait = r.parameters?.retry_after ?? (attempt + 1) * 3;
    if (r.error_code === 429) {
      console.log(`  rate limit, wait ${wait}s...`);
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    return r;
  }
  return { ok: false, description: "rate limit retries exceeded" };
}

async function scanPhotoIds(maxId = 120) {
  const out = [];
  for (let id = 1; id <= maxId; id++) {
    const m = await fetchChannelPhoto(id);
    if (!m?.photo?.length) continue;
    out.push({ messageId: id, caption: (m.caption || "").trim() });
    await new Promise((r) => setTimeout(r, 180));
  }
  return out;
}

if (!token) {
  console.error("BOT_TOKEN missing");
  process.exit(1);
}

let targets = [];
if (idsArg.length) {
  for (const messageId of idsArg) {
    const m = await fetchChannelPhoto(messageId);
    if (!m?.photo?.length) {
      console.log(`#${messageId}: not a photo, skip`);
      continue;
    }
    targets.push({ messageId, caption: (m.caption || "").trim() });
    await new Promise((r) => setTimeout(r, 200));
  }
} else {
  console.log("Scanning channel for photo posts...");
  targets = await scanPhotoIds(120);
}

console.log(`Found ${targets.length} photo posts\n`);

let ok = 0;
let skip = 0;
let fail = 0;

for (const { messageId, caption } of targets) {
  const postId = LEGACY_PHOTO[messageId] || matchPostId(caption);
  if (!postId) {
    console.log(`#${messageId}: no match — ${caption.slice(0, 50)}...`);
    skip++;
    continue;
  }
  const path = assetPath(postId);
  if (!path) {
    console.log(`#${messageId}: ${postId} — asset missing`);
    fail++;
    continue;
  }
  if (dryRun) {
    console.log(`#${messageId} → ${postId} (${path.split(/[/\\]/).pop()})`);
    ok++;
    continue;
  }
  const r = await editPhoto(messageId, postId, caption);
  if (r.ok) {
    console.log(`#${messageId} → ${postId}: OK`);
    ok++;
  } else {
    console.log(`#${messageId} → ${postId}: FAIL ${r.description}`);
    fail++;
  }
  await new Promise((res) => setTimeout(res, 1200));
}

console.log(`\nDone: ${ok} ok, ${skip} skip, ${fail} fail${dryRun ? " (dry-run)" : ""}`);
