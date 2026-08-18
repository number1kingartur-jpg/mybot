import fs from "fs";
import http from "http";
import path from "path";
import { verifyInitData, type WebAppUser } from "./webapp-auth";
import {
  registerUser, getUser, updateUser, setNutrition,
  addMeal, removeMeal, getMeals, mealTotals,
  addBodyweight, getBodyweight, removeBodyweight,
  addWater, getWater, waterTargetMl,
  addWorkout, getAllWorkouts, checkPr,
  saveProgram, getActiveProgram, advanceProgramDay,
  photoGate, bumpPhotoCount, mealPhotoUnlimited, trialMode, freePhotoWeek, isPremium,
  type NutritionProfile, type Lift, type Program,
} from "./db";
import { analyzeMealPhoto, analyzeMealText, mealVisionEnabled, MealPhotoUnreadableError } from "./meal";
import { FOODS, macrosFromItems } from "./foods";
import { calc531, calcGzclp } from "./calc/templates";
import { calculatePeriodization, type Goal, type PeriodizationModel, type GenResult } from "./calc/periodization";
import { SIMPLE_PLANS, type Place } from "./simple";

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

/**
 * Метка версии приложения: время последней правки js/css. Подставляется в адреса
 * файлов в index.html, поэтому после деплоя устройство физически не может отдать
 * старый код из кэша — адрес другой. Заодно видна в /health: по ней можно
 * сверить, ту ли версию открыл пользователь.
 */
