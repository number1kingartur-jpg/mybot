/**
 * Заменить фото в уже опубликованных постах @kingmode_fit (без удаления).
 * node scripts/fix-channel-photos.mjs           — все PHOTO в канале
 * node scripts/fix-channel-photos.mjs 45 46 51   — конкретные id
 * node scripts/fix-channel-photos.mjs --dry-run
 */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, extname, basename } from "path";
import { Blob } from "buffer";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";
import { CHANNEL_POSTS_ANALYSIS } from "../dist/channel/posts-analysis.js";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const owner = parseInt(process.env.ADMIN_ID || process.env.OWNER_ID || "1775515654", 10);
const dryRun = process.argv.includes("--dry-run");
const idsArg = process.argv
  .slice(2)
  .filter((x) => !x.startsWith("--"))
  .map((x) => parseInt(x, 10))
  .filter(Boolean);

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

/** Дубли текста (#55–58 = #51–54, #89 = плато) — другое фото, тот же смысл. */
const MSG_ASSET_ID = {
  55: "log_rule",
  56: "deload",
  57: "bands",
  58: "protein",
  89: "mini_cut",
  93: "dont_do_list",
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
  ["список того, что я не делаю", "dont_do_list"],
];

const ASSETS = join(process.cwd(), "assets", "channel");
const ALL_POSTS = [...CHANNEL_POSTS, ...CHANNEL_POSTS_ANALYSIS];

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
  for (const post of ALL_POSTS) {
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

function largestPhotoId(photoSizes) {
  return photoSizes.slice(-1)[0]?.file_unique_id ?? null;
}

/** Загрузить файл через sendPhoto в личку админа → получить file_id для editMessageMedia. */
async function uploadPhotoFileId(path) {
  const form = new FormData();
  form.append("chat_id", String(owner));
  form.append("photo", new Blob([readFileSync(path)]), basename(path));
  form.append("disable_notification", "true");

  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  }).then((res) => res.json());

  if (!r.ok) return { ok: false, description: r.description };

  const fileId = r.result.photo.slice(-1)[0].file_id;
  await apiJson("deleteMessage", { chat_id: owner, message_id: r.result.message_id });
  return { ok: true, fileId };
}

async function editPhoto(messageId, postId, caption) {
  const path = assetPath(postId);
  if (!path) return { ok: false, description: `no asset for ${postId}` };

  const beforeMsg = await fetchChannelPhoto(messageId);
  if (!beforeMsg?.photo?.length) {
    return { ok: false, description: "cannot read current photo" };
  }
  const beforeUid = largestPhotoId(beforeMsg.photo);

  for (let attempt = 0; attempt < 5; attempt++) {
    const up = await uploadPhotoFileId(path);
    if (!up.ok) return up;

    const r = await apiJson("editMessageMedia", {
      chat_id: channel,
      message_id: messageId,
      media: JSON.stringify({
        type: "photo",
        media: up.fileId,
        caption: caption.slice(0, 1024),
      }),
      reply_markup: keyboard,
    });

    if (r.ok) {
      await new Promise((res) => setTimeout(res, 1500));
      const afterMsg = await fetchChannelPhoto(messageId);
      const afterUid = largestPhotoId(afterMsg?.photo);
      if (afterUid && afterUid !== beforeUid) {
        return { ok: true, changed: true, beforeUid, afterUid };
      }
      return {
        ok: true,
        unchanged: true,
        description: `already has this photo (${beforeUid})`,
      };
    }

    if (r.description?.includes("message is not modified")) {
      return {
        ok: true,
        unchanged: true,
        description: "already has this photo (telegram dedup)",
      };
    }

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
let unchanged = 0;

for (const { messageId, caption } of targets) {
  const postId = LEGACY_PHOTO[messageId] || matchPostId(caption);
  if (!postId) {
    console.log(`#${messageId}: no match — ${caption.slice(0, 50)}...`);
    skip++;
    continue;
  }
  const assetId = MSG_ASSET_ID[messageId] || postId;
  const path = assetPath(assetId);
  if (!path) {
    console.log(`#${messageId}: ${assetId} — asset missing`);
    fail++;
    continue;
  }
  if (dryRun) {
    const tag = assetId !== postId ? `${postId}→${assetId}` : postId;
    console.log(`#${messageId} → ${tag} (${path.split(/[/\\]/).pop()})`);
    ok++;
    continue;
  }
  const r = await editPhoto(messageId, assetId, caption);
  const tag = assetId !== postId ? `${postId}→${assetId}` : postId;
  if (r.ok && r.changed) {
    console.log(`#${messageId} → ${tag}: OK (photo changed)`);
    ok++;
  } else if (r.unchanged) {
    console.log(`#${messageId} → ${tag}: UNCHANGED — ${r.description}`);
    unchanged++;
  } else {
    console.log(`#${messageId} → ${tag}: FAIL ${r.description}`);
    fail++;
  }
  await new Promise((res) => setTimeout(res, 1200));
}

console.log(
  `\nDone: ${ok} changed, ${unchanged} unchanged, ${skip} skip, ${fail} fail${dryRun ? " (dry-run)" : ""}`
);
