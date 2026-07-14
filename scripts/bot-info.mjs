import "dotenv/config";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("NO_TOKEN");
  process.exit(1);
}

const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
if (!me.ok) {
  console.error("GETME_FAIL", me.description);
  process.exit(1);
}
console.log("USERNAME=" + me.result.username);

const chat = await fetch(
  `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent("@kingmode_fit")}`
).then((r) => r.json());
console.log("CHAT_OK=" + (chat.ok ? "1" : "0"));
if (!chat.ok) console.log("CHAT_ERR=" + (chat.description ?? "unknown"));
