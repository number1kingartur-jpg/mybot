import crypto from "crypto";
import fs from "fs";
import http from "http";
import path from "path";
import { verifyInitData, signProgressPhotoToken, verifyProgressPhotoToken, type WebAppUser } from "./webapp-auth";
import { accessEnabled, accessChatId, checkAccess } from "./access";
import { beginPhoto, clientIp, endPhoto, resolveUnder, safeJson, take, PROGRESS_PHOTO_MAX_COUNT, PROGRESS_PHOTO_MAX_BYTES, beginProgressPhotoUpload, endProgressPhotoUpload } from "./guard";
import {
  registerUser, getUser, updateUser, setNutrition,
  addMeal, removeMeal, scaleMeal, getMeals, getMeal, mealTotals, mealStreak, frequentMeals, progressSnapshot,
  addBodyweight, getBodyweight, removeBodyweight,
  addWater, getWater, waterTargetMl,
  addWorkout, getAllWorkouts, getWorkouts, checkPr, lastLogs, cleanWorkoutMemo, getMealsForDays,
  saveProgram, getActiveProgram, advanceProgramDay,
  photoGate, bumpPhotoCount, mealPhotoUnlimited, trialMode, freePhotoWeek, isPremium, isOwner,
  addProgressPhoto, listProgressPhotos, getProgressPhoto, deleteProgressPhoto, progressPhotoUsage, progressPhotoDir,
  type NutritionProfile, type Lift, type Program, type ProgressPhotoEntry,
} from "./db";
import {
  analyzeMealPhoto, analyzeMealText, editMeal, isCompleteShake, mealFromHistory, mealPartLines,
  mealVisionEnabled, mergeShakeFromUsual, MealPhotoUnreadableError,
} from "./meal";
import { lastCompleteShake, resolveUsualShakeMeal, usualShakeBrief } from "./meal-shake";
import { dropPending, latestPending, peekPending, putPending, takePending, updatePending } from "./pending";
import { FOODS, imageSlug, macrosFromItems, matchFood, resolveMealThumb } from "./foods";
import { hasFoodImage } from "./food-images";
import { publicMealPhoto, readMealThumb, saveMealThumb } from "./meal-thumbs";
import { bangkokHour, sameAsAllSlots, shiftDate, slotByHour, splitOffer } from "./meal-same";
import { calc531, calcGzclp } from "./calc/templates";
import { calculatePeriodization, type Goal, type PeriodizationModel, type GenResult } from "./calc/periodization";
import { parseSplit, plansForProgram, splitLevel, type Place, type SplitId } from "./simple";
import { adaptiveTarget } from "./nutrition";

/**
 * HTTP-сервер бота: раздаёт Mini App и обслуживает его запросы.
 *
 * Зачем он вообще нужен: анализ фото еды идёт через ключ Gemini, который нельзя
 * положить в клиентский код, а Telegram `sendData` передаёт максимум 4 КБ текста —
 * фотография туда не влезет. Поэтому приложение говорит с ботом по HTTP,
 * а подлинность пользователя подтверждается подписью initData (см. webapp-auth.ts).
 *
 * Дневник питания общий с чатом: и фото из бота, и фото из приложения пишутся
 * в одну таблицу `meals`.
 */

const WEBAPP_DIR = path.join(__dirname, "..", "webapp");

function resolveSimple(
  u: ReturnType<typeof getUser>,
  body?: { place?: string; level?: string; split?: string }
) {
  const place: Place =
    body?.place === "gym" ? "gym" : body?.place === "home" ? "home" : u?.simplePlace === "gym" ? "gym" : "home";
  const levelGuess =
    body?.level === "train" || body?.level === "start"
      ? body.level
      : u?.simpleLevel === "train" || u?.simpleLevel === "start"
        ? u.simpleLevel
        : u?.nutrition?.activity === "high"
          ? "train"
          : "start";
  const split = parseSplit(body?.split ?? u?.simpleSplit, levelGuess);
  const level = splitLevel(split);
  return { place, level, split, plan: plansForProgram(place, split), idx: u?.simpleIdx ?? 0 };
}

/**
 * Метка версии: время последней правки кода — и приложения, и сервера.
 * Подставляется в адреса файлов в index.html, поэтому после деплоя устройство
 * физически не может отдать старый код из кэша — адрес другой. Заодно видна
 * в подвале приложения и в /health: по ней сверяется, та ли версия открыта.
 *
 * Серверный `dist` учитывается наравне с js/css не ради кэша, а ради этой сверки.
 * Пока считалось только по js/css, серверная починка (разбор фото) метку не
 * двигала: снимок экрана показывал старый номер при новом коде, и вопрос
 * «выложено или нет» приходилось решать раскопками в логах вместо одного взгляда.
 */
