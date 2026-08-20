/**
 * Проверка замка Mini App: кто считается участником и какая ссылка на вход.
 * Живой Telegram здесь не дергаем: без админа в чате ответ был бы ложью.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ACCESS = pathToFileURL(path.resolve("dist/access.js")).href;

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failed++;
  console.error(`ПРОВАЛ: ${name}${detail ? ` → ${detail}` : ""}`);
}

function run(env, body) {
  const code = `const a = await import(${JSON.stringify(ACCESS)});\n${body}`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
  return {
    ok: r.status === 0,
    out: (r.stdout ?? "").trim(),
    err: (r.stderr ?? "").trim(),
  };
}

const a = await import(ACCESS);

check("creator in", a.isMemberStatus("creator") === true);
check("admin in", a.isMemberStatus("administrator") === true);
check("member in", a.isMemberStatus("member") === true);
check("restricted in", a.isMemberStatus("restricted") === true);
check("left out", a.isMemberStatus("left") === false);
check("kicked out", a.isMemberStatus("kicked") === false);
check("empty out", a.isMemberStatus(undefined) === false);

check(
  "api member",
  a.parseMemberApi({ ok: true, result: { status: "member" } }) === true
);
check(
  "api left",
  a.parseMemberApi({ ok: true, result: { status: "left" } }) === false
);
check("api fail", a.parseMemberApi({ ok: false }) === false);

check(
  "url @name",
  a.joinUrl("@kingmode_fit") === "https://t.me/kingmode_fit"
);
check(
  "url invite wins",
  a.joinUrl("-1001", "https://t.me/+abc") === "https://t.me/+abc"
);
check("url numeric none", a.joinUrl("-100123") === undefined);

const off = run({ ACCESS_GATE: "0", ACCESS_CHAT_ID: "@kingmode_fit" }, `console.log(a.accessEnabled())`);
check("gate 0 off", off.ok && off.out === "false", off.err);

const byChat = run(
  { ACCESS_GATE: "", ACCESS_CHAT_ID: "@kingmode_fit", TELEGRAM_CHANNEL_ID: "@other" },
  `console.log(a.accessEnabled() + " " + a.accessChatId() + " " + a.accessChatKind())`
);
check("chat id on", byChat.ok && byChat.out === "true @kingmode_fit channel", byChat.out + byChat.err);

const flag = run(
  { ACCESS_GATE: "1", ACCESS_CHAT_ID: "", TELEGRAM_CHANNEL_ID: "@kingmode_fit" },
  `console.log(a.accessEnabled() + " " + a.accessChatId())`
);
check("flag uses channel", flag.ok && flag.out === "true @kingmode_fit", flag.out);

const idle = run(
  { ACCESS_GATE: "", ACCESS_CHAT_ID: "", TELEGRAM_CHANNEL_ID: "" },
  `console.log(a.accessEnabled() + " " + a.accessChatId() + " " + a.accessChatKind())`
);
check("default channel", idle.ok && idle.out === "true @kingmode_fit channel", idle.out);

const group = run(
  { ACCESS_CHAT_ID: "-1001234567890", ACCESS_CHAT_KIND: "", ACCESS_CHAT_TITLE: "KINGMODE" },
  `const b = a.joinBody(); console.log(a.accessChatKind() + "|" + b.kind + "|" + String(b.url || "") + "|" + b.message)`
);
check(
  "numeric is group, no url",
  group.ok && group.out.startsWith("group|group||Сначала вступи в группу KINGMODE."),
  group.out
);

if (failed) {
  console.error(`check-access: ${failed} провал(а)`);
  process.exit(1);
}
console.log("check-access: ок");