const BUILD_ID = (() => {
  try {
    let newest = 0;
    for (const dir of ["js", "css"]) {
      const d = path.join(WEBAPP_DIR, dir);
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

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Пн = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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
  const user = verifyInitData(initData, botToken);
  if (!user) {
    console.warn(`api auth: подпись не принята (${initData.length} симв.), ${req.method} ${req.url}`);
    return null;
  }
  registerUser(user.id, user.firstName); // первый вход может быть из приложения, а не из чата
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

function dayState(userId: number, date: string) {
  const u = getUser(userId);
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
    })),
    totals: mealTotals(userId, date),
    photo: photoQuota(userId),
    visionEnabled: mealVisionEnabled(),
    // Всё остальное состояние человека — одним ответом, чтобы приложение не делало
    // пять запросов на старте
    bodyweight: getBodyweight(userId, 60).map((b) => ({ date: b.date, weightKg: b.weightKg })),
    program: programState(userId),
    simple: {
      idx: u?.simpleIdx ?? 0,
      place: u?.simplePlace === "gym" ? "gym" : "home",
    },
    workoutsTotal: getAllWorkouts(userId).length,
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
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const full = path.join(WEBAPP_DIR, rel);

  // Защита от выхода за пределы каталога приложения (../../etc/passwd)
  if (!full.startsWith(WEBAPP_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }

  const ext = path.extname(full).toLowerCase();
  const isAsset = ext === ".png" || ext === ".jpg" || ext === ".svg" || ext === ".ico";

  // WebView Telegram держит старый js даже при no-cache — на iOS это проверено
  // на живом устройстве: правка была в сети, а на экране оставалась прошлая
  // версия. Заголовкам верить нельзя, поэтому у файлов меняется сам адрес.
  if (ext === ".html") {
    // Открытие приложения логируем вместе с меткой кнопки (?from=kb|inline|row):
    // подпись Telegram лежит после «#» и до сервера не доходит, поэтому способ
    // запуска иначе не определить, а от него зависит, есть ли подпись вообще.
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

  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": isAsset ? "public, max-age=86400" : "no-cache",
  });
  fs.createReadStream(full).pipe(res);
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
    json(res, 401, { error: "unauthorized", message: "Открой приложение из Telegram." });
    return;
  }
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
    const body = JSON.parse(await readBody(req)) as { weightKg?: number; date?: string };
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
    const body = JSON.parse(await readBody(req)) as { ml?: number; date?: string };
    const ml = Number(body.ml);
    if (!Number.isFinite(ml) || ml === 0 || Math.abs(ml) > 3000) {
      json(res, 400, { error: "bad_ml", message: "Порция: от 1 до 3000 мл." });
      return;
    }
    const raw = body.date == null ? "" : String(body.date);
    const day = raw ? safeDate(raw) : date;
    if (!day) {
      json(res, 400, { error: "bad_date", message: "Дата должна быть не в будущем." });
      return;
    }
    addWater(user.id, Math.round(ml), day);
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  // ── Программа: считается на сервере кодом бота, чтобы цифры не разошлись ──
  if (req.method === "POST" && urlPath === "/api/program") {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
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
    const updated = advanceProgramDay(user.id);
    json(res, 200, {
      ok: true,
      pr,
      finished: !updated || !updated.active,
      ...dayState(user.id, date),
    });
    return;
  }

  // ── Готовая тренировка (дом/зал): та же отметка, что кнопка в чате ─────────
  if (req.method === "POST" && urlPath === "/api/workout/simple") {
    const body = JSON.parse(await readBody(req)) as { place?: string };
    const u = getUser(user.id);
    const place: Place =
      body.place === "gym" ? "gym" : body.place === "home" ? "home" : u?.simplePlace === "gym" ? "gym" : "home";
    const idx = u?.simpleIdx ?? 0;
    const plan = SIMPLE_PLANS[place];
    const w = plan[idx % plan.length];
    addWorkout({
      userId: user.id, date,
      exercise: `Тренировка ${w.label} (фулбоди)`,
      sets: 1, reps: 1, weightKg: 0,
      notes: "simple",
    });
    updateUser(user.id, { simpleIdx: idx + 1, simplePlace: place });
    json(res, 200, {
      ok: true,
      done: w.label,
      next: plan[(idx + 1) % plan.length].label,
      ...dayState(user.id, date),
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/settings") {
    const body = JSON.parse(await readBody(req)) as { place?: string };
    if (body.place === "home" || body.place === "gym") {
      updateUser(user.id, { simplePlace: body.place });
    }
    json(res, 200, { ok: true, ...dayState(user.id, date) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/foods") {
    json(res, 200, {
      foods: FOODS.map((f) => ({
        name: f.name,
        kcal100: f.kcal100,
        p100: f.p100,
        f100: f.f100,
        c100: f.c100,
        defaultG: f.defaultG,
        category: f.category,
      })),
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/nutrition") {
    const profile = validProfile(JSON.parse(await readBody(req)));
    if (!profile) {
      json(res, 400, { error: "bad_profile" });
      return;
    }
    setNutrition(user.id, profile);
    json(res, 200, { ok: true, nutrition: profile });
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

    const body = JSON.parse(await readBody(req)) as { imageBase64?: string; mime?: string };
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

    // Форматы, которые понимает Gemini. Раньше всё кроме PNG объявлялось JPEG:
    // HEIC с iPhone уходил под чужим типом и отбивался распознаванием.
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const mime = allowed.includes(String(body.mime)) ? String(body.mime) : "image/jpeg";

    // Лог прихода обязателен: без него по пустому логу нельзя отличить «запрос не дошёл
    // с телефона» от «дошёл и молча отработал», а это разные поломки
    console.log(`api meal photo: ${Math.round(buf.length / 1024)} КБ, ${mime}, user=${user.id}`);

    try {
      const meal = await analyzeMealPhoto(buf, mime);
      addMeal({
        userId: user.id, date,
        name: meal.name, kcal: meal.kcal, proteinG: meal.proteinG, fatG: meal.fatG, carbsG: meal.carbsG,
      });
      bumpPhotoCount(user.id, wk, date);
      json(res, 200, { meal, note: meal.note, ...dayState(user.id, date) });
    } catch (e) {
      if (e instanceof MealPhotoUnreadableError) {
        json(res, 422, {
          error: "unreadable",
          message: "Не разобрал, что на фото. Сними ближе и при свете или добавь текстом.",
        });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("api meal photo:", msg.slice(0, 160));
      json(res, 502, { error: "vision_failed", message: "Сервис распознавания не ответил. Попробуй позже." });
    }
    return;
  }

  if (req.method === "POST" && urlPath === "/api/meal/text") {
    const body = JSON.parse(await readBody(req)) as { text?: string };
    const text = String(body.text ?? "").trim().slice(0, 300);
    if (text.length < 2) {
      json(res, 400, { error: "no_text" });
      return;
    }
    try {
      const meal = await analyzeMealText(text);
      addMeal({
        userId: user.id, date,
        name: meal.name, kcal: meal.kcal, proteinG: meal.proteinG, fatG: meal.fatG, carbsG: meal.carbsG,
      });
      json(res, 200, { meal, note: meal.note, ...dayState(user.id, date) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      json(res, 422, {
        error: "text_failed",
        message: msg.slice(0, 120) || "Не смог посчитать. Укажи продукты и граммы.",
      });
    }
    return;
  }

  if (req.method === "POST" && urlPath === "/api/meal/food") {
    const body = JSON.parse(await readBody(req)) as { name?: string; grams?: number };
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
    addMeal({
      userId: user.id, date,
      name: meal.name, kcal: meal.kcal, proteinG: meal.proteinG, fatG: meal.fatG, carbsG: meal.carbsG,
    });
    json(res, 200, { meal, ...dayState(user.id, date) });
    return;
  }

  // Ручной ввод: на упаковке уже написаны КБЖУ — не надо гонять их через распознавание
  if (req.method === "POST" && urlPath === "/api/meal/manual") {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    const name = String(body.name ?? "").trim().slice(0, 60) || "Приём пищи";
    const kcal = Math.round(Number(body.kcal));
    const proteinG = Math.round(Number(body.proteinG) || 0);
    const fatG = Math.round(Number(body.fatG) || 0);
    const carbsG = Math.round(Number(body.carbsG) || 0);
    if (!(kcal >= 1 && kcal <= 6000)) {
      json(res, 400, { error: "bad_kcal" });
      return;
    }
    const meal = { name, kcal, proteinG, fatG, carbsG };
    addMeal({ userId: user.id, date, ...meal });
    json(res, 200, { meal, ...dayState(user.id, date) });
    return;
  }

  if (req.method === "DELETE" && urlPath === "/api/meal") {
    const id = query.get("id") ?? "";
    const ok = removeMeal(user.id, id);
    json(res, ok ? 200 : 404, { ok, ...dayState(user.id, date) });
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

    if (urlPath.startsWith("/api/")) {
      cors(res);
      handleApi(req, res, urlPath, url.searchParams, botToken).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("api error:", msg.slice(0, 160));
        if (msg === "payload_too_large") {
          res.setHeader("Connection", "close");
          json(res, 413, {
            error: "payload_too_large",
            message: "Снимок слишком большой. Сними ещё раз или добавь еду текстом.",
          });
          return;
        }
        json(res, 500, { error: "server_error" });
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res, urlPath);
      return;
    }
    res.writeHead(405).end("method not allowed");
  });

  server.listen(port, () => {
    const hasApp = fs.existsSync(path.join(WEBAPP_DIR, "index.html"));
    console.log(`🌐 HTTP :${port} — Mini App ${hasApp ? "раздаётся" : "НЕ НАЙДЕН (" + WEBAPP_DIR + ")"}`);
  });
  server.on("error", (e) => console.error("HTTP server:", e instanceof Error ? e.message : e));

  return server;
}