const BUILD_ID = (() => {
  try {
    let newest = 0;
    const dirs = [path.join(WEBAPP_DIR, "js"), path.join(WEBAPP_DIR, "css"), __dirname];
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        const st = fs.statSync(path.join(d, f));
        if (st.isFile() && st.mtimeMs > newest) newest = st.mtimeMs;
      }
    }
    return newest ? String(Math.round(newest / 1000)) : String(Math.round(Date.now() / 1000));
  } catch {
    return String(Math.round(Date.now() / 1000));
  }
})();
// Сжатый кадр — сотни КБ. Запас нужен для запасного пути: если снимок не удалось
// сжать на устройстве (HEIC с iPhone), уходит оригинал до 6 МБ, а base64 раздувает
// его примерно на 37% — 8 МБ уже не хватало.
const MAX_BODY = 12 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
};

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function mealHour(date: string): number | undefined {
  return date === today() ? bangkokHour() : undefined;
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Пн = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Отказ распознавания в текст для человека. Разные причины — разные действия:
 * «еду вижу, цифры не собрал» решается правкой текста, «еды на кадре нет» —
 * новым снимком. Один общий совет «сними ближе» на второе не работает.
 */
function photoFailMessage(e: MealPhotoUnreadableError): string {
  if (e.seen) return `Вижу: ${e.seen}. В цифры не перевёл — проверь и запиши текстом.`;
  if (e.reason === "not_food") {
    return e.saw
      ? `На кадре еды не вижу: ${e.saw}. Сфотографируй тарелку или упаковку.`
      : "На кадре еды не вижу. Сфотографируй тарелку или упаковку.";
  }
  return "Не разобрал, что на фото. Сними ближе и при свете или добавь текстом.";
}

function drain(req: http.IncomingMessage): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  req.resume();
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const cl = Number(req.headers["content-length"]);
  if (Number.isFinite(cl) && cl > MAX_BODY) throw new Error("payload_too_large");
  return safeJson(await readBody(req));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        if (!over) {
          over = true;
          chunks.length = 0; // держать в памяти уже нечего
          reject(new Error("payload_too_large"));
        }
        // Остаток сливаем, а не рвём соединение сразу: при разрыве клиент видит
        // сетевую ошибку и делает вывод «сервер лежит» вместо честной причины.
        // Совсем бесконечную загрузку всё же обрываем.
        if (size > MAX_BODY * 3) req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Приложение может жить на другом домене (GitHub Pages) — CORS нужен, куки не используются. */
function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function auth(req: http.IncomingMessage, botToken: string): WebAppUser | null {
  const raw = req.headers["x-telegram-init-data"];
  const initData = Array.isArray(raw) ? raw[0] : raw;
  // Отказ авторизации логируем без самой подписи: иначе по молчащему приложению
  // невозможно понять, дошёл ли запрос и почему не был принят
  if (!initData) {
    console.warn(`api auth: нет подписи, ${req.method} ${req.url}`);
    return null;
  }
  if (initData.length > 8192) {
    console.warn(`api auth: подпись слишком длинная (${initData.length}), ${req.method} ${req.url}`);
    return null;
  }
  const user = verifyInitData(initData, botToken);
  if (!user) {
    console.warn(`api auth: подпись не принята (${initData.length} симв.), ${req.method} ${req.url}`);
    return null;
  }
  return user;
}

function photoQuota(userId: number) {
  const wk = weekKey(today());
  const u = getUser(userId);
  const used = u?.photoWeekKey === wk ? u?.photoCount ?? 0 : 0;
  const unlimited = mealPhotoUnlimited() || isPremium(userId);
  return {
    unlimited,
    trial: trialMode(),
    left: unlimited ? null : Math.max(0, freePhotoWeek() - used),
    limit: freePhotoWeek(),
  };
}

/** Карточка фото прогресса для клиента: без пути на диске, с подписанным адресом байт. */
function publicProgressPhoto(row: ProgressPhotoEntry, botToken: string) {
  return {
    id: row.id,
    date: row.date,
    angle: row.angle,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    url: `/api/progress/photo/${row.id}?token=${signProgressPhotoToken(row.id, row.userId, botToken)}`,
  };
}

/** Текущая тренировка активной программы: то же, что бот показывает в «📋 Программа». */
function currentSession(prog: Program) {
  const week = prog.weeksData.find((w) => w.week === prog.currentWeek);
  return week?.sessions.find((s) => s.day === prog.currentDay) ?? null;
}

function programState(userId: number) {
  const prog = getActiveProgram(userId);
  if (!prog) return null;
  return {
    model: prog.model,
    goal: prog.goal,
    weeks: prog.weeks,
    daysPerWeek: prog.daysPerWeek,
    currentWeek: prog.currentWeek,
    currentDay: prog.currentDay,
    lifts: prog.lifts ?? [],
    peakWeek: prog.peakWeek,
    deloadWeek: prog.deloadWeek,
    session: currentSession(prog),
  };
}

/** Вода за день: факт и ориентир. Ориентир считается от свежего веса, а не от анкеты. */
function waterState(userId: number, date: string) {
  const u = getUser(userId);
  const last = getBodyweight(userId, 1)[0];
  const kg = last?.weightKg ?? u?.nutrition?.weightKg ?? 0;
  return {
    ml: getWater(userId, date),
    targetMl: waterTargetMl(kg),
    basedOnKg: kg || null,
  };
}

function looksLikeShakeName(name: string): boolean {
  const n = name.toLowerCase();
  return /^коктейль\b/.test(n)
    || (/протеин|гейнер|белок яичн|жидк/.test(n) && /банан|овсян|арахис|молок|креатин|и ещё/.test(n));
}

function withUsualShake(userId: number, meal: ReturnType<typeof mealFromHistory>) {
  const usual = resolveUsualShakeMeal(userId);
  if (!meal.parts?.length && looksLikeShakeName(meal.name) && usual?.parts?.length) {
    return { ...usual, photoUrl: meal.photoUrl ?? usual.photoUrl };
  }
  return mergeShakeFromUsual(meal, usual?.parts);
}

function dayState(userId: number, date: string) {
  const u = getUser(userId);
  const weights = getBodyweight(userId, 60);
  const lastKg = weights.filter((b) => b.source !== "profile").at(-1)?.weightKg
    ?? weights.at(-1)?.weightKg
    ?? u?.nutrition?.weightKg;
  const meals21 = getMealsForDays(userId, 21).map((m) => ({ date: m.date, kcal: m.kcal }));
  return {
    date,
    today: today(),
    firstName: u?.firstName ?? "",
    nutrition: u?.nutrition ?? null,
    water: waterState(userId, date),
    meals: getMeals(userId, date).map((m) => ({
      id: m.id,
      name: m.name,
      kcal: m.kcal,
      proteinG: m.proteinG,
      fatG: m.fatG,
      carbsG: m.carbsG,
      slug: resolveMealThumb(m.name, m.slug),
      photoUrl: publicMealPhoto(m.photoUrl),
      parts: m.parts,
    })),
    totals: mealTotals(userId, date),
    // Серия и частые блюда считаются всегда от сегодняшнего дня, а не от
    // открытого в календаре: это состояние человека, а не свойство даты
    streak: mealStreak(userId, today()),
    progress: progressSnapshot(userId, today()),
    frequent: frequentMeals(userId, today()),
    usualShake: usualShakeBrief(userId),
    mealRemind: { on: !u?.mealRemindPaused, hours: [8, 13, 19] },
    sameAs:
      date === today()
        ? (() => {
            const yesterday = getMeals(userId, shiftDate(date, -1));
            const todayMeals = getMeals(userId, date);
            const slots = sameAsAllSlots(yesterday, todayMeals).map((same) => {
              const meals = same.meals.map((m) => {
                const full = mealFromHistory(m);
                return {
                  ...m,
                  slug: resolveMealThumb(m.name, m.slug),
                  parts: full.parts ?? m.parts,
                };
              });
              return { ...same, meals, units: splitOffer(meals, same.slot) };
            });
            const hour = bangkokHour();
            const current =
              slots.find((s) => s.slot === slotByHour(hour)) ?? slots[0] ?? null;
            if (!current && !slots.length) return null;
            return { ...current, slots };
          })()
        : null,
    photo: photoQuota(userId),
    visionEnabled: mealVisionEnabled(),
    // Всё остальное состояние человека — одним ответом, чтобы приложение не делало
    // пять запросов на старте
    bodyweight: getBodyweight(userId, 60).map((b) => ({
      date: b.date,
      weightKg: b.weightKg,
      source: b.source === "profile" ? "profile" : "user",
    })),
    program: programState(userId),
    simple: (() => {
      const s = resolveSimple(u);
      return { idx: s.idx, place: s.place, level: s.level, split: s.split };
    })(),
    targets: u?.nutrition
      ? adaptiveTarget(
          u.nutrition,
          lastKg,
          meals21,
          weights.map((b) => ({ date: b.date, weightKg: b.weightKg }))
        )
      : null,
    lastLifts: lastLogs(userId),
    workoutsTotal: getAllWorkouts(userId).length,
    workoutsRecent: getWorkouts(userId, undefined, 12)
      .slice()
      .reverse()
      .map((w) => ({
        date: w.date,
        name: w.exercise,
        kg: w.weightKg,
        reps: w.reps,
        sets: w.sets,
        volume: w.log ? w.log.reduce((s, x) => s + x.kg * x.reps, 0) : w.weightKg * w.reps * w.sets,
        memo: cleanWorkoutMemo(w.notes),
      })),
    restDate: u?.restDate && u.restDate === today() ? u.restDate : null,
    pending: (() => {
      const live = latestPending(userId);
      if (!live) return null;
      return {
        token: live.token,
        meal: live.pending.meal,
        parts: mealPartLines(live.pending.meal),
      };
    })(),
  };
}

const MODELS = new Set(["531", "gzclp", "dup", "linear", "wave"]);
const GOALS = new Set<Goal>(["strength", "hypertrophy", "strength_hypertrophy"]);

type BuiltProgram = { model: string; goal: Goal; lifts: Lift[]; result: GenResult };

/**
 * Программу строит сервер тем же кодом, что бот: приложение присылает только ввод.
 * Иначе достаточно подменить запрос, чтобы в базе оказался план с любыми весами.
 */
function buildProgramFromRequest(body: Record<string, unknown>): BuiltProgram | { error: string; message: string } {
  const model = String(body.model ?? "");
  if (!MODELS.has(model)) return { error: "bad_model", message: "Неизвестная модель программы." };

  const goalRaw = String(body.goal ?? "strength") as Goal;
  const goal: Goal = GOALS.has(goalRaw) ? goalRaw : "strength";

  const weeks = Math.round(Number(body.weeks));
  if (!(weeks >= 4 && weeks <= 16)) return { error: "bad_weeks", message: "Недель: от 4 до 16." };

  const rawLifts = Array.isArray(body.lifts) ? body.lifts : [];
  if (!(rawLifts.length >= 1 && rawLifts.length <= 6)) {
    return { error: "bad_lifts", message: "Движений: от 1 до 6." };
  }
  const lifts: Lift[] = [];
  for (const item of rawLifts) {
    const l = item as Record<string, unknown>;
    const name = String(l.name ?? "").trim().slice(0, 40);
    const oneRmKg = Number(l.oneRmKg);
    if (!name) return { error: "bad_lifts", message: "У движения нет названия." };
    if (!(oneRmKg >= 1 && oneRmKg <= 500)) {
      return { error: "bad_lifts", message: "1ПМ: от 1 до 500 кг." };
    }
    lifts.push({ name, oneRmKg: Math.round(oneRmKg * 10) / 10 });
  }

  const input = { lifts, weeks, goal };
  const result =
    model === "531"
      ? calc531(input)
      : model === "gzclp"
      ? calcGzclp(input)
      : calculatePeriodization({ ...input, model: model as PeriodizationModel });

  return { model, goal, lifts, result };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Дата из запроса: только формат YYYY-MM-DD, не будущее и не глубже 400 дней. */
function safeDate(raw: string | null): string | null {
  if (!raw) return null;
  if (!ISO_DATE.test(raw)) return null;
  const t = Date.parse(raw + "T00:00:00Z");
  if (!Number.isFinite(t)) return null;
  const now = Date.parse(today() + "T00:00:00Z");
  if (t > now) return null;
  if (now - t > 400 * 86400000) return null;
  return raw;
}

function validProfile(x: unknown): NutritionProfile | null {
  if (!x || typeof x !== "object") return null;
  const p = x as Record<string, unknown>;
  const sex = p.sex === "f" ? "f" : "m";
  const goal = p.goal === "bulk" || p.goal === "cut" ? p.goal : "maint";
  const activity = p.activity === "low" || p.activity === "high" ? p.activity : "mid";
  const age = Number(p.age);
  const heightCm = Number(p.heightCm);
  const weightKg = Number(p.weightKg);
  if (!(age >= 14 && age <= 90)) return null;
  if (!(heightCm >= 120 && heightCm <= 230)) return null;
  if (!(weightKg >= 30 && weightKg <= 250)) return null;
  return { sex, goal, activity, age, heightCm, weightKg: Math.round(weightKg * 10) / 10 };
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string): void {
  if (urlPath.startsWith("/img/meal/")) {
    const shot = readMealThumb(urlPath);
    if (!shot) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": shot.mime,
      "Content-Length": shot.buf.length,
      "Cache-Control": "public, max-age=604800",
    });
    res.end(shot.buf);
    return;
  }
  const full = resolveUnder(WEBAPP_DIR, urlPath, path);
  if (!full) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }

  const ext = path.extname(full).toLowerCase();
  if (!MIME[ext]) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }
  const isAsset = ext === ".png" || ext === ".jpg" || ext === ".webp" || ext === ".svg" || ext === ".ico";
  // Картинки блюд не меняются: имя файла считается из названия продукта. Неделя
  // кэша важнее суток — в справочнике их сотня, и на мобильной сети каждый
  // повторный заход иначе тянет их заново.
  const maxAge = urlPath.startsWith("/img/food/") || urlPath.startsWith("/img/ex/") || urlPath.startsWith("/video/ex/") ? 604800 : 86400;

  // WebView Telegram держит старый js даже при no-cache — на iOS это проверено
  // на живом устройстве: правка была в сети, а на экране оставалась прошлая
  // версия. Заголовкам верить нельзя, поэтому у файлов меняется сам адрес.
  if (ext === ".html") {
    console.log(`app open: ${urlPath}${req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
    let html = fs.readFileSync(full, "utf-8");
    html = html.replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, `$1="$2?v=${BUILD_ID}"`);
    const body = Buffer.from(html, "utf-8");
    res.writeHead(200, {
      "Content-Type": MIME[ext],
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  const headers: http.OutgoingHttpHeaders = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": isAsset || ext === ".mp4" ? `public, max-age=${maxAge}` : "no-cache",
  };
  if (ext === ".mp4") {
    const stat = fs.statSync(full);
    const range = req.headers.range;
    const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
    if (match) {
      const start = Math.min(Math.max(0, Number(match[1]) || 0), stat.size);
      const end = match[2] ? Math.min(Number(match[2]) || 0, stat.size - 1) : stat.size - 1;
      if (!(start <= end) || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(full, { start, end }).pipe(res);
      return;
    }
    headers["Content-Length"] = stat.size;
    headers["Accept-Ranges"] = "bytes";
  }
  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}

/**
 * Байты фото прогресса. Авторизация не через initData (её тут негде передать),
 * а через короткоживущий подписанный токен из адреса. Просроченная или неверная
 * подпись — 403, явный отказ, не редирект и не тихая заглушка.
 */
function serveProgressPhoto(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rawId: string,
  query: URLSearchParams,
  botToken: string
): void {
  const id = decodeURIComponent(rawId);
  const token = query.get("token") ?? "";
  const verified = verifyProgressPhotoToken(token, id, botToken);
  if (!verified) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("forbidden");
    return;
  }
  // Токен доказывает подлинность userId внутри себя (подписан секретом сервера),
  // но запись всё равно ищем через getProgressPhoto с этим userId: чужая
  // запись недоступна, даже если бы токен был подделан для чужого id.
  const row = getProgressPhoto(verified.userId, id);
  if (!row || !fs.existsSync(row.path)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }
  try {
    const buf = fs.readFileSync(row.path);
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": buf.length,
      // Личное фото тела: не кэшируется публично, и ссылка живёт 15 минут.
      "Cache-Control": "private, no-store",
    });
    res.end(buf);
  } catch (e) {
    console.error("progress photo read:", e instanceof Error ? e.message : String(e));
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("server error");
  }
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlPath: string,
  query: URLSearchParams,
  botToken: string
): Promise<void> {
  const user = auth(req, botToken);
  if (!user) {
    drain(req);
    if (!take(`fail:${clientIp(req)}`, 30, 60_000)) {
      json(res, 429, { error: "slow_down", message: "Слишком часто. Подожди минуту." });
      return;
    }
    json(res, 401, { error: "unauthorized", message: "Открой приложение из Telegram." });
    return;
  }
  if (!isOwner(user.id) && !take(`api:${user.id}`, 90, 60_000)) {
    drain(req);
    json(res, 429, { error: "slow_down", message: "Слишком часто. Подожди минуту." });
    return;
  }
  const gate = await checkAccess({
    userId: user.id,
    botToken,
    owner: isOwner(user.id),
    refresh: query.get("access") === "1",
  });
  if (!gate.ok) {
    drain(req);
    console.log(`api ${req.method} ${urlPath} user=${user.id} join-gate`);
    json(res, 403, gate.body);
    return;
  }
  // В базу только после замка: иначе в дневнике копятся люди, которым вход закрыт.
  registerUser(user.id, user.firstName);
  // Один запрос — одна строка. Пустой лог раньше не отличал «приложение молчит»
  // от «приложение работает»: жалобу нечем было проверить.
  console.log(`api ${req.method} ${urlPath} user=${user.id}`);
  const date = today();

  if (req.method === "GET" && urlPath === "/api/state") {
    json(res, 200, dayState(user.id, safeDate(query.get("date")) ?? date));
    return;
  }

  // ── Вес тела: один дневник с чатом ────────────────────────────────────────
  if (req.method === "POST" && urlPath === "/api/bodyweight") {
    const body = await readJson(req) as { weightKg?: number; date?: string };
    const w = Number(body.weightKg);
    if (!(w >= 30 && w <= 250)) {
      json(res, 400, { error: "bad_weight", message: "Вес: от 30 до 250 кг." });
      return;
    }
    // Пустая дата — сегодня; заданная, но негодная (будущее, мусор) — отказ,
    // иначе запись молча уехала бы не в тот день
    const raw = body.date == null ? "" : String(body.date);
    const day = raw ? safeDate(raw) : date;
    if (!day) {
      json(res, 400, { error: "bad_date", message: "Дата должна быть не в будущем." });
      return;
    }
    const kg = Math.round(w * 10) / 10;
    addBodyweight(user.id, kg, day);
    // Свежий вес идёт и в профиль питания: иначе норма считается по старой цифре
    const u = getUser(user.id);
    if (u?.nutrition && day === date) setNutrition(user.id, { ...u.nutrition, weightKg: kg });
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  if (req.method === "DELETE" && urlPath === "/api/bodyweight") {
    const day = safeDate(query.get("date"));
    if (!day) {
      json(res, 400, { error: "bad_date" });
      return;
    }
    const ok = removeBodyweight(user.id, day);
    json(res, ok ? 200 : 404, { ok, ...dayState(user.id, date) });
    return;
  }

  // ── Вода ──────────────────────────────────────────────────────────────────
  // Приходит объём порции, а не итог за день: клиент не должен уметь переписать
  // сумму, иначе двойное нажатие или старый экран затрут уже выпитое.
  if (req.method === "POST" && urlPath === "/api/water") {
    const body = await readJson(req) as { ml?: number; date?: string };
    const ml = Number(body.ml);
    if (!Number.isFinite(ml) || ml === 0 || Math.abs(ml) > 3000) {
      json(res, 400, { error: "bad_ml", message: "Порция: от 1 до 3000 мл." });
      return;
    }
    // Вода пишется только в сегодня: прошлый день в «Съедено» — просмотр еды,
    // а не правка выпитого. Иначе +250 с главного уезжало во вчера.
    addWater(user.id, Math.round(ml), date);
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  // ── Программа: считается на сервере кодом бота, чтобы цифры не разошлись ──
  if (req.method === "POST" && urlPath === "/api/program") {
    const body = await readJson(req) as Record<string, unknown>;
    const built = buildProgramFromRequest(body);
    if ("error" in built) {
      json(res, 400, built);
      return;
    }
    const { model, goal, lifts, result } = built;
    saveProgram({
      userId: user.id,
      model, goal,
      oneRmKg: lifts[0].oneRmKg,
      lifts,
      weeks: result.weeks.length,
      daysPerWeek: lifts.length,
      weeksData: result.weeks,
      peakWeek: result.peakWeek,
      deloadWeek: result.deloadWeek,
      currentWeek: 1,
      currentDay: 1,
      active: true,
    });
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/program/done") {
    const prog = getActiveProgram(user.id);
    if (!prog) {
      json(res, 404, { error: "no_program", message: "Активной программы нет." });
      return;
    }
    const session = currentSession(prog);
    let pr: { kind: "weight" | "e1rm"; value: number } | null = null;
    if (session) {
      // Фокус выглядит как «Присед · тяжёлый день» — в дневник пишем чистое имя
      // движения, иначе рекорды считаются по разным строкам
      const liftName = session.focus.split("·")[0].trim() || session.focus;
      const check = checkPr(user.id, liftName, session.weightKg, session.reps);
      addWorkout({
        userId: user.id, date,
        exercise: liftName,
        sets: session.sets,
        reps: session.reps,
        weightKg: session.weightKg,
        notes: `${prog.model} W${prog.currentWeek}D${prog.currentDay}`,
      });
      if (check.isWeightPr) pr = { kind: "weight", value: session.weightKg };
      else if (check.isE1rmPr) pr = { kind: "e1rm", value: check.e1rm };
    }
    updateUser(user.id, { restDate: "" });
    const updated = advanceProgramDay(user.id);
    json(res, 200, {
      ok: true,
      pr,
      finished: !updated || !updated.active,
      ...dayState(user.id, date),
    });
    return;
  }

  // Журнал подходов: одна запись на движение, в ней фактические подходы.
  if (req.method === "POST" && urlPath === "/api/workout/log") {
    const body = await readJson(req) as {
      place?: string;
      level?: string;
      split?: string;
      lifts?: { name?: string; memo?: string; sets?: { kg?: number; reps?: number }[] }[];
    };
    const raw = Array.isArray(body.lifts) ? body.lifts : [];
    if (!raw.length || raw.length > 12) {
      json(res, 400, { error: "bad_lifts", message: "Нужен хотя бы один подход." });
      return;
    }
    const written: string[] = [];
    let prs = 0;
    let volume = 0;
    for (const lift of raw) {
      const name = String(lift.name || "").trim().slice(0, 80);
      const sets = (Array.isArray(lift.sets) ? lift.sets : [])
        .map((s) => ({
          kg: Math.max(0, Math.min(500, Math.round(Number(s.kg) * 10) / 10)),
          reps: Math.max(1, Math.min(100, Math.round(Number(s.reps)))),
        }))
        .filter((s) => Number.isFinite(s.kg) && Number.isFinite(s.reps));
      if (!name || !sets.length) continue;
      const best = sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
      const check = checkPr(user.id, name, best.kg, best.reps);
      addWorkout({
        userId: user.id,
        date,
        exercise: name,
        sets: sets.length,
        reps: best.reps,
        weightKg: best.kg,
        notes: cleanWorkoutMemo(lift.memo) ?? "log",
        log: sets,
      });
      if (check.isWeightPr || check.isE1rmPr) prs++;
      volume += sets.reduce((s, x) => s + x.kg * x.reps, 0);
      written.push(name);
    }
    if (!written.length) {
      json(res, 400, { error: "empty", message: "Нужен хотя бы один подход." });
      return;
    }
    const u = getUser(user.id);
    const s = resolveSimple(u, body);
    const { place, level, split, plan, idx } = s;
    updateUser(user.id, {
      simpleIdx: idx + 1,
      simplePlace: place,
      simpleLevel: level,
      simpleSplit: split,
      restDate: "",
    });
    json(res, 200, {
      ok: true,
      done: plan[idx % plan.length].label,
      next: plan[(idx + 1) % plan.length].label,
      lifts: written.length,
      volume: Math.round(volume),
      prs,
      ...dayState(user.id, date),
    });
    return;
  }

  // ── Готовая тренировка (дом/зал): та же отметка, что кнопка в чате ─────────
  if (req.method === "POST" && urlPath === "/api/workout/simple") {
    const body = await readJson(req) as { place?: string; level?: string; split?: string };
    const u = getUser(user.id);
    const { place, level, split, plan, idx } = resolveSimple(u, body);
    const w = plan[idx % plan.length];
    addWorkout({
      userId: user.id, date,
      exercise: `Тренировка ${w.label}`,
      sets: 1, reps: 1, weightKg: 0,
      notes: "simple",
    });
    updateUser(user.id, {
      simpleIdx: idx + 1,
      simplePlace: place,
      simpleLevel: level,
      simpleSplit: split,
      restDate: "",
    });
    json(res, 200, {
      ok: true,
      done: w.label,
      next: plan[(idx + 1) % plan.length].label,
      ...dayState(user.id, date),
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/settings") {
    const body = await readJson(req) as {
      place?: string;
      level?: string;
      split?: string;
      rest?: boolean;
      mealRemind?: boolean;
    };
    const u = getUser(user.id);
    const patch: {
      simplePlace?: Place;
      simpleLevel?: "start" | "train";
      simpleSplit?: SplitId;
      simpleIdx?: number;
      restDate?: string;
      mealRemindPaused?: boolean;
      mealRemindMissed?: number;
    } = {};
    if (body.place === "home" || body.place === "gym") patch.simplePlace = body.place;
    if (body.level === "start" || body.level === "train") patch.simpleLevel = body.level;
    if (body.split === "fb-start" || body.split === "fb-train" || body.split === "ppl" || body.split === "ul") {
      patch.simpleSplit = body.split;
      patch.simpleLevel = splitLevel(body.split);
      if ((u?.simpleSplit || "") !== body.split) patch.simpleIdx = 0;
    }
    if (body.rest === true) patch.restDate = date;
    if (body.rest === false) patch.restDate = "";
    if (body.mealRemind === true) {
      patch.mealRemindPaused = false;
      patch.mealRemindMissed = 0;
    }
    if (body.mealRemind === false) patch.mealRemindPaused = true;
    if (Object.keys(patch).length) updateUser(user.id, patch);
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/foods") {
    json(res, 200, {
      foods: FOODS.filter((f) => f.role).map((f) => ({
        name: f.name,
        kcal100: f.kcal100,
        p100: f.p100,
        f100: f.f100,
        c100: f.c100,
        defaultG: f.defaultG,
        category: f.category,
        role: f.role,
        slug: hasFoodImage(imageSlug(f)) ? imageSlug(f) : undefined,
        aliases: f.aliases,
      })),
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/nutrition") {
    const profile = validProfile(await readJson(req));
    if (!profile) {
      json(res, 400, { error: "bad_profile" });
      return;
    }
    setNutrition(user.id, profile);
    // Отдаём всё состояние дня, как остальные изменяющие запросы: от веса зависит
    // норма воды, и приложению не нужен второй запрос, чтобы её пересчитать.
    // Поле nutrition в ответе осталось на месте — старые вызовы не ломаются.
    json(res, 200, dayState(user.id, date));
    return;
  }

  if (req.method === "POST" && urlPath === "/api/meal/photo") {
    if (!mealVisionEnabled()) {
      json(res, 503, {
        error: "vision_off",
        message: "Анализ фото не подключён: нужен GEMINI_API_KEY в переменных бота.",
      });
      return;
    }
    const wk = weekKey(date);
    const gate = photoGate(user.id, wk, date);
    if (!gate.ok) {
      json(res, 429, {
        error: "photo_limit",
        message:
          gate.reason === "day"
            ? `${gate.limit} фото за день — это уже не учёт еды. Продолжишь завтра или добавь текстом.`
            : `Лимит ${gate.limit} фото в неделю исчерпан. Добавь еду текстом или вручную.`,
        photo: photoQuota(user.id),
      });
      return;
    }

    const body = await readJson(req) as { imageBase64?: string; mime?: string };
    const b64 = String(body.imageBase64 ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) {
      json(res, 400, { error: "no_image" });
      return;
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 1024) {
      json(res, 400, { error: "no_image" });
      return;
    }
    if (buf.length > MAX_IMAGE) {
      json(res, 413, { error: "too_large", message: "Снимок слишком большой. Сними еще раз или добавь текстом." });
      return;
    }

    // Форматы, которые понимает Gemini. Раньше всё кроме PNG объявлялось JPEG:
    // HEIC с iPhone уходил под чужим типом и отбивался распознаванием.
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const mime = allowed.includes(String(body.mime)) ? String(body.mime) : "image/jpeg";

    // Лог прихода обязателен: без него по пустому логу нельзя отличить «запрос не дошёл
    // с телефона» от «дошёл и молча отработал», а это разные поломки
    console.log(`api meal photo: ${Math.round(buf.length / 1024)} КБ, ${mime}, user=${user.id}`);

    if (!isOwner(user.id) && !take(`photo:${user.id}`, 15, 3_600_000)) {
      json(res, 429, {
        error: "slow_down",
        message: "Слишком много фото за час. Добавь текстом или позже.",
      });
      return;
    }
    const slot = beginPhoto(user.id);
    if (slot !== "ok") {
      json(res, 429, {
        error: "busy",
        message: "Сейчас разбираю другой снимок. Подожди и пришли еще раз.",
      });
      return;
    }
    try {
      // Квота до вызова модели: иначе 502 можно крутить бесконечно и выжечь Gemini.
      bumpPhotoCount(user.id, wk, date);
      const meal = withUsualShake(user.id, await analyzeMealPhoto(buf, mime));
      // Свой файл в справочнике появляется позже. Кадр с телефона — картинка записи.
      if (!meal.photoUrl) meal.photoUrl = saveMealThumb(buf, mime);
      // В дневник не пишем: сначала человек смотрит, что распознано, и отвечает
      // «это оно». Раньше запись появлялась молча, и неверную догадку
      // приходилось удалять вместо того, чтобы просто не соглашаться.
      const token = putPending(user.id, meal, date, "photo");
      json(res, 200, dayState(user.id, date));
    } catch (e) {
      if (e instanceof MealPhotoUnreadableError) {
        // Если модель что-то увидела, но в цифры это не перевелось — отдаём
        // увиденное: приложение подставит текст в поле, и человеку останется
        // поправить вес, а не начинать заново.
        json(res, 422, {
          error: "unreadable",
          seen: e.seen || undefined,
          message: photoFailMessage(e),
        });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("api meal photo:", msg.slice(0, 160));
      json(res, 502, {
        error: "vision_failed",
        message: "Распознавание сейчас не отвечает. Напиши текстом, что на фото: например «виноград 200 г».",
      });
    } finally {
      endPhoto(user.id);
    }
    return;
  }

  if (req.method === "POST" && urlPath === "/api/meal/text") {
    const body = await readJson(req) as { text?: string };
    const text = String(body.text ?? "").trim().slice(0, 300);
    if (text.length < 2) {
      json(res, 400, { error: "no_text" });
      return;
    }
    const wk = weekKey(date);
    const aiGate = photoGate(user.id, wk, date);
    if (!aiGate.ok) {
      json(res, 429, {
        error: "photo_limit",
        message:
          aiGate.reason === "day"
            ? `${aiGate.limit} разборов за день — это уже не учёт еды. Продолжишь завтра.`
            : `Лимит ${aiGate.limit} разборов в неделю исчерпан. Добавь еду вручную.`,
        photo: photoQuota(user.id),
      });
      return;
    }
    if (!isOwner(user.id) && !take(`textai:${user.id}`, 20, 3_600_000)) {
      json(res, 429, {
        error: "slow_down",
        message: "Слишком много текстовых разборов за час. Добавь вручную или позже.",
      });
      return;
    }
    try {
      bumpPhotoCount(user.id, wk, date);
      const meal = withUsualShake(user.id, await analyzeMealText(text));
      // Текст тоже догадка: «8 ложек овсянки» превращаются в граммы правилами,
      // а «салат» — в порцию по умолчанию. Показываем разбор до записи.
      const token = putPending(user.id, meal, date, "text");
      json(res, 200, dayState(user.id, date));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      json(res, 422, {
        error: "text_failed",
        message: msg.slice(0, 120) || "Не смог посчитать. Укажи продукты и граммы.",
      });
    }
    return;
  }

  /**
   * «Да, это оно» — запись разобранного приёма в дневник.
   *
   * Цифры берутся из серверного хранилища по токену, а не из тела запроса:
   * иначе подтверждение стало бы способом записать любые калории, и дневник
   * перестал бы быть расчётом.
   */
  if (req.method === "POST" && urlPath === "/api/meal/confirm") {
    const body = await readJson(req) as { token?: string };
    const found = takePending(user.id, String(body.token ?? ""));
    if (!found) {
      json(res, 410, {
        error: "pending_gone",
        message: "Разбор устарел — сфотографируй или напиши заново.",
      });
      return;
    }
    const meal = found.meal;
    const row = addMeal({
      userId: user.id, date: found.date,
      name: meal.name, kcal: meal.kcal, proteinG: meal.proteinG, fatG: meal.fatG, carbsG: meal.carbsG, slug: meal.slug, photoUrl: publicMealPhoto(meal.photoUrl),
      hour: mealHour(found.date),
      parts: meal.parts,
    });
    console.log(`api meal confirm: ${found.source}, ${meal.kcal} ккал, user=${user.id}`);
    json(res, 200, { meal, mealId: row.id, note: meal.note, ...dayState(user.id, found.date) });
    return;
  }

  /**
   * Правка разбора до записи: убрать позицию или поправить вес.
   *
   * Без неё выбор был между «согласиться с выдумкой» и «начать заново»: модель
   * приписала к одному яблоку салат, которого на кадре нет, и снять только его
   * человек не мог. Считает по-прежнему сервер — клиент присылает номер позиции
   * и вес, но не калории.
   */
  if (req.method === "POST" && urlPath === "/api/meal/pending") {
    const body = await readJson(req) as {
      token?: string;
      drop?: number;
      index?: number;
      grams?: number;
      add?: { name?: string; grams?: number };
    };
    const token = String(body.token ?? "");
    const found = peekPending(user.id, token);
    if (!found) {
      json(res, 410, { error: "pending_gone", message: "Разбор устарел — сфотографируй или напиши заново." });
      return;
    }
    const edit =
      body.drop !== undefined
        ? { drop: Number(body.drop) }
        : body.add
          ? { add: { name: String(body.add.name ?? ""), grams: Number(body.add.grams) } }
          : { grams: { index: Number(body.index), value: Number(body.grams) } };
    const meal = editMeal(found.meal, edit);
    if (!meal) {
      json(res, 400, { error: "bad_edit", message: "Так поправить нельзя." });
      return;
    }
    updatePending(user.id, token, meal);
    console.log(
      `api meal edit: ${body.drop !== undefined ? `убрана позиция ${body.drop}` : `вес ${body.grams} г`}` +
        `, стало ${meal.kcal} ккал, user=${user.id}`
    );
    json(res, 200, dayState(user.id, found.date));
    return;
  }

  /**
   * Вчерашний приём в редактор состава: снять арахисовую пасту, убавить банан.
   * Цифры из сохранённого состава или из названия, модель не дергаем.
   */
  if (req.method === "POST" && urlPath === "/api/meal/revise") {
    const body = await readJson(req) as { name?: string; items?: { name?: string; grams?: number }[] };
    const items = Array.isArray(body.items)
      ? body.items
          .map((x) => ({ name: String(x?.name ?? "").trim(), grams: Math.round(Number(x?.grams)) }))
          .filter((x) => x.name && x.grams >= 1 && x.grams <= 3000)
          .slice(0, 12)
      : [];
    if (items.length) {
      const meal = macrosFromItems(items);
      if (!meal?.parts?.length) {
        json(res, 422, { error: "bad_parts", message: "Такой состав не собрался. Напиши напиток текстом." });
        return;
      }
      putPending(user.id, withUsualShake(user.id, meal), date, "text");
      json(res, 200, dayState(user.id, date));
      return;
    }
    const name = String(body.name ?? "").trim();
    if (!name) {
      json(res, 400, { error: "no_name" });
      return;
    }
    const prev = [...getMeals(user.id)].reverse().find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
    if (!prev) {
      json(res, 404, { error: "not_found", message: "Такого блюда нет в истории." });
      return;
    }
    const meal = withUsualShake(user.id, mealFromHistory(prev));
    if (!meal.parts?.length) {
      json(res, 422, {
        error: "no_parts",
        message: "Состав этой записи не сохранился. Напиши напиток текстом и поправь позиции.",
      });
      return;
    }
    putPending(user.id, meal, date, "text");
    json(res, 200, dayState(user.id, date));
    return;
  }

  /** Записать отмеченное: коктейль без винограда, без повторного распознавания. */
  if (req.method === "POST" && urlPath === "/api/meal/pick") {
    const body = await readJson(req) as { units?: { items?: { name?: string; grams?: number }[] }[] };
    const units = (Array.isArray(body.units) ? body.units : []).slice(0, 8);
    const added: { name: string; kcal: number }[] = [];
    for (const unit of units) {
      const items = (Array.isArray(unit.items) ? unit.items : [])
        .map((x) => ({ name: String(x?.name ?? "").trim(), grams: Math.round(Number(x?.grams)) }))
        .filter((x) => x.name && x.grams >= 1 && x.grams <= 3000)
        .slice(0, 12);
      if (!items.length) continue;
      const meal = macrosFromItems(items);
      if (!meal || meal.kcal <= 0) continue;
      addMeal({
        userId: user.id,
        date,
        name: meal.name,
        kcal: meal.kcal,
        proteinG: meal.proteinG,
        fatG: meal.fatG,
        carbsG: meal.carbsG,
        slug: meal.slug,
        photoUrl: publicMealPhoto(meal.photoUrl),
        hour: mealHour(date),
        parts: meal.parts,
      });
      added.push({ name: meal.name, kcal: meal.kcal });
    }
    if (!added.length) {
      json(res, 400, { error: "no_pick", message: "Отметь хотя бы одну позицию." });
      return;
    }
    json(res, 200, { ...dayState(user.id, date), meal: added[0], copied: added });
    return;
  }

  /** «Не то» — разбор выбрасывается, в дневнике не остаётся следа. */
  if (req.method === "POST" && urlPath === "/api/meal/reject") {
    const body = await readJson(req) as { token?: string };
    dropPending(user.id, String(body.token ?? ""));
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/meal/food") {
    const body = await readJson(req) as { name?: string; grams?: number };
    const name = String(body.name ?? "").trim().slice(0, 60);
    const grams = Math.round(Number(body.grams));
    if (!name || !(grams >= 1 && grams <= 3000)) {
      json(res, 400, { error: "bad_food" });
      return;
    }
    const meal = macrosFromItems([{ name, grams }]);
    if (!meal || meal.kcal <= 0) {
      json(res, 422, { error: "unknown_food", message: "Такого продукта нет в справочнике." });
      return;
    }
    const row = addMeal({
      userId: user.id, date,
      name: meal.name, kcal: meal.kcal, proteinG: meal.proteinG, fatG: meal.fatG, carbsG: meal.carbsG, slug: meal.slug, photoUrl: publicMealPhoto(meal.photoUrl),
      hour: mealHour(date),
      parts: meal.parts,
    });
    json(res, 200, { meal, mealId: row.id, ...dayState(user.id, date) });
    return;
  }

  /**
   * Повтор съеденного: одно касание вместо нового распознавания. Берём последнюю
   * запись с этим названием и копируем её в выбранный день — распознавание тут
   * ничего не уточнит, а фото и текст стоят запроса к модели.
   */
  if (req.method === "POST" && urlPath === "/api/meal/usual-shake") {
    const meal = resolveUsualShakeMeal(user.id);
    if (!meal?.parts?.length) {
      json(res, 422, { error: "no_shake", message: "Коктейль не собрался. Напиши состав текстом." });
      return;
    }
    const live = latestPending(user.id);
    if (live) dropPending(user.id, live.token);
    const row = addMeal({
      userId: user.id,
      date,
      name: meal.name,
      kcal: meal.kcal,
      proteinG: meal.proteinG,
      fatG: meal.fatG,
      carbsG: meal.carbsG,
      slug: meal.slug,
      photoUrl: publicMealPhoto(meal.photoUrl),
      hour: mealHour(date),
      parts: meal.parts,
    });
    console.log(`api meal usual-shake: ${meal.kcal} kcal, user=${user.id}`);
    json(res, 200, {
      ...dayState(user.id, date),
      meal: { name: meal.name, kcal: meal.kcal, proteinG: meal.proteinG, fatG: meal.fatG, carbsG: meal.carbsG, slug: meal.slug },
      mealId: row.id,
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/meal/repeat") {
    const body = await readJson(req) as { name?: string; names?: string[] };
    const names = (Array.isArray(body.names) ? body.names : body.name ? [body.name] : [])
      .map((n) => String(n ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!names.length) {
      json(res, 400, { error: "no_name" });
      return;
    }
    const history = getMeals(user.id);
    const added: { name: string; kcal: number; proteinG: number; fatG: number; carbsG: number; slug?: string }[] = [];
    for (const raw of names) {
      const key = raw.toLowerCase();
      const prev = [...history].reverse().find((m) => m.name.trim().toLowerCase() === key);
      if (!prev) continue;
      const meal = {
        name: prev.name,
        kcal: prev.kcal,
        proteinG: prev.proteinG,
        fatG: prev.fatG,
        carbsG: prev.carbsG,
        slug: prev.slug,
        photoUrl: publicMealPhoto(prev.photoUrl),
        hour: mealHour(date),
        parts: prev.parts,
      };
      addMeal({ userId: user.id, date, ...meal });
      added.push(meal);
    }
    if (!added.length) {
      json(res, 404, { error: "not_found", message: "Такого блюда нет в истории." });
      return;
    }
    json(res, 200, { ...dayState(user.id, date), meal: added[0], copied: added });
    return;
  }

  // Ручной ввод: на упаковке уже написаны КБЖУ — не надо гонять их через распознавание
  if (req.method === "POST" && urlPath === "/api/meal/manual") {
    const body = await readJson(req) as Record<string, unknown>;
    const name = String(body.name ?? "").trim().slice(0, 60) || "Приём пищи";
    const kcal = Math.round(Number(body.kcal));
    const proteinG = Math.round(Number(body.proteinG) || 0);
    const fatG = Math.round(Number(body.fatG) || 0);
    const carbsG = Math.round(Number(body.carbsG) || 0);
    if (!(kcal >= 1 && kcal <= 6000)) {
      json(res, 400, { error: "bad_kcal" });
      return;
    }
    // Своё название тоже стоит попробовать узнать: «Творог с орехами» найдёт
    // творог и получит картинку — иначе ручная запись выглядит безымянной.
    const known = matchFood(name);
    const meal = { name, kcal, proteinG, fatG, carbsG, slug: known ? resolveMealThumb(name, imageSlug(known)) : resolveMealThumb(name) };
    const row = addMeal({ userId: user.id, date, ...meal, hour: mealHour(date) });
    json(res, 200, { meal, mealId: row.id, ...dayState(user.id, date) });
    return;
  }

  /**
   * Правка порции у уже записанного приёма. Главная претензия ко всем счётчикам
   * по фото: состав модель угадывает, вес — нет, и человек видит «250 ккал» там,
   * где съел полторы порции. Поэтому правим множитель, а не четыре числа: состав
   * блюда остаётся тем, что определён, меняется только количество.
   */
  if (req.method === "PATCH" && urlPath === "/api/meal") {
    const body = await readJson(req) as { id?: string; factor?: number };
    const id = String(body.id ?? "");
    const factor = Number(body.factor);
    if (!id || !Number.isFinite(factor) || factor <= 0) {
      json(res, 400, { error: "bad_request", message: "Нужны id записи и множитель порции." });
      return;
    }
    const row = scaleMeal(user.id, id, factor);
    if (!row) {
      json(res, 404, { error: "not_found", message: "Запись не найдена." });
      return;
    }
    json(res, 200, { meal: row, ...dayState(user.id, row.date) });
    return;
  }

  if (req.method === "DELETE" && urlPath === "/api/meal") {
    const id = query.get("id") ?? "";
    const row = getMeal(user.id, id);
    const ok = removeMeal(user.id, id);
    const viewDate = row?.date ?? safeDate(query.get("date")) ?? date;
    json(res, ok ? 200 : 404, { ok, ...dayState(user.id, viewDate) });
    return;
  }

  // ── Фотопротокол прогресса тела ───────────────────────────────────────────
  // Снимок принимается тем же способом, что фото еды: base64 в JSON, не
  // multipart. Путь на диске строит только сервер — из userId и
  // crypto.randomUUID(), из клиентских данных в путь ничего не подставляется.
  if (req.method === "POST" && urlPath === "/api/progress/photo") {
    const body = await readJson(req) as { imageBase64?: string; mime?: string; angle?: string; date?: string };
    const angle = body.angle === "front" || body.angle === "side" || body.angle === "back" ? body.angle : null;
    if (!angle) {
      json(res, 400, { error: "bad_angle", message: "Ракурс должен быть спереди, сбоку или сзади." });
      return;
    }
    const rawDate = body.date == null ? "" : String(body.date);
    const day = rawDate ? safeDate(rawDate) : date;
    if (!day) {
      json(res, 400, { error: "bad_date", message: "Дата должна быть не в будущем." });
      return;
    }

    const b64 = String(body.imageBase64 ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) {
      json(res, 400, { error: "no_image" });
      return;
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 1024) {
      json(res, 400, { error: "no_image" });
      return;
    }
    if (buf.length > MAX_IMAGE) {
      json(res, 413, { error: "too_large", message: "Снимок слишком большой. Сними еще раз." });
      return;
    }

    // Сериализация на пользователя: без неё два параллельных запроса проходят
    // проверку лимита в одно окно между чтением тела и записью файла, и лимит
    // по количеству/объёму можно ненадолго превысить.
    if (!beginProgressPhotoUpload(user.id)) {
      json(res, 429, { error: "busy", message: "Уже сохраняю твое фото. Подожди и попробуй еще раз." });
      return;
    }
    try {
      // Лимиты проверяются до записи на диск: тихого отказа быть не должно, и
      // байты чужого снимка не должны попасть на том, если места уже нет.
      const usage = progressPhotoUsage(user.id);
      if (usage.count >= PROGRESS_PHOTO_MAX_COUNT) {
        json(res, 413, {
          error: "limit_count",
          message: `Уже сохранено ${usage.count} фото из ${PROGRESS_PHOTO_MAX_COUNT}. Удали старые, чтобы добавить новое.`,
          usage,
        });
        return;
      }
      if (usage.bytes + buf.length > PROGRESS_PHOTO_MAX_BYTES) {
        json(res, 413, {
          error: "limit_bytes",
          message:
            `Место закончилось: занято ${Math.round(usage.bytes / 1024 / 1024)} МБ из ` +
            `${Math.round(PROGRESS_PHOTO_MAX_BYTES / 1024 / 1024)} МБ. Удали старые фото, чтобы добавить новое.`,
          usage,
        });
        return;
      }

      const dir = progressPhotoDir(user.id);
      const filePath = path.join(dir, `${crypto.randomUUID()}.jpg`);
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, buf);
      } catch (e) {
        console.error("api progress photo write:", e instanceof Error ? e.message : String(e));
        json(res, 500, { error: "save_failed", message: "Не удалось сохранить фото. Попробуй еще раз." });
        return;
      }

      const row = addProgressPhoto({ userId: user.id, date: day, angle, path: filePath, sizeBytes: buf.length });
      console.log(`api progress photo: ${Math.round(buf.length / 1024)} КБ, angle=${angle}, user=${user.id}`);
      json(res, 200, { ok: true, photo: publicProgressPhoto(row, botToken), usage: progressPhotoUsage(user.id) });
      return;
    } finally {
      endProgressPhotoUpload(user.id);
    }
  }

  if (req.method === "GET" && urlPath === "/api/progress/photos") {
    const rows = listProgressPhotos(user.id).map((row) => publicProgressPhoto(row, botToken));
    json(res, 200, {
      photos: rows,
      usage: progressPhotoUsage(user.id),
      limit: { count: PROGRESS_PHOTO_MAX_COUNT, bytes: PROGRESS_PHOTO_MAX_BYTES },
    });
    return;
  }

  const progressDelete = req.method === "DELETE" ? /^\/api\/progress\/photo\/([^/]+)$/.exec(urlPath) : null;
  if (progressDelete) {
    const id = decodeURIComponent(progressDelete[1]);
    // Доступ к записи только по совпадению userId с проверенной initData — без исключений.
    const ok = deleteProgressPhoto(user.id, id);
    json(res, ok ? 200 : 404, { ok, usage: progressPhotoUsage(user.id) });
    return;
  }

  json(res, 404, { error: "unknown_endpoint" });
}

export function startWebappServer(botToken: string): http.Server | null {
  if (process.env.WEBAPP_SERVER === "0") {
    console.log("🌐 HTTP-сервер выключен (WEBAPP_SERVER=0)");
    return null;
  }
  const port = Number(process.env.PORT ?? 8080);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const urlPath = url.pathname;

    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204).end();
      return;
    }
    if (urlPath === "/health") {
      json(res, 200, { ok: true, vision: mealVisionEnabled(), build: BUILD_ID });
      return;
    }

    // Байты фото прогресса: адрес идёт в <img src>, заголовок initData туда не
    // положить, поэтому подлинность проверяется коротким токеном в адресе, а не
    // общей проверкой auth() ниже. GET с любым другим путём /api/… идёт как обычно.
    const progressPhotoGet = req.method === "GET" ? /^\/api\/progress\/photo\/([^/]+)$/.exec(urlPath) : null;
    if (progressPhotoGet) {
      cors(res);
      serveProgressPhoto(req, res, progressPhotoGet[1], url.searchParams, botToken);
      return;
    }

    if (urlPath.startsWith("/api/")) {
      cors(res);
      handleApi(req, res, urlPath, url.searchParams, botToken).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("api error:", msg.slice(0, 160));
        if (msg === "payload_too_large") {
          res.setHeader("Connection", "close");
          json(res, 413, {
            error: "payload_too_large",
            message: "Снимок слишком большой. Сними еще раз или добавь еду текстом.",
          });
          return;
        }
        if (msg === "bad_json") {
          json(res, 400, { error: "bad_json", message: "Запрос повреждён. Открой приложение заново." });
          return;
        }
        json(res, 500, { error: "server_error" });
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      try {
        serveStatic(req, res, urlPath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("static:", msg.slice(0, 120));
        if (!res.headersSent) res.writeHead(404).end("not found");
      }
      return;
    }
    res.writeHead(405).end("method not allowed");
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.maxHeadersCount = 40;

  server.listen(port, () => {
    const hasApp = fs.existsSync(path.join(WEBAPP_DIR, "index.html"));
    console.log(`🌐 HTTP :${port} — Mini App ${hasApp ? "раздаётся" : "НЕ НАЙДЕН (" + WEBAPP_DIR + ")"}`);
    if (accessEnabled()) {
      console.log(`   Access gate: on (${accessChatId()})`);
    } else {
      console.log("   Access gate: OFF");
    }
  });
  server.on("error", (e) => console.error("HTTP server:", e instanceof Error ? e.message : e));

  return server;
}
