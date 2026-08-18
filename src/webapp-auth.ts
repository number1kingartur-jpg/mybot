import crypto from "crypto";

/**
 * Проверка подлинности запроса из Telegram Mini App.
 *
 * Telegram подписывает initData ключом, производным от токена бота. Без этой проверки
 * любой мог бы отправить чужой chatId и читать/писать чужой дневник питания.
 * Алгоритм — из документации Telegram: secret = HMAC("WebAppData", botToken),
 * затем сверяем HMAC(secret, data_check_string) с полем hash.
 */

export interface WebAppUser {
  id: number;
  firstName: string;
  username?: string;
}

const MAX_AGE_SEC = 24 * 60 * 60; // сутки: дольше живой сессии Mini App не бывает

export function verifyInitData(initData: string, botToken: string): WebAppUser | null {
  if (!initData || !botToken) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  // Строго 64 hex-символа: Buffer.from(x, "hex") молча отбрасывает лишнее,
  // и "…hash + мусор" декодировался бы в те же байты
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;

  // Исключается только hash. Поле signature (Bot API 7.2+) — обычное поле и
  // входит в проверяемую строку: без него хеш расходится с телеграмовским на
  // каждой настоящей подписи с телефона. Исключать signature нужно лишь при
  // сторонней проверке по Ed25519, которой здесь нет.
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SEC) return null;

  const rawUser = params.get("user");
  if (!rawUser) return null;

  try {
    const u = JSON.parse(rawUser) as { id?: number; first_name?: string; username?: string };
    if (!u.id || !Number.isFinite(u.id)) return null;
    return {
      id: Number(u.id),
      firstName: String(u.first_name ?? "").slice(0, 64),
      username: u.username ? String(u.username).slice(0, 64) : undefined,
    };
  } catch {
    return null;
  }
}
