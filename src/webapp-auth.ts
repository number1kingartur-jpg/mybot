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

/**
 * Короткоживущий токен для отдачи байт фото прогресса вне initData.
 *
 * `<img src>` не может нести заголовок X-Telegram-Init-Data, поэтому адрес
 * фото несёт подпись в самом себе. Секрет — тот же, что verifyInitData уже
 * выводит из токена бота (HMAC("WebAppData", botToken)): второй секрет заводить
 * незачем, он не даёт дополнительной защиты, только лишний путь ошибиться.
 */
const PHOTO_TOKEN_TTL_SEC = 15 * 60;

function webAppSecret(botToken: string): Buffer {
  return crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
}

export function signProgressPhotoToken(id: string, userId: number, botToken: string): string {
  const expiry = Math.floor(Date.now() / 1000) + PHOTO_TOKEN_TTL_SEC;
  const sig = crypto
    .createHmac("sha256", webAppSecret(botToken))
    .update(`${id}:${userId}:${expiry}`)
    .digest("hex");
  return `${userId}.${expiry}.${sig}`;
}

/** null — токен неверный или просроченный. Не редирект, не заглушка: явный отказ. */
export function verifyProgressPhotoToken(token: string, id: string, botToken: string): { userId: number } | null {
  if (!token || !botToken) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdRaw, expiryRaw, sig] = parts;
  const userId = Number(userIdRaw);
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiry) || expiry <= 0) return null;
  if (Math.floor(Date.now() / 1000) > expiry) return null;
  if (!/^[0-9a-f]{64}$/i.test(sig)) return null;

  const expected = crypto
    .createHmac("sha256", webAppSecret(botToken))
    .update(`${id}:${userId}:${expiry}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { userId };
}
