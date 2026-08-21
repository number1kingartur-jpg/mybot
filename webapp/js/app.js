/* KINGMODE Mini App — экраны и навигация. Все расчёты в engine.js (KM). */

(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var view = document.getElementById("view");
  var tabbar = document.getElementById("tabbar");
  var titleEl = document.getElementById("screenTitle");
  var STORE_KEY = "kingmode.v3";

  /* ── Состояние ──────────────────────────────────────────────────────────── */

  var DEFAULT_LIFTS = [
    "Приседания",
    "Жим лёжа",
    "Становая тяга",
    "Жим стоя",
    "Подтягивания с весом"
  ];

  var state = {
    screen: "home",
    setupDone: false,
    theme: "night", // night | graphite | ivory — оформление, выбор человека
    profTab: "day", // day | progress | look — подразделы личного профиля
    lastMeal: null, // последняя запись еды: по ней предлагается уточнить порцию
    pending: null, // разобранный, но не записанный приём: ждёт ответа «это оно»
    goalWeightKg: "", // цель по весу; из неё считается прогноз на «Сегодня»
    calcTab: "orm",
    nutTab: "eaten",
    // meal — какой приём раскрыт, pick — какая позиция открыта на выбор замены,
    // swaps — выбранные замены вида { "ru:breakfast:0": "Гречка отварная" }
    menu: { id: "ru", meal: null, pick: null, swaps: {} },
    manual: { name: "", kcal: "", proteinG: "", fatG: "", carbsG: "" },
    mealText: "",
    addMode: null, // null | "text" | "manual" — какая форма добавления раскрыта
    busy: null, // "photo" | "text" | "manual" | "food"
    notice: null, // { kind: "ok" | "err", text }
    day: null, // ответ сервера: meals, totals, photo, вес, программа
    linkError: null, // почему сервер не ответил; null = связь есть или её и не ждём
    viewDate: null, // какой день открыт в «Съедено»; null = сегодня
    foods: null, // справочник продуктов, грузится один раз
    foodQuery: "",
    foodGrams: "",
    foodMore: {},
    migrated: false, // локальные записи веса уже перенесены в базу бота
    localMeals: [], // режим без сервера: только ручной ввод, хранение на устройстве
    localWater: {}, // режим без сервера: { "YYYY-MM-DD": мл }
    profile: { sex: "m", age: 30, heightCm: 180, weightKg: 80, activity: "mid", goal: "maint" },
    orm: { weightKg: 100, reps: 5 },
    program: { model: "531", goal: "strength", weeks: 8, days: 3, lifts: [] },
    workout: { place: "home", plan: 0, level: "", split: "" },
    session: { key: "", startedAt: 0, restUntil: 0, lifts: {} },
    diary: { date: today(), weightKg: "" },
    entries: [],
    lastOrm: null,
    result: null,
    restDays: {},
    photoPreview: null,
    sameAsSkip: null,
    repeatAsk: null
  };

  // 403 join: не в persist. Человек вступил, нажал «Я уже внутри», стена должна уйти.
  var needJoin = null;

  /**
   * Три оформления вместо одного. Смысл не в украшении: тёмная тема в солнечный
   * день на улице читается плохо, а светлая вечером бьёт по глазам. Цвета живут
   * в CSS-переменных, здесь только выбор и цвет служебных полос Telegram.
   */
  var THEMES = {
    night: { label: "Ночь", attr: null, bg: "#0b0b0c" },
    graphite: { label: "Графит", attr: "graphite", bg: "#101114" },
    ivory: { label: "Слоновая кость", attr: "ivory", bg: "#f7f4ef" }
  };

  function applyTheme() {
    var t = THEMES[state.theme] || THEMES.night;
    if (t.attr) document.documentElement.setAttribute("data-theme", t.attr);
    else document.documentElement.removeAttribute("data-theme");

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.bg);
    if (tg) {
      try {
        if (tg.setBackgroundColor) tg.setBackgroundColor(t.bg);
        if (tg.setHeaderColor) tg.setHeaderColor(t.bg);
      } catch (e) {
        /* клиент старше 6.1 — полосы останутся своими */
      }
    }
  }

  function today() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function ensureLifts() {
    for (var i = 0; i < state.program.days; i++) {
      if (!state.program.lifts[i]) {
        state.program.lifts[i] = { name: DEFAULT_LIFTS[i % DEFAULT_LIFTS.length], oneRmKg: "" };
      }
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          profile: state.profile,
          orm: state.orm,
          program: state.program,
          workout: state.workout,
          menu: state.menu,
          entries: state.entries,
          lastOrm: state.lastOrm,
          localMeals: state.localMeals,
          localWater: state.localWater,
          setupDone: state.setupDone,
          migrated: state.migrated,
          theme: state.theme,
          goalWeightKg: state.goalWeightKg,
          restDays: state.restDays,
          sameAsSkip: state.sameAsSkip
        })
      );
    } catch (e) {
      /* приватный режим — работаем без сохранения */
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      ["profile", "orm", "program", "workout", "menu"].forEach(function (k) {
        if (saved[k]) Object.assign(state[k], saved[k]);
      });
      if (Array.isArray(saved.entries)) state.entries = saved.entries;
      if (Array.isArray(saved.localMeals)) state.localMeals = saved.localMeals;
      if (saved.localWater && typeof saved.localWater === "object") state.localWater = saved.localWater;
      if (saved.lastOrm) state.lastOrm = saved.lastOrm;
      if (THEMES[saved.theme]) state.theme = saved.theme;
      if (saved.goalWeightKg) state.goalWeightKg = saved.goalWeightKg;
      if (saved.restDays && typeof saved.restDays === "object") state.restDays = saved.restDays;
      if (saved.sameAsSkip && typeof saved.sameAsSkip === "object") state.sameAsSkip = saved.sameAsSkip;
      state.setupDone = Boolean(saved.setupDone);
      state.migrated = Boolean(saved.migrated);
      hadSavedProfile = Boolean(saved.profile);
    } catch (e) {
      /* битые данные игнорируем */
    }
  }

  var hadSavedProfile = false;

  /* ── Утилиты ────────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(v) {
    var n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : NaN;
  }

  function getPath(path) {
    return path.split(".").reduce(function (o, k) {
      return o == null ? o : o[k];
    }, state);
  }

  function setPath(path, value) {
    var keys = path.split(".");
    var last = keys.pop();
    var target = keys.reduce(function (o, k) {
      return o[k];
    }, state);
    target[last] = value;
  }

  function haptic(kind) {
    if (tg && tg.HapticFeedback) {
      try {
        tg.HapticFeedback.impactOccurred(kind || "light");
      } catch (e) {
        /* старый клиент */
      }
    }
  }

  function plural(n, one, few, many) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  var GOAL_WORD = { bulk: "набор массы", cut: "снижение жира", maint: "поддержание" };

  /* ── Компоненты ─────────────────────────────────────────────────────────── */

  function card(inner, opts) {
    var o = opts || {};
    var cls = "card" + (o.gold ? " card--gold" : "") + (o.tap ? " card--tap" : "");
    var attrs = o.tap ? ' data-go="' + o.tap + '"' : "";
    var tag = o.tap ? "button" : "div";
    return "<" + tag + ' class="' + cls + '"' + attrs + ">" + inner + "</" + tag + ">";
  }

  function cardHead(title, sub, badge) {
    return (
      '<div class="card__head"><div><div class="card__title">' +
      title +
      "</div>" +
      (sub ? '<div class="card__sub">' + sub + "</div>" : "") +
      "</div>" +
      (badge ? '<span class="badge">' + esc(badge) + "</span>" : "") +
      "</div>"
    );
  }

  function metric(label, value, sub) {
    return (
      '<div class="metric"><span class="metric__label">' +
      esc(label) +
      '</span><span class="metric__value">' +
      value +
      "</span>" +
      (sub ? '<span class="metric__sub">' + esc(sub) + "</span>" : "") +
      "</div>"
    );
  }

  function figure(value, unit, label) {
    return (
      '<div class="figure"><div class="figure__value">' +
      esc(value) +
      '<span class="figure__unit">' +
      esc(unit) +
      '</span></div><div class="figure__label">' +
      esc(label) +
      "</div></div>"
    );
  }

  function bar(name, color, valueText, pct) {
    return (
      '<div class="bar"><div class="bar__top"><span class="bar__name">' +
      '<span class="bar__dot" style="background:' +
      color +
      '"></span>' +
      esc(name) +
      '</span><span class="bar__value">' +
      esc(valueText) +
      '</span></div><div class="bar__track"><span class="bar__fill" style="width:' +
      Math.max(0, Math.min(100, pct)).toFixed(1) +
      "%;background:" +
      color +
      '"></span></div></div>'
    );
  }

  function chips(name, value, options, wrap) {
    return (
      '<div class="chips' +
      (wrap ? " chips--wrap" : "") +
      '" data-seg="' +
      name +
      '">' +
      options
        .map(function (o) {
          return (
            '<button type="button" class="chip" data-value="' +
            esc(o[0]) +
            '" aria-pressed="' +
            (String(o[0]) === String(value)) +
            '">' +
            esc(o[1]) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function field(label, inner, hint) {
    return (
      '<div class="field"><span class="field__label">' +
      esc(label) +
      "</span>" +
      inner +
      (hint ? '<p class="field__hint">' + hint + "</p>" : "") +
      "</div>"
    );
  }

  function numInput(path, attrs) {
    var a = attrs || {};
    var v = getPath(path);
    return (
      '<input class="input" type="number" inputmode="decimal" data-path="' +
      path +
      '" step="' +
      (a.step || "any") +
      '"' +
      (a.min != null ? ' min="' + a.min + '"' : "") +
      (a.max != null ? ' max="' + a.max + '"' : "") +
      (a.placeholder ? ' placeholder="' + esc(a.placeholder) + '"' : "") +
      ' value="' +
      esc(v == null ? "" : v) +
      '" />'
    );
  }

  function errorBox(msg) {
    return '<p class="error">' + esc(msg) + "</p>";
  }

  function noticeHtml() {
    if (!state.notice) return "";
    return state.notice.kind === "ok"
      ? '<p class="note"><strong>Готово.</strong> ' + esc(state.notice.text) + "</p>"
      : errorBox(state.notice.text);
  }

  function formulaMacros() {
    var p = state.profile;
    var age = num(p.age),
      h = num(p.heightCm);
    var entries = sortedEntries().filter(function (e) {
      return e.source !== "profile";
    });
    if (!entries.length) entries = sortedEntries();
    var w =
      entries.length && entries[entries.length - 1].weightKg >= 30
        ? entries[entries.length - 1].weightKg
        : num(p.weightKg);
    if (!(age >= 14 && age <= 90 && h >= 120 && h <= 230 && w >= 30 && w <= 250)) return null;
    return KM.calcMacros({
      sex: p.sex,
      age: age,
      heightCm: h,
      weightKg: w,
      activity: p.activity,
      goal: p.goal
    });
  }

  function profileMatchesSaved() {
    var saved = state.day && state.day.nutrition;
    if (!saved) return false;
    var p = state.profile;
    return (
      saved.sex === p.sex &&
      saved.goal === p.goal &&
      saved.activity === p.activity &&
      Number(saved.age) === num(p.age) &&
      Math.abs(num(saved.heightCm) - num(p.heightCm)) < 1 &&
      Math.abs(num(saved.weightKg) - num(p.weightKg)) < 0.15
    );
  }

  /**
   * Норма дня: одна цифра на «Сегодня», «Меню» и «Съедено».
   * Если анкета совпадает с сервером, беру targets целиком (ккал и БЖУ),
   * иначе локальная формула до ответа API.
   */
  function macros() {
    var local = formulaMacros();
    var server = state.day && state.day.targets && state.day.targets.kcal ? state.day.targets : null;
    if (!local) return server;
    if (server && profileMatchesSaved()) {
      return {
        kcal: server.kcal,
        proteinG: server.proteinG,
        fatG: server.fatG,
        carbsG: server.carbsG,
        bmr: server.bmr != null ? server.bmr : local.bmr,
        tdee: server.tdee != null ? server.tdee : local.tdee,
        source: server.source || "formula",
        note: server.note,
        formulaKcal: server.formulaKcal != null ? server.formulaKcal : local.kcal
      };
    }
    return local;
  }

  /** Источник дневника веса: база бота, если приложение online, иначе устройство. */
  function sortedEntries() {
    var src = state.day && state.day.bodyweight ? state.day.bodyweight : state.entries;
    return src.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }

  /**
   * Последний вес для карточек. Дневник взвешиваний главный; если его ещё нет,
   * берём цифру из анкеты — иначе после «Изменить данные» на профиле висит «нет».
   */
  function lastWeighIn() {
    var entries = sortedEntries();
    if (entries.length) {
      var e = entries[entries.length - 1];
      return {
        weightKg: e.weightKg,
        date: e.date,
        fromDiary: true,
        source: e.source === "profile" ? "profile" : "user"
      };
    }
    var kg = num(state.profile.weightKg);
    if (kg >= 30 && kg <= 250) return { weightKg: kg, date: null, fromDiary: false };
    return null;
  }

  function serverToday() {
    return state.day && state.day.today ? state.day.today : today();
  }

  function viewDate() {
    return state.viewDate || serverToday();
  }

  function shiftDate(iso, days) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /* ── Дневник еды ────────────────────────────────────────────────────────── */
  // Два режима. С сервером (приложение открыто из Telegram и раздаётся ботом):
  // фото, текст и ручной ввод, дневник общий с чатом. Без сервера: только ручной
  // ввод и хранение на устройстве — распознавание требует ключа, которого в
  // клиентском коде нет и быть не должно.

  var online = KM_API.available();

  function mealsToday() {
    if (state.day) return state.day.meals;
    var d = today();
    return state.localMeals.filter(function (m) {
      return m.date === d;
    });
  }

  function eatenTotals() {
    if (state.day) return state.day.totals;
    return mealsToday().reduce(
      function (t, m) {
        return {
          kcal: t.kcal + m.kcal,
          proteinG: t.proteinG + m.proteinG,
          fatG: t.fatG + m.fatG,
          carbsG: t.carbsG + m.carbsG,
          count: t.count + 1
        };
      },
      { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, count: 0 }
    );
  }

  function photoAllowed() {
    return Boolean(state.day && state.day.visionEnabled);
  }

  function loadDay(silent, refresh) {
    // Проверяем заново: SDK Telegram — внешний файл и мог прийти позже первой
    // отрисовки. Разовая проверка на старте оставляла приложение в локальном
    // режиме до перезапуска.
    if (!online) online = KM_API.available();
    if (!online) return;
    KM_API.state(state.viewDate || undefined, refresh)
      .then(function (data) {
        state.day = data;
        state.linkError = null;
        needJoin = null;
        if (data.pending !== undefined) state.pending = data.pending;
        // План тренировки ведёт бот: в чате и в приложении должна быть одна
        // очередь A/B. Ручное переключение в этой сессии не перетираем.
        if (!workoutTouched && data.simple) {
          state.workout.place = data.simple.place === "gym" ? "gym" : "home";
          if (data.simple.level === "start" || data.simple.level === "train") {
            state.workout.level = data.simple.level;
          }
          if (data.simple.split) state.workout.split = data.simple.split;
          state.workout.plan = data.simple.idx % planList().length;
        }
        migrateWeights();
        if (!state.restDays) state.restDays = {};
        if (data.restDate) state.restDays[data.restDate] = true;
        else delete state.restDays[data.today || serverToday()];
        // Обратный случай: анкета заполнена в приложении, а в базе бота её нет.
        // Так было всё время, пока подпись не проходила проверку: ответы жили
        // только на устройстве, поэтому бот и норма воды считали по ориентиру
        // 80 кг вместо настоящего веса.
        if (!data.nutrition && state.setupDone && macros()) {
          syncProfile(function (fresh) {
            state.day = fresh;
            render();
          });
        }
        // Профиль из бота подхватываем только на чистой установке, иначе перетрём то,
        // что человек уже ввёл в приложении
        if (!hadSavedProfile && data.nutrition) {
          Object.assign(state.profile, data.nutrition);
          hadSavedProfile = true;
          // Данные уже введены в боте — второй раз спрашивать нечего
          if (state.screen === "setup") {
            state.setupDone = true;
            state.screen = "home";
          }
          persist();
        }
        if (!silent) render();
        else if (state.screen === "home" || state.screen === "nutrition" || state.screen === "profile") render();
      })
      .catch(function (err) {
        // 401 — приложение открыто вне Telegram или подпись устарела: уходим
        // в локальный режим, он честно об этом скажет на экране
        if (err && err.status === 401) {
          online = false;
          state.linkError = null;
          needJoin = null;
        } else if (err && err.status === 403 && err.code === "join") {
          needJoin = err.data || {};
          state.linkError = null;
        } else {
          // Сеть, таймаут, сбой сервера: причину показываем, а не прячем за
          // «фото не работает» — иначе человек ищет поломку не там
          state.linkError = (err && err.message) || "Сервер бота не ответил.";
        }
        render();
      });
  }

  var workoutTouched = false;
  var workoutPick = false;

  /**
   * Разовый перенос дневника веса с устройства в базу бота. Локальные записи
   * не удаляем: они остаются резервом и работают, если приложение открыли
   * в обычном браузере.
   */
  function migrateWeights() {
    if (state.migrated || !state.day || !state.entries.length) return;
    var have = {};
    (state.day.bodyweight || []).forEach(function (b) {
      have[b.date] = true;
    });
    var todo = state.entries.filter(function (e) {
      return !have[e.date];
    });
    if (!todo.length) {
      state.migrated = true;
      persist();
      return;
    }
    todo
      .reduce(function (chain, e) {
        return chain.then(function () {
          return KM_API.saveWeight(e.weightKg, e.date).then(function (data) {
            state.day = data;
          });
        });
      }, Promise.resolve())
      .then(function () {
        state.migrated = true;
        persist();
        render();
      })
      .catch(function () {
        /* перенос повторится при следующем открытии — данные на устройстве целы */
      });
  }

  function applyMealResult(data, okText) {
    state.day = data;
    state.busy = null;
    state.notice = { kind: "ok", text: okText };
    state.addMode = null;
    state.mealText = "";
    state.manual = { name: "", kcal: "", proteinG: "", fatG: "", carbsG: "" };
    // Запоминаем последнюю запись, чтобы предложить правку порции. Состав модель
    // видит, вес — нет: именно порция и есть главный источник ошибки в оценке.
    state.lastMeal =
      data && data.mealId && data.meal
        ? { id: data.mealId, name: data.meal.name, kcal: data.meal.kcal, factor: 1 }
        : null;
    haptic("medium");
    render();
  }

  /**
   * Разбор пришёл, но в дневник не записан: показываем, что распознано, и ждём
   * ответа. Раньше запись появлялась молча — неверную догадку человек находил
   * уже в дневнике и удалял, вместо того чтобы просто не согласиться.
   */
  function applyPendingResult(data) {
    state.day = data;
    state.busy = null;
    state.notice = null;
    state.addMode = null;
    state.pending = data && data.pending ? data.pending : null;
    // Фото и текст стартуют с «Сегодня». Карточка «это оно» жила только
    // в «Питании»: разбор приходил, спиннер гас, на экране ничего не менялось.
    if (state.pending) {
      state.screen = "nutrition";
      state.nutTab = "eaten";
    }
    haptic("light");
    render();
  }

  /** «Да, это оно» → запись в дневник по токену. Цифры считает сервер. */
  function confirmPending() {
    var p = state.pending;
    if (!p || !online) return;
    state.busy = "food";
    render();
    KM_API.confirmMeal(p.token)
      .then(function (data) {
        state.pending = null;
        clearPhotoPreview();
        applyMealResult(data, "Записал: " + data.meal.name + ", " + data.meal.kcal + " ккал.");
      })
      .catch(function (err) {
        if (pendingGone(err)) state.pending = null;
        mealError(err);
      });
  }

  /**
   * Правка разбора: убрать позицию или поправить вес.
   *
   * Считает сервер и возвращает поправленный разбор целиком — клиент не трогает
   * калории даже у себя на экране, иначе цифра в карточке и цифра в записи
   * разошлись бы на округлении.
   */
  function editPendingPart(call) {
    var p = state.pending;
    if (!p || !online) return;
    state.busy = "food";
    state.notice = null;
    render();
    call(p.token)
      .then(function (data) {
        state.day = data;
        state.busy = null;
        state.pending = data && data.pending ? data.pending : null;
        haptic("light");
        render();
      })
      .catch(function (err) {
        if (pendingGone(err)) state.pending = null;
        mealError(err);
      });
  }

  function dropPendingPart(index) {
    editPendingPart(function (token) {
      return KM_API.dropPart(token, index);
    });
  }

  function setPendingPartGrams(index, grams) {
    if (!(grams >= 1 && grams <= 3000)) return render();
    editPendingPart(function (token) {
      return KM_API.partGrams(token, index, grams);
    });
  }

  /**
   * «Не то» → разбор выбрасывается, а состав подставляется в поле ввода:
   * поправить одну позицию быстрее, чем набирать тарелку заново.
   */
  function rejectPending() {
    var p = state.pending;
    if (!p) return;
    var parts = (p.meal && p.meal.parts) || [];
    state.mealText = parts.length
      ? parts
          .map(function (x) {
            return x.name.toLowerCase() + " " + x.grams + " г";
          })
          .join(", ")
      : String((p.meal && p.meal.name) || "");
    state.addMode = "text";
    state.notice = null;
    if (online) KM_API.rejectMeal(p.token).catch(function () {});
    state.pending = null;
    clearPhotoPreview();
    haptic("light");
    render();
  }

  /**
   * Строка состава: правится на месте, а не «принять или отказаться».
   *
   * Вес модель угадывает по виду, поэтому это поле ввода, а не текст. Крестик
   * нужен для другой ошибки — придуманной позиции: на снимке одного яблока
   * приходило «яблоко 180 г, салат 180 г», и убрать только салат было нельзя.
   * У последней позиции крестика нет: отказ от всего разбора — это кнопка ниже.
   */
  function partRowHtml(x, i, total) {
    return (
      '<li class="edit__row"><span class="edit__name">' +
      esc(x.name) +
      // Помечаем только исключение. Слово «справочник» у каждой строки ничего не
      // сообщало — оно там всегда, — но глушило тот случай, ради которого
      // пометка и нужна: цифры прочитаны с упаковки.
      (x.source === "label" ? '<span class="edit__from">цифры с упаковки</span>' : "") +
      (x.source === "barcode" ? '<span class="edit__from">найден по штрихкоду</span>' : "") +
      (x.source === "similar" ? '<span class="edit__from">по похожему продукту</span>' : "") +
      "</span>" +
      '<span class="edit__g"><input class="edit__input" type="number" inputmode="numeric" ' +
      'min="1" max="3000" step="5" value="' +
      x.grams +
      '" data-part-g="' +
      i +
      '" aria-label="Вес в граммах" /> г</span>' +
      '<span class="edit__kcal">' +
      x.kcal +
      " ккал</span>" +
      (total > 1
        ? '<button type="button" class="edit__del" data-part-drop="' +
          i +
          '" aria-label="Убрать позицию">×</button>'
        : '<span class="edit__del edit__del--off" aria-hidden="true"></span>') +
      "</li>"
    );
  }

  function pendingTeaserCard() {
    var p = state.pending;
    if (!p || !p.meal || state.screen === "nutrition") return "";
    var m = p.meal;
    return (
      card(
        cardHead("Ждёт подтверждения", m.kcal + " ккал") +
          '<p class="muted">' +
          esc(m.name) +
          '</p><div class="btn-stack"><button class="btn btn--primary" data-action="open-pending">Посмотреть разбор</button></div>'
      )
    );
  }

  /**
   * Что распознано и на каких допущениях — до записи, а не после.
   *
   * Цифра без объяснения непроверяема: по «240 ккал» нельзя понять, что модель
   * приняла за курицу и сколько насчитала масла. Поэтому здесь состав по
   * позициям, источник цифр (справочник или упаковка) и слова модели.
   */
  function pendingCard() {
    var p = state.pending;
    if (!p || !p.meal) return "";
    var m = p.meal;
    var parts = m.parts || [];
    var fromLabel = parts.some(function (x) {
      return x.source === "label";
    });
    var bySimilar = parts.some(function (x) {
      return x.source === "similar";
    });

    return card(
      (state.photoPreview
        ? '<div class="shot shot--meal"><img class="shot__img" alt="" src="' +
          esc(state.photoPreview) +
          '" /></div>'
        : "") +
      '<div class="confirm__head">' +
        (state.photoPreview ? "" : thumb(m.slug, m.name, "food", m.photoUrl)) +
        '<span class="confirm__title">' +
        esc(m.name) +
        '<span class="confirm__kcal">' +
        m.kcal +
        " ккал · Б " +
        m.proteinG +
        " / Ж " +
        m.fatG +
        " / У " +
        m.carbsG +
        " г</span></span>" +
        "</div>" +
        '<div class="scan">' +
        '<span class="scan__n"><strong>' +
        m.kcal +
        "</strong> ккал</span>" +
        '<span class="scan__n"><strong>' +
        m.proteinG +
        "</strong> белок</span>" +
        '<span class="scan__n"><strong>' +
        m.fatG +
        "</strong> жир</span>" +
        '<span class="scan__n"><strong>' +
        m.carbsG +
        "</strong> углеводы</span>" +
        "</div>" +
        (parts.length
          ? '<div class="scan__tags">' +
            parts
              .map(function (x) {
                return '<span class="scan__tag">' + esc(x.name) + " · " + x.kcal + " ккал</span>";
              })
              .join("") +
            "</div>"
          : "") +
        '<p class="lead">Это оно? В дневник запишу только после твоего «да». ' +
        "Вес поправь прямо в строке, лишнее убери крестиком.</p>" +
        (parts.length
          ? '<ul class="edit">' +
            parts
              .map(function (x, i) {
                return partRowHtml(x, i, parts.length);
              })
              .join("") +
            "</ul>"
          : "") +
        (m.said ? '<p class="note note--plain">Вижу так: ' + esc(m.said) + "</p>" : "") +
        (m.note ? '<p class="note note--plain">' + esc(m.note) + "</p>" : "") +
        (fromLabel
          ? '<p class="note note--plain">Часть цифр прочитана с упаковки, поэтому сверь ' +
            "с этикеткой, если что-то не сходится.</p>"
          : "") +
        // Подстановка похожего продукта — догадка, а не расчёт. Молча она выглядит
        // как знание, поэтому названа своим именем прямо в карточке.
        (bySimilar
          ? '<p class="note note--plain">Точной марки я не знаю, счёт по похожему продукту. ' +
            "Сними ещё раз так, чтобы попал штрихкод: по нему продукт находится точно.</p>"
          : "") +
        '<div class="btn-stack" style="margin-top:14px">' +
        '<button class="btn btn--primary" data-action="meal-confirm">Да, записать</button>' +
        '<button class="btn btn--outline btn--slim" data-action="meal-reject">Поправить результат</button>' +
        "</div>"
    );
  }

  /** Пересчёт порции у последней записи: множитель, а не четыре числа заново. */
  function scaleLastMeal(factor) {
    var last = state.lastMeal;
    if (!last || !online) return;
    state.busy = "food";
    state.notice = null;
    render();
    KM_API.scaleMeal(last.id, factor)
      .then(function (data) {
        state.day = data;
        state.busy = null;
        state.lastMeal = {
          id: last.id,
          name: data.meal.name,
          kcal: data.meal.kcal,
          factor: last.factor * factor
        };
        state.notice = { kind: "ok", text: "Порция уточнена: " + data.meal.kcal + " ккал." };
        haptic("light");
        render();
      })
      .catch(mealError);
  }

  /**
   * Уточнение порции. Появляется только после свежей записи и исчезает после
   * ухода с экрана: это не постоянный элемент, а вопрос «столько ли ты съел»,
   * заданный один раз в нужный момент.
   */
  function portionCard() {
    var last = state.lastMeal;
    if (!last || !online) return "";
    var steps = [
      [0.5, "половина"],
      [0.75, "меньше"],
      [1.25, "больше"],
      [1.5, "полторы"],
      [2, "две порции"]
    ];
    return card(
      cardHead(
        "Столько и съел?",
        esc(last.name) +
          ", " +
          last.kcal +
          " ккал" +
          (last.factor !== 1 ? " (порция ×" + (Math.round(last.factor * 100) / 100).toString().replace(".", ",") + ")" : "")
      ) +
        '<p class="lead">Состав блюда модель видит, а вес только предполагает. Если порция ' +
        "была другой, поправь множителем: КБЖУ пересчитаются в той же пропорции.</p>" +
        '<div class="chips chips--wrap">' +
        steps
          .map(function (s) {
            return (
              '<button type="button" class="chip" data-portion="' +
              s[0] +
              '">×' +
              s[0] +
              " · " +
              s[1] +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        '<div class="btn-stack" style="margin-top:12px">' +
        '<button class="btn btn--outline btn--slim" data-action="portion-done">Всё верно</button>' +
        "</div>"
    );
  }

  function mealError(err) {
    clearPhotoPreview();
    state.busy = null;
    state.notice = {
      kind: "err",
      text: (err && err.message) || "Не получилось. Попробуй ещё раз."
    };
    if (err && err.data && err.data.photo && state.day) state.day.photo = err.data.photo;
    // Распознавание что-то увидело, но в КБЖУ не перевело: подставляем увиденное
    // в поле ввода текстом. Иначе снимок упирается в тупик и человек бросает запись.
    if (err && err.data && err.data.seen) {
      state.mealText = err.data.seen;
      state.addMode = "text";
    }
    haptic("heavy");
    render();
  }

  /** Разбор протух на сервере — карточку больше не показываем. */
  function pendingGone(err) {
    return Boolean(err && (err.status === 410 || err.code === "pending_gone"));
  }

  /* ── Экран: анкета первого запуска ──────────────────────────────────────── */
  // Одна страница вместо шести форм в разных разделах: эти же данные раньше
  // приходилось вводить отдельно в «Норме» и в «Тренировке».

  function renderSetup() {
    var p = state.profile;
    return (
      card(
        cardHead("Шесть полей, и всё считается", "Данные остаются на устройстве и в твоём чате с ботом") +
          '<p class="lead">Норма калорий, порции в меню, план тренировок и тренд веса ' +
          "берутся из этих цифр. Позже поменяешь их в «Питании» и «Тренировке».</p>"
      ) +
      card(
        field("Пол", chips("sex", p.sex, [["m", "Мужчина"], ["f", "Женщина"]])) +
          '<div class="row">' +
          field("Возраст, лет", numInput("profile.age", { min: 14, max: 90, step: 1 })) +
          field("Рост, см", numInput("profile.heightCm", { min: 120, max: 230, step: 1 })) +
          "</div>" +
          field("Вес, кг", numInput("profile.weightKg", { min: 30, max: 250, step: 0.1 })) +
          field(
            "Активность",
            chips("activity", p.activity, [
              ["low", "Низкая"],
              ["mid", "Средняя"],
              ["high", "Высокая"]
            ]),
            "Низкая: 1–3 тренировки в неделю и сидячая работа. Средняя: 3–5 тренировок. " +
              "Высокая: 6 и больше или физический труд."
          ) +
          field(
            "Цель",
            chips("goal", p.goal, [
              ["bulk", "Набор"],
              ["cut", "Сушка"],
              ["maint", "Поддержание"]
            ])
          ) +
          field("Где тренируешься", chips("s_place", state.workout.place, [["home", "Дома"], ["gym", "В зале"]])) +
          field("Программа", programShelfHtml("s_split", workoutSplit())) +
          '<div class="btn-stack" style="margin-top:18px">' +
          '<button class="btn btn--primary" data-action="setup-done">Готово</button>' +
          '<button class="btn btn--outline btn--slim" data-action="setup-skip">Пропустить</button>' +
          "</div>" +
          (state.result === "setup-error"
            ? '<div style="margin-top:12px">' +
              errorBox("Проверь возраст (14–90), рост (120–230 см) и вес (30–250 кг).") +
              "</div>"
            : "")
      )
    );
  }

  function finishSetup() {
    if (!macros()) {
      state.result = "setup-error";
      haptic("heavy");
      return render();
    }
    state.setupDone = true;
    state.result = null;
    var w = num(state.profile.weightKg);
    // Первый вес сразу в дневник: иначе тренд начнёт считаться только со второй записи
    if (!state.entries.length) state.entries.push({ date: today(), weightKg: Math.round(w * 10) / 10 });
    persist();
    syncProfile();
    if (online) {
      KM_API.saveWeight(Math.round(w * 10) / 10).catch(function () {});
    }
    // Место и ступень иначе останутся только на устройстве: loadDay потом
    // перетрёт их значением бота по умолчанию.
    workoutTouched = true;
    if (online) {
      KM_API.saveSettings({
        place: state.workout.place,
        level: workoutLevel(),
        split: workoutSplit()
      }).catch(function () {});
    }
    haptic("medium");
    go("home");
  }

  function syncProfile(onSaved) {
    if (!online || !macros()) return;
    KM_API.saveProfile({
      sex: state.profile.sex,
      age: num(state.profile.age),
      heightCm: num(state.profile.heightCm),
      weightKg: num(state.profile.weightKg),
      goal: state.profile.goal,
      activity: state.profile.activity
    })
      .then(function (fresh) {
        // Ответ — свежее состояние дня: норма воды и карточка веса считаются
        // отсюда. Раньше ответ выбрасывали, и профиль оставался с «нет».
        if (fresh) state.day = fresh;
        if (onSaved && fresh) onSaved(fresh);
        else if (fresh) render();
      })
      .catch(function () {
        /* норма всё равно посчитана локально — молчим */
      });
  }

  /* ── Экран: сегодня ─────────────────────────────────────────────────────── */
  // Один экран — один вопрос: сколько ещё можно съесть и что нажать. Формулы,
  // коэффициенты и вторые цифры живут в «Расчётах»: здесь они только мешают.

  /** Кольцо дня: доля съеденного, крупная цифра остатка в центре. */
  function ring(pct, value, unit, note, over) {
    var r = 74;
    var c = 2 * Math.PI * r;
    var filled = Math.max(0, Math.min(1, pct / 100));
    return (
      '<div class="ring"><svg viewBox="0 0 172 172" aria-hidden="true">' +
      '<circle cx="86" cy="86" r="' +
      r +
      '" fill="none" stroke="var(--track)" stroke-width="9" />' +
      '<circle class="ring__arc" cx="86" cy="86" r="' +
      r +
      '" fill="none" stroke="' +
      (over ? "#d98a8a" : "var(--gold)") +
      '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' +
      c.toFixed(1) +
      '" stroke-dashoffset="' +
      (c * (1 - filled)).toFixed(1) +
      '" /></svg>' +
      '<div class="ring__mid"><span class="ring__value">' +
      esc(value) +
      '</span><span class="ring__unit">' +
      esc(unit) +
      "</span>" +
      (note ? '<span class="ring__note">' + esc(note) + "</span>" : "") +
      "</div></div>"
    );
  }

  var TILE_ICONS = {
    photo: "M4 8.5A2.5 2.5 0 0 1 6.5 6h1L9 4h6l1.5 2h1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    repeat: "M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M17 4v3h-3M7 20v-3h3",
    water: "M12 3.5s6 6.6 6 10.4A6 6 0 0 1 6 13.9C6 10.1 12 3.5 12 3.5z",
    text: "M5 6.5h14M5 12h14M5 17.5h9"
  };

  function tile(action, icon, label, gold) {
    return (
      '<button class="tile' +
      (gold ? " tile--gold" : "") +
      '" data-action="' +
      action +
      '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="' +
      TILE_ICONS[icon] +
      '"/></svg><span class="tile__label">' +
      label +
      "</span></button>"
    );
  }

  /**
   * Серия дней с записанной едой. Смысл не в игре: пропуск двух дней подряд —
   * это и есть момент, когда дневник бросают, и его видно до того, как бросили.
   */
  function streakStrip() {
    var s = state.day && state.day.streak ? state.day.streak : null;
    if (!s) return "";
    var dots = (s.last7 || [])
      .map(function (on) {
        return '<span class="streak__dot' + (on ? " streak__dot--on" : "") + '"></span>';
      })
      .join("");
    var text = s.days
      ? s.days + " " + plural(s.days, "день", "дня", "дней") + " подряд с дневником"
      : "Серия прервана. Запиши любой приём, и она начнётся заново";
    return (
      '<div class="streak"><div class="streak__dots">' +
      dots +
      '</div><span class="streak__text">' +
      esc(text) +
      "</span></div>"
    );
  }

  function progressData() {
    return state.day && state.day.progress ? state.day.progress : null;
  }

  /** Главная карточка экрана «Прогресс»: серия и зачем не бросать. */
  function progressHeroCard() {
    var p = progressData();
    var s = p ? p.streak : state.day && state.day.streak;
    if (!s) return "";
    var days = s.days || 0;
    var sub =
      days >= 14
        ? "Дневник стал привычкой. Бросить сейчас: выкинешь " + days + " " + plural(days, "день", "дня", "дней") + " истории."
        : days >= 7
          ? "Неделя подряд. Прогноз и тренд уже опираются на твои данные, а не на анкету."
          : days >= 1
            ? "Не прерывай сегодня: одна запись еды сохраняет серию."
            : "Запиши любой приём: серия начнётся с сегодняшнего дня.";
    var dots = (s.last7 || [])
      .map(function (on) {
        return '<span class="streak__dot' + (on ? " streak__dot--on" : "") + '"></span>';
      })
      .join("");
    return card(
      cardHead(
        days ? days + " " + plural(days, "день", "дня", "дней") + " подряд" : "Серия не начата",
        "Дневник еды",
        days ? "серия" : "мотивация"
      ) +
        '<div class="progress-hero">' +
        figure(String(days || "0"), "", "дней подряд с записью") +
        '<div class="streak__dots progress-hero__dots">' +
        dots +
        "</div></div>" +
        '<p class="lead">' +
        esc(sub) +
        "</p>",
      { gold: true }
    );
  }

  /** Семь дней: еда и тренировки. Видно, где человек срывается. */
  function weekMomentumCard() {
    var p = progressData();
    if (!p || !p.week) return "";
    var today = state.day && state.day.date ? state.day.date : new Date().toISOString().slice(0, 10);
    var dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    var shiftDay = function (base, back) {
      var d = new Date(base + "T12:00:00");
      d.setDate(d.getDate() - back);
      return d;
    };
    var mealDots = (p.streak.last7 || [])
      .map(function (on, i) {
        var d = shiftDay(today, 6 - i);
        var label = dayNames[d.getDay()];
        var wo = p.week.last7Workouts && p.week.last7Workouts[i];
        return (
          '<div class="week-day"><span class="week-day__label">' +
          label +
          '</span><span class="week-day__meal' +
          (on ? " week-day__meal--on" : "") +
          '" title="Еда"></span><span class="week-day__wo' +
          (wo ? " week-day__wo--on" : "") +
          '" title="Тренировка"></span></div>'
        );
      })
      .join("");
    return card(
      cardHead(
        "Последние 7 дней",
        p.week.mealDays +
          "/7 с едой · " +
          p.week.workoutDays +
          " " +
          plural(p.week.workoutDays, "тренировка", "тренировки", "тренировок"),
        p.week.proteinHitDays
          ? "белок в норме " + p.week.proteinHitDays + " " + plural(p.week.proteinHitDays, "день", "дня", "дней")
          : null
      ) +
        '<div class="week-grid">' +
        mealDots +
        "</div>" +
        '<p class="note note--plain">Золотой кружок: запись еды. Полоска: тренировка.</p>'
    );
  }

  /** Прогноз по цели или честный счётчик до него. */
  function forecastProgressCard() {
    var entries = sortedEntries();
    var advice = KM.weightTrendAdvice(entries, state.profile.goal);
    var goal = num(state.goalWeightKg);
    var last = sortedEntries().slice(-1)[0];
    var w = progressData() && progressData().weigh;

    if (advice && last && goal >= 30 && goal <= 250) {
      var delta = goal - last.weightKg;
      if (Math.abs(delta) < 0.3) {
        return card(
          cardHead("Цель достигнута", goal + " кг") +
            '<p class="lead">Держи норму и наблюдай тренд. Новую цель задаёшь ниже.</p>',
          { gold: true }
        );
      }
      var rate = advice.rateKgWeek;
      if (rate && delta * rate > 0) {
        var weeks = Math.abs(delta / rate);
        if (weeks <= 104) {
          var when = new Date();
          when.setDate(when.getDate() + Math.round(weeks * 7));
          return card(
            cardHead(
              "Прогноз по факту",
              String(when.getDate()).padStart(2, "0") +
                "." +
                String(when.getMonth() + 1).padStart(2, "0") +
                "." +
                when.getFullYear(),
              (rate > 0 ? "+" : "") + rate + " кг/нед"
            ) +
              figure(
                (delta > 0 ? "+" : "") + delta.toFixed(1),
                " кг",
                "до цели " + goal + " кг"
              ) +
              '<p class="lead">' +
              esc(advice.verdict || advice.text) +
              "</p>" +
              '<p class="note note--plain">Считается только по взвешиваниям, не по обещаниям из анкеты.</p>',
            { gold: true }
          );
        }
      }
      return card(
        cardHead("Вес идёт не к цели", "Цель " + goal + " кг") +
          '<p class="lead">Тренд ' +
          (rate > 0 ? "+" : "") +
          rate +
          " кг/нед, до цели " +
          (delta > 0 ? "+" : "") +
          delta.toFixed(1) +
          " кг. Правь калории в «Питании».</p>"
      );
    }

    if (!w) return "";
    if (w.trendReady) {
      return card(
        cardHead("Тренд считается", w.count28 + " взвешивания") +
            '<p class="lead">Задай цель по весу ниже: покажу дату при текущем темпе.</p>'
      );
    }
    var lines = [];
    if (w.need > 0) {
      lines.push(
        "Ещё <strong>" +
          w.need +
          "</strong> " +
          plural(w.need, "взвешивание", "взвешивания", "взвешиваний") +
          " за 28 дней, и откроется прогноз."
      );
    }
    if (w.count28 >= 4 && w.spanDays !== null && w.spanDays < 10) {
      lines.push(
        "Между первым и последним взвешиванием нужно <strong>10 дней</strong>, сейчас " +
          w.spanDays +
          ". Иначе тренд врёт из‑за воды."
      );
    }
    if (!lines.length) {
      lines.push("Взвешивайся 3–4 раза в неделю утром: прогноз строится только из факта.");
    }
    return card(
      cardHead("До прогноза", w.count28 + " из 4 взвешиваний") +
        '<p class="lead">' +
        lines.join(" ") +
        "</p>" +
        '<div class="btn-stack"><button class="btn btn--outline btn--slim" data-action="scroll-diary">Записать вес</button></div>'
    );
  }

  /** Сильнейшие подходы по оценке 1ПМ — повод вернуться в зал. */
  function topLiftsCard() {
    var p = progressData();
    var lifts = p && p.topLifts ? p.topLifts : [];
    if (!lifts.length) {
      return card(
        cardHead("Сила", "Пока нет записей") +
          '<p class="lead">Отметь тренировку с весами: здесь появятся твои сильнейшие движения.</p>' +
          '<div class="btn-stack"><button class="btn btn--outline btn--slim" data-go="workout">К тренировке</button></div>'
      );
    }
    return card(
      cardHead("Сильнейшие движения", "по оценке 1ПМ", String(p.workoutsTotal || lifts.length) + " тренировок всего") +
        '<ul class="log">' +
        lifts
          .map(function (l) {
            return (
              '<li><span class="log__date">' +
              esc(formatDate(l.date)) +
              '</span><span class="log__value">' +
              esc(l.exercise) +
              " · " +
              l.weightKg +
              " кг × " +
              l.reps +
              ' <span class="muted">(~' +
              l.e1rm +
              " кг 1ПМ)</span></span></li>"
            );
          })
          .join("") +
        "</ul>"
    );
  }

  /** На «Сегодня» — одна строка, почему зайти в прогресс. */
  function progressTeaserCard() {
    var p = progressData();
    if (!p) return "";
    var days = p.streak.days || 0;
    var head =
      days >= 1
        ? "Серия " + days + " " + plural(days, "день", "дня", "дней")
        : "Начни серию сегодня";
    var sub =
      p.weigh && !p.weigh.trendReady && p.weigh.need > 0
        ? "До прогноза " + p.weigh.need + " " + plural(p.weigh.need, "взвешивание", "взвешивания", "взвешиваний")
        : p.week.mealDays + "/7 дней с едой на этой неделе";
    return (
      '<button type="button" class="card card--tap' +
      (days >= 7 ? " card--gold" : "") +
      '" data-action="go-progress">' +
      cardHead(head, sub, "прогресс") +
      '<p class="lead">Открой, чтобы увидеть неделю, прогноз и силовые рекорды.</p></button>'
    );
  }

  function sameAsOffered() {
    var s = state.day && state.day.sameAs;
    return s && s.meals && s.meals.length ? s : null;
  }

  function sameAsSkipped() {
    var s = sameAsOffered();
    var skip = state.sameAsSkip;
    return !!(s && skip && skip.date === serverToday() && skip.slot === s.slot);
  }

  /**
   * Вчера в этот час: спросить, то же ли блюдо, и не писать в дневник сразу.
   * Слот берётся с сервера по часу Бангкока: утром завтрак, днём обед.
   */
  function sameAsCard() {
    var s = sameAsOffered();
    if (!s || sameAsSkipped()) return "";
    var kcal = s.meals.reduce(function (a, m) {
      return a + m.kcal;
    }, 0);
    var list = s.meals
      .map(function (m) {
        return esc(m.name) + ", " + m.kcal + " ккал";
      })
      .join("; ");
    var pics = s.meals
      .map(function (m) {
        return thumb(m.slug, m.name, "food", m.photoUrl);
      })
      .join("");
    var when =
      s.title === "как обычно"
        ? "Как обычно. Записать то же?"
        : s.title === "вчера"
          ? "Вчера было то же?"
          : "Вчера на " + esc(s.title) + " было то же?";
    return card(
      (pics ? '<div class="confirm__head">' + pics + "</div>" : "") +
      '<p class="lead">' +
        when +
        "</p>" +
        '<p class="muted">' +
        list +
        " · " +
        kcal +
        " ккал</p>" +
        '<div class="btn-stack">' +
        '<button class="btn btn--primary" data-action="same-as-yes">Да, записать</button>' +
        '<button class="btn btn--outline btn--slim" data-action="same-as-no">Нет, другое</button>' +
        "</div>"
    );
  }

  function repeatAskCard() {
    var a = state.repeatAsk;
    if (!a) return "";
    return card(
      '<p class="lead">Записать ещё раз?</p>' +
        '<p class="muted">' +
        esc(a.name) +
        ", " +
        a.kcal +
        " ккал</p>" +
        '<div class="btn-stack">' +
        '<button class="btn btn--primary" data-action="repeat-yes">Да, записать</button>' +
        '<button class="btn btn--outline btn--slim" data-action="repeat-no">Нет</button>' +
        "</div>"
    );
  }

  /** Частые блюда: сначала вопрос, потом запись. Иначе повтор уезжает в дневник с одного касания. */
  function frequentRow() {
    var list = state.day && state.day.frequent ? state.day.frequent : [];
    var offered = sameAsOffered();
    var skip = {};
    if (offered && !sameAsSkipped()) {
      offered.meals.forEach(function (m) {
        skip[String(m.name).trim().toLowerCase()] = true;
      });
    }
    list = list.filter(function (f) {
      return !skip[String(f.name).trim().toLowerCase()];
    });
    if (!list.length) return "";
    return (
      '<div class="chips chips--wrap" style="margin-bottom:12px">' +
      list
        .slice(0, 3)
        .map(function (f) {
          var short = f.name.length > 22 ? f.name.slice(0, 21).replace(/[ ,]+$/, "") + "…" : f.name;
          return (
            '<button type="button" class="chip" data-repeat-ask="' +
            esc(f.name) +
            '" data-kcal="' +
            f.kcal +
            '">↺ ' +
            esc(short) +
            " · " +
            f.kcal +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /**
   * Прогноз: где будет вес при текущей скорости. Считается только по факту —
   * четыре взвешивания и настоящий тренд. Обещать «−8 кг за месяц» по анкете,
   * как это делают соседи по нише, значит один раз соврать и один раз потерять
   * человека, когда прогноз не сойдётся.
   */
  function projectionNote(advice) {
    if (!advice) return "";
    var goal = num(state.goalWeightKg);
    var last = sortedEntries().slice(-1)[0];
    if (!last || !(goal >= 30 && goal <= 250)) return "";
    var delta = goal - last.weightKg;
    if (Math.abs(delta) < 0.3) {
      return '<p class="note"><strong>Цель по весу достигнута.</strong> ' + goal + " кг. Держи норму и наблюдай.</p>";
    }
    var rate = advice.rateKgWeek;
    if (!rate || delta * rate <= 0) {
      return (
        '<p class="note"><strong>Вес идёт не в сторону цели.</strong> Тренд ' +
        (rate > 0 ? "+" : "") +
        rate +
        " кг/нед, до цели " +
        (delta > 0 ? "+" : "") +
        delta.toFixed(1) +
        " кг. Правь калории в «Питании».</p>"
      );
    }
    var weeks = Math.abs(delta / rate);
    if (weeks > 104) return "";
    var when = new Date();
    when.setDate(when.getDate() + Math.round(weeks * 7));
    return (
      '<p class="note"><strong>При текущем темпе</strong> ' +
      goal +
      " кг примерно к " +
      String(when.getDate()).padStart(2, "0") +
      "." +
      String(when.getMonth() + 1).padStart(2, "0") +
      ": " +
      (rate > 0 ? "+" : "") +
      rate +
      " кг/нед по взвешиваниям за " +
      advice.days +
      " " +
      plural(advice.days, "день", "дня", "дней") +
      ".</p>"
    );
  }

  function renderHome() {
    var m = macros();
    var entries = sortedEntries();
    var advice = KM.weightTrendAdvice(entries, state.profile.goal);
    var last = lastWeighIn();
    var place = state.workout.place;
    var plan = planList()[state.workout.plan] || planList()[0];
    var eaten = eatenTotals();
    var w = water();

    var left = m ? m.kcal - eaten.kcal : 0;
    var over = m ? left < 0 : false;
    var heroCard = m
      ? card(
          cardHead(
            over ? "Перебор" : "Осталось на сегодня",
            "Норма " + m.kcal + " ккал · " + GOAL_WORD[state.profile.goal],
            eaten.count ? eaten.count + " " + plural(eaten.count, "приём", "приёма", "приёмов") : null
          ) +
            ring(
              m.kcal ? (eaten.kcal * 100) / m.kcal : 0,
              (over ? "+" : "") + Math.abs(left),
              "ккал",
              "съедено " + eaten.kcal,
              over
            ) +
            '<div class="bars">' +
            bar("Белок", "#cba968", eaten.proteinG + " / " + m.proteinG + " г", (eaten.proteinG * 100) / m.proteinG) +
            bar("Жиры", "#b08d45", eaten.fatG + " / " + m.fatG + " г", (eaten.fatG * 100) / m.fatG) +
            bar("Углеводы", "#7d8ea8", eaten.carbsG + " / " + m.carbsG + " г", (eaten.carbsG * 100) / m.carbsG) +
            "</div>",
          { gold: true, tap: "nutrition" }
        )
      : card(
          cardHead("Норма не задана", "Шесть полей, и появится цифра дня") +
            '<div class="btn-stack"><button class="btn btn--primary" data-action="edit-profile">Задать норму</button></div>'
        );

    return (
      noticeHtml() +
      pendingTeaserCard() +
      heroCard +
      routeCard() +
      (!state.busy && !state.pending && !state.repeatAsk ? sameAsCard() : "") +
      '<div class="tiles">' +
      // Без подписи Telegram фото и распознавание текста недоступны: ключ модели
      // живёт на сервере бота. Предлагать кнопку, которая ответит ошибкой, нельзя.
      // На месте фото стоит попытка связаться заново: это действие, которое чинит
      // ситуацию. Плитки с вопросом здесь быть не должно — она обещает кнопку,
      // а приводит к тексту, и человек нажимает её впустую.
      (online
        ? tile("pick-photo", "photo", "Фото еды", true) + tile("add-text-form", "text", "Текстом")
        : tile("add-manual-form", "text", "Ввести вручную", true) + tile("reload-day", "repeat", "Связь с ботом")) +
      tile("water-250", "water", "+250 мл") +
      "</div>" +
      (state.addMode === "text" ? card(textForm()) : "") +
      (state.addMode === "manual" ? card(manualForm()) : "") +
      (state.busy
        ? card(
            (state.photoPreview
              ? '<div class="shot shot--meal"><img class="shot__img" alt="" src="' +
                esc(state.photoPreview) +
                '" /></div>'
              : "") +
            '<p class="lead">' +
              (state.busy === "photo" ? "Распознаю блюдо…" : "Считаю…") +
              '</p><p class="muted">Обычно 3–10 секунд.</p>'
          )
        : state.pending
          ? pendingCard()
          : portionCard()) +
      frequentRow() +
      streakStrip() +
      progressTeaserCard() +
      '<div class="grid-2">' +
      waterMetric() +
      metric(
        "Вес",
        last ? last.weightKg + ' <span class="figure__unit">кг</span>' : "нет",
        last
          ? advice
            ? (advice.rateKgWeek > 0 ? "+" : "") + advice.rateKgWeek + " кг/нед"
            : last.fromDiary
              ? "запись " + formatDate(last.date)
              : "из анкеты"
          : "ещё не взвешивался"
      ) +
      "</div>" +
      waterHomeChips() +
      card(
        cardHead(
          (workoutLoggedToday() ? "Записана" : "Продолжить") +
            " · " +
            programTitle() +
            " · " +
            esc(plan.label),
          (dayMuscles(plan) || programById(workoutSplit()).blurb) +
            " · " +
            (place === "home" ? "дома" : "зал"),
          plan.items.length + " " + plural(plan.items.length, "упражнение", "упражнения", "упражнений")
        ) +
          '<p class="lead">' +
          plan.items
            .slice(0, 3)
            .map(function (i) {
              return esc(i.name);
            })
            .join(" · ") +
          (plan.items.length > 3 ? " · …" : "") +
          "</p>",
        { tap: "workout" }
      ) +
      projectionNote(advice) +
      (function () {
        var t = macros();
        if (!t || !t.source || t.source === "formula") return "";
        return (
          '<p class="note"><strong>Норма уже сдвинута.</strong> ' +
          esc(t.note || "Цифра считается от факта, не от анкеты.") +
          "</p>"
        );
      })()
    );
  }

  function workoutLoggedToday() {
    var d = serverToday();
    var list = state.day && state.day.workoutsRecent ? state.day.workoutsRecent : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].date === d) return list[i];
    }
    return null;
  }

  function isRestToday() {
    return Boolean(state.restDays && state.restDays[serverToday()]);
  }

  function dayIsToday() {
    return !state.day || state.day.date === (state.day.today || serverToday());
  }

  function dayRoute() {
    var eaten = dayIsToday()
      ? eatenTotals()
      : { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, count: 0 };
    var w = water();
    var last = lastWeighIn();
    var trained = workoutLoggedToday();
    var rest = isRestToday();
    var target = macros();
    var flags = KM.dayRoute({
      eatenKcal: eaten.kcal,
      eatenCount: eaten.count,
      targetKcal: target ? target.kcal : 0,
      waterMl: w.ml,
      waterTargetMl: w.targetMl,
      trainedToday: Boolean(trained),
      restToday: rest,
      lastWeight: last,
      today: serverToday(),
      profileKg: num(state.profile.weightKg) || 0,
      weightCount: sortedEntries().length
    });

    return [
      {
        id: "food",
        name: "Еда",
        hint: target
          ? eaten.kcal + " из " + target.kcal + " ккал"
          : eaten.count
            ? eaten.count + " " + plural(eaten.count, "приём", "приёма", "приёмов")
            : "ещё нет записей",
        on: flags.foodOn,
        action: "route-food",
        cta: "Записать еду"
      },
      {
        id: "water",
        name: "Вода",
        hint: flags.waterOn ? "норма закрыта" : fmtWater(w.ml) + " из " + fmtWater(w.targetMl),
        on: flags.waterOn,
        action: "route-water",
        cta: "+250 мл"
      },
      {
        id: "move",
        name: "Тренировка",
        hint: trained ? trained.name : rest ? "сегодня отдых" : "ещё не отмечена",
        on: flags.moveOn,
        action: "route-workout",
        cta: "Открыть план"
      },
      {
        id: "weight",
        name: "Вес",
        hint:
          last && last.fromDiary && last.source !== "profile"
            ? last.weightKg +
              " кг" +
              (last.date === serverToday() ? ", сегодня" : ", " + formatDate(last.date))
            : last
              ? last.weightKg + " кг из анкеты"
              : "запиши утром",
        on: flags.weightOn,
        action: "route-weight",
        cta: "Записать вес"
      }
    ];
  }

  function routeCard() {
    if (state.day && !dayIsToday()) {
      return card(cardHead("Маршрут дня", "Обновляю данные…"));
    }
    var items = dayRoute();
    var done = items.filter(function (x) {
      return x.on;
    }).length;
    var next = items.filter(function (x) {
      return !x.on;
    })[0];
    var closed = done === items.length;

    return card(
      cardHead(
        closed ? "День закрыт" : "Маршрут дня",
        closed
          ? "Еда, вода, движение и вес на месте."
          : "Следующее: " + next.name.toLowerCase() + ".",
        done + " из " + items.length
      ) +
        '<div class="route">' +
        items
          .map(function (x) {
            return (
              '<button type="button" class="route__item' +
              (x.on ? " is-on" : "") +
              '" data-action="' +
              x.action +
              '"><span class="route__tick" aria-hidden="true"></span><span class="route__text"><span class="route__name">' +
              esc(x.name) +
              '</span><span class="route__hint">' +
              esc(x.hint) +
              "</span></span></button>"
            );
          })
          .join("") +
        "</div>" +
        (closed
          ? ""
          : '<div class="btn-stack" style="margin-top:14px"><button class="btn btn--primary" data-action="' +
            next.action +
            '">' +
            esc(next.cta) +
            "</button>" +
            (next.id === "move"
              ? '<button class="btn btn--outline btn--slim" data-action="route-rest">Сегодня отдых</button>'
              : "") +
            "</div>")
    );
  }

  function markRestDay() {
    var d = serverToday();
    if (!state.restDays) state.restDays = {};
    var on = !state.restDays[d];
    if (on) state.restDays[d] = true;
    else delete state.restDays[d];
    persist();
    haptic("light");
    render();
    if (!state.day) return;
    KM_API.saveSettings({ rest: on })
      .then(function (data) {
        state.day = data;
        if (data.restDate) state.restDays[data.restDate] = true;
        else delete state.restDays[d];
        persist();
        render();
      })
      .catch(function () {});
  }

  function openRouteFood() {
    var food = dayRoute().filter(function (x) {
      return x.id === "food";
    })[0];
    if (food && food.on) {
      state.nutTab = "eaten";
      return go("nutrition");
    }
    if (online) {
      var pick = document.getElementById("photoInput");
      if (pick) {
        pick.value = "";
        haptic("light");
        pick.click();
        return;
      }
    }
    state.addMode = "text";
    state.notice = null;
    haptic("light");
    render();
  }

  function openRouteWater() {
    var waterItem = dayRoute().filter(function (x) {
      return x.id === "water";
    })[0];
    if (waterItem && waterItem.on) {
      state.profTab = "day";
      return go("profile");
    }
    return addWater(250);
  }

  /** Активная программа из базы бота: тот же план, по которому он ведёт в чате. */
  function programCard() {
    var p = state.day && state.day.program;
    if (!p) return "";
    var s = p.session;
    var badge =
      p.currentWeek === p.deloadWeek ? "разгрузка" : p.currentWeek === p.peakWeek ? "пик" : null;

    return card(
      cardHead(
        "Программа · " + modelName(p.model),
        "Неделя " + p.currentWeek + " из " + p.weeks + " · день " + p.currentDay + " из " + p.daysPerWeek,
        badge
      ) +
        (s
          ? sessionHtml(s, p.model) +
            (state.busy === "program"
              ? '<p class="muted" style="margin-top:12px">Записываю…</p>'
              : '<div class="btn-stack" style="margin-top:12px"><button class="btn btn--primary" data-action="program-done">Выполнил, записать</button></div>')
          : '<p class="lead">Цикл пройден. Новый соберешь в профиле, в циклах.</p>')
    );
  }

  function modelName(id) {
    var found = MODELS.filter(function (m) {
      return m[0] === id;
    })[0];
    return found ? found[1] : id;
  }

  /* ── Экран: питание ─────────────────────────────────────────────────────── */

  function renderNutrition() {
    return (
      '<div class="chips" data-seg="nut_tab">' +
      [["eaten", "Съедено"], ["menu", "Меню"], ["norm", "Норма"]]
        .map(function (o) {
          return (
            '<button type="button" class="chip" data-value="' +
            o[0] +
            '" aria-pressed="' +
            (state.nutTab === o[0]) +
            '">' +
            o[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      (state.nutTab === "eaten" ? renderEaten() : state.nutTab === "menu" ? renderMenu() : renderNorm())
    );
  }

  /* ── Питание: готовое меню на день ──────────────────────────────────────── */

  function menuDay() {
    var target = macros();
    return KM_MENUS.day(
      state.menu.id,
      state.profile.goal,
      target ? target.kcal : 0,
      state.menu.swaps || {},
      target
        ? { proteinG: target.proteinG, fatG: target.fatG, carbsG: target.carbsG }
        : null
    );
  }

  function renderMenu() {
    var d = menuDay();
    var target = macros();
    var logged = mealsToday().map(function (m) {
      return m.name;
    });

    return (
      chips(
        "menu_id",
        state.menu.id,
        KM_MENUS.ids.map(function (id) {
          return [id, KM_MENUS.titles[id]];
        })
      ) +
      chips("goal", state.profile.goal, [
        ["bulk", "Набор"],
        ["cut", "Сушка"],
        ["maint", "Поддержание"]
      ]) +
      '<p class="note"><strong>Это не дневник.</strong> Завтрак, обед и перекус ниже собраны под твою норму' +
      (target ? " " + target.kcal + " ккал" : "") +
      (target && target.source === "intake"
        ? ", она сейчас от фактического расхода"
        : target && target.source === "trend"
          ? ", она сдвинута по тренду веса"
          : "") +
      ". То, что уже съел, во вкладке «Съедено». Кнопка «Съел» запишет этот приём, если хочешь есть по плану.</p>" +
      card(
        cardHead(
          d.title,
          target
            ? "Порции под норму " +
              target.kcal +
              " ккал. В плане " +
              d.total.kcal +
              ". Это не то, что уже в дневнике"
            : "Порции под " + d.basedOn + " ккал. Задай свои данные в «Норме», и пересчитаю точнее",
          GOAL_WORD[state.profile.goal]
        ) +
          figure(
            d.total.kcal,
            " ккал",
            target ? "план на день, норма " + target.kcal : "за день по всем приёмам"
          ) +
          '<div class="bars">' +
          (target
            ? bar(
                "Белок",
                "#cba968",
                d.total.proteinG + " / " + target.proteinG + " г",
                (d.total.proteinG * 100) / target.proteinG
              ) +
              bar(
                "Жиры",
                "#b08d45",
                d.total.fatG + " / " + target.fatG + " г",
                (d.total.fatG * 100) / target.fatG
              ) +
              bar(
                "Углеводы",
                "#8a7a52",
                d.total.carbsG + " / " + target.carbsG + " г",
                (d.total.carbsG * 100) / target.carbsG
              )
            : bar("Белок", "#cba968", d.total.proteinG + " г", (d.total.proteinG * 4 * 100) / d.total.kcal) +
              bar("Жиры", "#b08d45", d.total.fatG + " г", (d.total.fatG * 9 * 100) / d.total.kcal) +
              bar("Углеводы", "#8a7a52", d.total.carbsG + " г", (d.total.carbsG * 4 * 100) / d.total.kcal)) +
          "</div>",
        { gold: true }
      ) +
      noticeHtml() +
      d.meals.map(function (m) {
        return menuMealHtml(m, logged.indexOf(mealTitle(m)) !== -1);
      }).join("") +
      '<p class="note"><strong>' +
      esc(d.hint) +
      "</strong> «Сегодня» показывает, что уже съел. Меню это план: калории, белок, жир и углеводы " +
      "подогнаны под твою норму. Крупы закрывают углеводы, курица и творог не раздуваются выше формулы." +
      " Кнопка «Съел» пишет приём в дневник, и остаток смотри на «Сегодня».</p>"
    );
  }

  function mealTitle(m) {
    return m.label + " · " + KM_MENUS.titles[state.menu.id];
  }

  /**
   * Приём меню.
   *
   * Раскрытие живёт в состоянии, а не в классе на элементе, как у остальных
   * гармошек: выбор замены перерисовывает экран, и от класса на элементе не
   * осталось бы ничего — приём закрывался бы сам после каждого нажатия.
   */
  function menuMealHtml(m, alreadyLogged) {
    var open = state.menu.meal === m.key;
    return (
      '<div class="acc' +
      (open ? " is-open" : "") +
      '"><button class="acc__head" data-action="menu-meal" data-mealkey="' +
      esc(m.key) +
      '"><span><span class="acc__title">' +
      esc(m.label) +
      '</span><span class="acc__sub">' +
      m.kcal +
      (m.targetKcal ? " / " + m.targetKcal : "") +
      " ккал · Б " +
      m.proteinG +
      (m.targetProteinG ? " / " + m.targetProteinG : "") +
      " · Ж " +
      m.fatG +
      " · У " +
      m.carbsG +
      '</span></span><span class="acc__sign">' +
      (open ? "–" : "+") +
      '</span></button><div class="acc__body">' +
      (m.targetKcal
        ? '<div class="bars" style="margin:0 0 12px">' +
          bar("Ккал", "var(--gold)", m.kcal + " / " + m.targetKcal, (m.kcal * 100) / m.targetKcal) +
          bar(
            "Белок",
            "#cba968",
            m.proteinG + " / " + m.targetProteinG + " г",
            m.targetProteinG ? (m.proteinG * 100) / m.targetProteinG : 0
          ) +
          bar(
            "Углеводы",
            "#8a7a52",
            m.carbsG + " / " + m.targetCarbsG + " г",
            m.targetCarbsG ? (m.carbsG * 100) / m.targetCarbsG : 0
          ) +
          "</div>"
        : "") +
      '<ul class="pick">' +
      m.items.map(menuItemHtml).join("") +
      "</ul>" +
      '<div class="btn-stack" style="margin-top:12px"><button class="btn ' +
      (alreadyLogged ? "btn--outline" : "btn--primary") +
      ' btn--slim" data-action="log-menu" data-mealkey="' +
      esc(m.key) +
      '">' +
      (alreadyLogged ? "Записать ещё раз" : "Съел, записать в дневник") +
      "</button></div></div></div>"
    );
  }

  /**
   * Позиция приёма: картинка продукта, вес, её КБЖУ.
   *
   * Замены рисуются только у раскрытой позиции. Иначе на экране сразу сотня
   * картинок вместо десятка, и меню открывается заметно дольше.
   */
  function menuItemHtml(i) {
    var open = state.menu.pick === i.id;
    return (
      '<li class="pick__item' +
      (open ? " is-open" : "") +
      '"><button class="pick__row" data-action="menu-pick" data-itemid="' +
      esc(i.id) +
      '">' +
      thumb(i.slug, i.food) +
      '<span class="meal__name">' +
      esc(i.food) +
      " " +
      esc(i.amount) +
      (i.swapped ? '<span class="pick__tag">замена</span>' : "") +
      '<span class="meal__macro">' +
      i.kcal +
      " ккал · Б " +
      i.proteinG +
      " / Ж " +
      i.fatG +
      " / У " +
      i.carbsG +
      '</span></span><span class="pick__sign">' +
      (open ? "–" : "+") +
      "</span></button>" +
      (open
        ? '<div class="pick__alts"><p class="pick__label">Заменить на</p>' +
          i.options
            .filter(function (o) {
              // Выбранное не показываем: оно и так в строке выше, а на выбор
              // остаются ровно три варианта, включая базовый продукт меню
              return !o.current;
            })
            .map(function (o) {
              return menuOptionHtml(i, o);
            })
            .join("") +
          "</div>"
        : "") +
      "</li>"
    );
  }

  function menuOptionHtml(i, o) {
    return (
      '<button class="pick__alt" data-action="menu-swap" data-itemid="' +
      esc(i.id) +
      '" data-food="' +
      esc(o.food) +
      '">' +
      thumb(o.slug, o.food) +
      '<span class="meal__name">' +
      esc(o.food) +
      " " +
      esc(o.amount) +
      '<span class="meal__macro">' +
      o.kcal +
      " ккал · Б " +
      o.proteinG +
      " / Ж " +
      o.fatG +
      " / У " +
      o.carbsG +
      "</span></span></button>"
    );
  }

  function toggleMenuMeal(key) {
    state.menu.meal = state.menu.meal === key ? null : key;
    state.menu.pick = null;
    state.notice = null;
    haptic("light");
    persist();
    render();
  }

  function toggleMenuPick(id) {
    state.menu.pick = state.menu.pick === id ? null : id;
    haptic("light");
    persist();
    render();
  }

  /** Выбранная замена. Базовый продукт меню тоже приходит сюда — он снимает замену. */
  function swapMenuItem(id, food) {
    if (!state.menu.swaps) state.menu.swaps = {};
    state.menu.swaps[id] = food;
    state.menu.pick = null;
    haptic("light");
    persist();
    render();
  }

  function logMenuMeal(key) {
    var m = menuDay().meals.filter(function (x) {
      return x.key === key;
    })[0];
    if (!m) return;
    var parts = (m.items || [])
      .map(function (i) {
        return i.food + " " + i.amount;
      })
      .join(", ");
    saveMeal(
      {
        name: mealTitle(m) + (parts ? ": " + parts : ""),
        kcal: m.kcal,
        proteinG: m.proteinG,
        fatG: m.fatG,
        carbsG: m.carbsG
      },
      "menu"
    );
  }

  /* ── Питание: съедено за день ───────────────────────────────────────────── */

  function renderEaten() {
    var target = macros();
    var eaten = eatenTotals();
    var meals = mealsToday();
    var left = target ? target.kcal - eaten.kcal : null;
    var quota = state.day ? state.day.photo : null;
    var isToday = !state.viewDate || state.viewDate === serverToday();

    var head = target
      ? card(
          cardHead(
            !isToday ? "Итог " + formatDate(viewDate()) : left >= 0 ? "Осталось на сегодня" : "Перебор",
            "Цель: " + GOAL_WORD[state.profile.goal] + " · норма " + target.kcal + " ккал",
            eaten.count + " " + plural(eaten.count, "приём", "приёма", "приёмов")
          ) +
            figure(
              (left >= 0 ? "" : "+") + Math.abs(left),
              " ккал",
              "съедено " + eaten.kcal + " из " + target.kcal
            ) +
            '<div class="bars">' +
            bar(
              "Калории",
              left >= 0 ? "#cba968" : "#d98a8a",
              eaten.kcal + " / " + target.kcal,
              (eaten.kcal * 100) / target.kcal
            ) +
            bar(
              "Белок",
              eaten.proteinG >= target.proteinG ? "#cba968" : "#8a7a52",
              eaten.proteinG + " / " + target.proteinG + " г",
              (eaten.proteinG * 100) / target.proteinG
            ) +
            bar("Жиры", "#b08d45", eaten.fatG + " / " + target.fatG + " г", (eaten.fatG * 100) / target.fatG) +
            bar(
              "Углеводы",
              "#8a7a52",
              eaten.carbsG + " / " + target.carbsG + " г",
              (eaten.carbsG * 100) / target.carbsG
            ) +
            "</div>",
          { gold: true }
        )
      : card(
          cardHead("Норма не задана", "Заполни данные, и покажу, сколько осталось на день") +
            '<div class="btn-stack"><button class="btn btn--primary" data-action="go-norm">Задать норму</button></div>'
        );

    return (
      (state.day ? dayNav() : "") +
      head +
      // Один вид сообщения на все экраны: три копии этой разметки успели разойтись
      // по заголовку, и «Записал» появлялось там, где ничего не записывалось
      noticeHtml() +
      (!isToday
        ? '<p class="note note--plain">Открыт прошлый день, здесь только просмотр. Новые приёмы ' +
          "пишутся в сегодняшний.</p>"
        : addOrBusy(quota)) +
      (isToday ? waterCard() : "") +
      mealsListCard(meals, isToday) +
      '<p class="note note--plain">В оценке по фото продукты определяет модель, а ' +
      "калории берутся из справочника. Ошибка порции легко даёт ±15–20%, " +
      "особенно с маслом и соусами. Итог сверяй по тренду веса в дневнике, а не по одному дню.</p>" +
      // Про штрихкод человек сам не догадается, а это единственный способ получить
      // цифры конкретной упаковки вместо среднего по категории.
      '<p class="note note--plain">Снимаешь магазинное: заведи в кадр штрихкод. ' +
      "По нему продукт находится в открытой базе с его собственными КБЖУ, а не считается " +
      "по похожему.</p>"
    );
  }

  /* Ввод еды и список приёмов — общие для «Питания» и «Профиля». Одна разметка на два
     экрана: две копии разошлись бы при первой же правке форм. */

  function addOrBusy(quota) {
    if (state.busy) {
      return card(
        (state.photoPreview
          ? '<div class="shot shot--meal"><img class="shot__img" alt="" src="' +
            esc(state.photoPreview) +
            '" /></div>'
          : "") +
        '<p class="lead">' +
          (state.busy === "photo" ? "Распознаю блюдо…" : "Считаю…") +
          '</p><p class="muted">Обычно 3–10 секунд.</p>'
      );
    }
    // Вопрос «это оно» заменяет формы добавления, а не встаёт над ними: иначе
    // рядом с неотвеченным вопросом стоят четыре кнопки нового ввода, и человек
    // добавляет второй приём вместо подтверждения первого. Выход из вопроса —
    // кнопка «Не то», она же открывает ввод текстом.
    if (state.repeatAsk) return repeatAskCard();
    if (state.pending) return pendingCard();
    return sameAsCard() + portionCard() + addBlock(quota);
  }

  /**
   * Картинка блюда. Файла может не быть — тогда остаётся буква под ним: узнавание
   * по картинке нужно в списке, но пустой квадрат хуже монограммы, а грузить
   * сотню файлов ради проверки существования нельзя.
   */
  function isOffImage(url) {
    try {
      var u = new URL(String(url || ""), location.href);
      return (
        u.protocol === "https:" &&
        (u.hostname === "images.openfoodfacts.org" || u.hostname === "static.openfoodfacts.org")
      );
    } catch (e) {
      return false;
    }
  }

  function thumb(slug, title, folder, photoUrl) {
    var src = "";
    if (photoUrl && isOffImage(photoUrl)) src = photoUrl;
    else if (slug) src = "img/" + esc(folder || "food") + "/" + esc(slug) + ".webp";
    if (!src) return "";
    return (
      '<span class="thumb" aria-hidden="true">' +
      '<img class="thumb__img" loading="lazy" decoding="async" alt="" src="' +
      esc(src) +
      '" onerror="this.parentNode.remove()" />' +
      "</span>"
    );
  }

  function mealsListCard(meals, isToday) {
    if (!meals.length) {
      return (
        '<p class="empty">' +
        (isToday ? "За сегодня ничего не записано." : "В этот день записей нет.") +
        "</p>"
      );
    }
    return card(
      cardHead(
        isToday ? "Приёмы за сегодня" : "Приёмы за " + formatDate(viewDate()),
        online ? "Общий дневник с ботом" : "Хранится на устройстве"
      ) +
        '<ul class="log">' +
        meals
          .map(function (m) {
            return (
              '<li class="log--thumbed">' +
              thumb(m.slug, m.name, "food", m.photoUrl) +
              '<span class="meal__name">' +
              esc(m.name) +
              '<span class="meal__macro">' +
              m.proteinG +
              " / " +
              m.fatG +
              " / " +
              m.carbsG +
              ' г</span></span><span class="log__value">' +
              m.kcal +
              ' ккал</span><button class="log__del" data-delmeal="' +
              esc(m.id) +
              '" aria-label="Удалить">×</button></li>'
            );
          })
          .join("") +
        "</ul>"
    );
  }

  function dayNav() {
    var d = viewDate();
    var isToday = d === serverToday();
    return (
      '<div class="daynav">' +
      '<button class="daynav__btn" data-action="day-prev" aria-label="Предыдущий день">←</button>' +
      '<span class="daynav__label">' +
      (isToday ? "Сегодня" : formatDate(d)) +
      "</span>" +
      '<button class="daynav__btn" data-action="day-next" aria-label="Следующий день"' +
      (isToday ? " disabled" : "") +
      ">→</button>" +
      "</div>"
    );
  }

  function loadFoods() {
    if (state.foods || !online) return;
    state.foods = [];
    KM_API.foods()
      .then(function (data) {
        state.foods = data.foods || [];
        if (state.addMode === "food") render();
      })
      .catch(function () {
        state.foods = null;
      });
  }

  function foodListHtml() {
    if (!state.foods) return '<p class="muted">Справочник не загрузился. Попробуй позже.</p>';
    if (!state.foods.length) return '<p class="muted">Загружаю справочник…</p>';

    var q = String(state.foodQuery || "").trim().toLowerCase();
    var seen = {};
    var list = state.foods.filter(function (f) {
      if (seen[f.name]) return false;
      seen[f.name] = true;
      if (!q) return true;
      if (f.name.toLowerCase().indexOf(q) !== -1) return true;
      var als = f.aliases || [];
      for (var i = 0; i < als.length; i++) {
        if (String(als[i]).toLowerCase().indexOf(q) !== -1) return true;
      }
      return false;
    });

    if (!list.length) {
      return '<p class="muted">В основных продуктах этого нет. Сладости и газировку добавь текстом или фото.</p>';
    }

    function foodRow(f) {
      var grams = num(state.foodGrams);
      var g = grams >= 1 && grams <= 3000 ? Math.round(grams) : f.defaultG;
      var kcal = Math.round((f.kcal100 * g) / 100);
      var proteinG = Math.round((f.p100 * g) / 100);
      return (
        '<li class="food">' +
        thumb(typeof KM_MENUS !== "undefined" && KM_MENUS.slugOf ? KM_MENUS.slugOf(f.name, g) : f.slug, f.name) +
        '<span class="food__text">' +
        '<span class="food__name">' +
        esc(f.name) +
        "</span>" +
        '<span class="food__meta">' +
        kcal +
        " ккал · " +
        g +
        " г · Б " +
        proteinG +
        "</span></span>" +
        '<button class="btn btn--outline food__add" style="width:auto" data-action="add-food" data-food="' +
        esc(f.name) +
        '" data-grams="' +
        g +
        '">Записать</button></li>'
      );
    }

    if (q) {
      return '<ul class="foods">' + list.map(foodRow).join("") + "</ul>";
    }

    var groups = [
      { id: "protein", title: "Белок" },
      { id: "fat", title: "Жиры" },
      { id: "carb", title: "Углеводы" },
      { id: "fiber", title: "Клетчатка" },
      { id: "water", title: "Вода" },
    ];
    return groups
      .map(function (g) {
        var items = list.filter(function (f) {
          return f.role === g.id;
        });
        if (!items.length) return "";
        var open = state.foodMore && state.foodMore[g.id];
        var shown = open || items.length <= 5 ? items : items.slice(0, 5);
        var more =
          !open && items.length > 5
            ? '<button type="button" class="sets__add" data-action="food-more" data-group="' +
              g.id +
              '">Ещё ' +
              (items.length - 5) +
              " " +
              plural(items.length - 5, "продукт", "продукта", "продуктов") +
              "</button>"
            : "";
        return (
          '<p class="pick__label">' +
          g.title +
          '</p><ul class="foods">' +
          shown.map(foodRow).join("") +
          "</ul>" +
          more
        );
      })
      .join("");
  }

  function foodForm() {
    loadFoods();
    var target = macros();
    var eaten = eatenTotals();
    var left = target ? target.kcal - eaten.kcal : 0;
    return (
      '<div style="margin-top:18px">' +
      '<p class="note note--plain">Это справочник, не меню на день. Нажми «Записать», продукт уйдет в дневник. План под норму во вкладке «Меню».</p>' +
      (target
        ? '<p class="lead" style="margin:10px 0 14px">Осталось ' +
          left +
          " ккал из " +
          target.kcal +
          ". Цифра в строке это эта порция, не 100 г.</p>"
        : "") +
      field(
        "Продукт",
        '<input class="input" type="text" data-path="foodQuery" placeholder="грудка, гречка, вода" value="' +
          esc(state.foodQuery) +
          '" />',
        "Основные продукты: белок, жиры, углеводы, клетчатка, вода."
      ) +
      field(
        "Граммы",
        numInput("foodGrams", { min: 1, max: 3000, step: 10, placeholder: "обычная порция" })
      ) +
      '<div id="foodList">' +
      foodListHtml() +
      "</div></div>"
    );
  }

  function addBlock(quota) {
    if (!online) {
      var d = KM_API.diag ? KM_API.diag() : null;
      // Внутри Telegram этот экран означает не «ты не в Telegram», а «подпись не
      // прочиталась». Показываем факты: без них причина ищется наугад.
      var inside = d && (d.sdk || d.platform !== "неизвестен");
      return card(
        cardHead(
          inside ? "Подпись Telegram не прочиталась" : "Фото доступно только из Telegram",
          inside ? "Нажми «Проверить связь»" : "Открой приложение кнопкой в боте"
        ) +
          '<p class="lead">Распознавание идёт через сервер бота, потому что ключ модели нельзя ' +
          "держать в приложении. Здесь работает ручной ввод, если КБЖУ написаны на упаковке.</p>" +
          (d
            ? '<p class="note" style="margin-top:10px">SDK: ' +
              (d.sdk ? "есть" : "не загрузился") +
              " · клиент: " +
              esc(d.platform) +
              " " +
              esc(d.version) +
              " · подпись: " +
              (d.initLen
                ? d.initLen + " " + plural(d.initLen, "знак", "знака", "знаков") + " (" + esc(d.source) + ")"
                : "нет") +
              "<br />адрес: " +
              (d.keys && d.keys.length ? esc(d.keys.join(", ")) : "пусто") +
              " · память сеанса: " +
              esc(d.stored || "пусто") +
              "</p>"
            : "") +
          '<div class="btn-stack" style="margin-top:14px">' +
          '<button class="btn btn--primary" data-action="reload-day">Проверить связь</button>' +
          '<button class="btn btn--outline" data-action="add-manual-form">Ввести вручную</button>' +
          "</div>" +
          (state.addMode === "manual" ? manualForm() : "")
      );
    }

    // Подпись Telegram есть, а ответа сервера ещё нет. Раньше этот случай попадал
    // в ветку «нужен GEMINI_API_KEY» и врал: ключ на месте, не хватало связи.
    // Разные причины — разные тексты, иначе диагноз ищется наугад.
    if (!state.day) {
      return card(
        cardHead(
          state.linkError ? "Нет связи с ботом" : "Связываюсь с ботом…",
          state.linkError
            ? "Фото и справочник продуктов работают через сервер бота"
            : "Секунду, подгружаю дневник"
        ) +
          (state.linkError ? '<p class="lead">' + esc(state.linkError) + "</p>" : "") +
          '<div class="btn-stack" style="margin-top:14px">' +
          '<button class="btn btn--primary" data-action="reload-day">Обновить</button>' +
          '<button class="btn btn--outline" data-action="add-manual-form">Ввести вручную</button>' +
          "</div>" +
          (state.addMode === "manual" ? manualForm() : "")
      );
    }

    if (!photoAllowed()) {
      return card(
        cardHead("Распознавание фото выключено", "У бота не задан ключ модели") +
          '<div class="btn-stack">' +
          '<button class="btn btn--outline" data-action="add-food-form">Из справочника</button>' +
          '<button class="btn btn--outline" data-action="add-text-form">Добавить текстом</button>' +
          '<button class="btn btn--outline" data-action="add-manual-form">Ввести вручную</button>' +
          "</div>" +
          (state.addMode === "food" ? foodForm() : "") +
          (state.addMode === "text" ? textForm() : "") +
          (state.addMode === "manual" ? manualForm() : "")
      );
    }

    var limitLine =
      quota && !quota.unlimited
        ? "На этой неделе осталось " + quota.left + " фото из " + quota.limit
        : quota && quota.trial
        ? "Пробный период, фото без ограничений"
        : "Фото без ограничений";

    return card(
      cardHead("Добавить приём пищи", limitLine) +
        '<div class="btn-stack">' +
        // Кнопка, а не <label for>, и открытие через .click() из кода: в WebView
        // Telegram связка «label → input с display:none» часто не срабатывает,
        // причём молча. Само поле выбора файла лежит в index.html — см. комментарий там.
        '<button class="btn btn--primary" data-action="pick-photo">Сфотографировать еду</button>' +
        '<button class="btn btn--outline" data-action="add-food-form">Из справочника</button>' +
        '<button class="btn btn--outline" data-action="add-text-form">Добавить текстом</button>' +
        '<button class="btn btn--outline" data-action="add-manual-form">Ввести вручную</button>' +
        "</div>" +
        (state.addMode === "food" ? foodForm() : "") +
        (state.addMode === "text" ? textForm() : "") +
        (state.addMode === "manual" ? manualForm() : "") +
        '<p class="note note--plain">Фото и текст я сначала показываю разбором: что за ' +
        "продукт, сколько весит, откуда взяты цифры. В дневник запись идёт только после " +
        "твоего «да». Не согласишься, ничего не запишется.</p>"
    );
  }

  function textForm() {
    return (
      '<div style="margin-top:18px">' +
      field(
        "Что съел",
        '<textarea class="input" rows="3" data-path="mealText" placeholder="250 мл жидкого белка, 3 банана, 8 ложек овсянки, 2 скупа протеина, 1 ложка арахисовой пасты">' +
          esc(state.mealText) +
          "</textarea>",
        "Меры понимаю любые: граммы, миллилитры, ложки, скупы, стаканы, штуки. " +
          "«Пол ложки креатина» тоже посчитаю. Сначала смотрю в справочник, а если " +
          "продукта там нет, спрашиваю модель."
      ) +
      '<button class="btn btn--primary" data-action="add-text">Посчитать</button></div>'
    );
  }

  function manualForm() {
    return (
      '<div style="margin-top:18px">' +
      field(
        "Название",
        '<input class="input" type="text" data-path="manual.name" placeholder="Творог с орехами" value="' +
          esc(state.manual.name) +
          '" />'
      ) +
      field("Калории", numInput("manual.kcal", { min: 1, max: 6000, step: 1, placeholder: "ккал" })) +
      '<div class="row">' +
      field("Белок, г", numInput("manual.proteinG", { min: 0, max: 400, step: 1 })) +
      field("Жиры, г", numInput("manual.fatG", { min: 0, max: 400, step: 1 })) +
      "</div>" +
      field("Углеводы, г", numInput("manual.carbsG", { min: 0, max: 800, step: 1 })) +
      '<button class="btn btn--primary" data-action="add-manual">Записать</button></div>'
    );
  }

  function renderNorm() {
    var p = state.profile;
    return (
      card(
        cardHead("Норма калорий и БЖУ", "Миффлин–Сан-Жеор с поправкой на активность и цель") +
          field("Пол", chips("sex", p.sex, [["m", "Мужчина"], ["f", "Женщина"]])) +
          '<div class="row">' +
          field("Возраст, лет", numInput("profile.age", { min: 14, max: 90, step: 1 })) +
          field("Рост, см", numInput("profile.heightCm", { min: 120, max: 230, step: 1 })) +
          "</div>" +
          field("Вес, кг", numInput("profile.weightKg", { min: 30, max: 250, step: 0.1 }), weightHint()) +
          field(
            "Активность",
            chips("activity", p.activity, [
              ["low", "Низкая"],
              ["mid", "Средняя"],
              ["high", "Высокая"]
            ]),
            "Низкая: 1–3 тренировки в неделю и сидячая работа. Средняя: 3–5 тренировок. " +
              "Высокая: 6 и больше или физический труд."
          ) +
          field(
            "Цель",
            chips("goal", p.goal, [
              ["bulk", "Набор"],
              ["cut", "Сушка"],
              ["maint", "Поддержание"]
            ])
          ) +
          '<div class="btn-stack"><button class="btn btn--primary" data-action="calc-nutrition">Пересчитать</button></div>'
      ) +
      '<div id="result">' +
      (macros() ? nutritionResult() : "") +
      "</div>"
    );
  }

  /**
   * Вес живёт в двух местах: поле расчёта и запись в дневнике. Плитка «Вес» на
   * «Сегодня» показывает запись, поэтому расхождение надо называть вслух.
   */
  function weightHint() {
    var last = sortedEntries().slice(-1)[0];
    if (!last) return "Взвешивания пиши в «Дневник», из них считается тренд.";
    var same = Math.abs(last.weightKg - num(state.profile.weightKg)) < 0.05;
    return (
      "Последняя запись в дневнике: " +
      last.weightKg +
      " кг (" +
      formatDate(last.date) +
      ")." +
      (same ? "" : " На «Сегодня» в плитке «Вес» показана именно она.") +
      " Новое взвешивание в «Дневнике» перепишет это поле."
    );
  }

  function nutritionResult() {
    var p = state.profile;
    var age = num(p.age),
      h = num(p.heightCm),
      w = num(p.weightKg);
    if (!(age >= 14 && age <= 90)) return errorBox("Возраст: от 14 до 90 лет.");
    if (!(h >= 120 && h <= 230)) return errorBox("Рост: от 120 до 230 см.");
    if (!(w >= 30 && w <= 250)) return errorBox("Вес: от 30 до 250 кг.");

    var m = macros();
    var meals = KM.mealSplit(m);

    return (
      '<div class="section"><span class="eyebrow section__label">Твоя норма · ' +
      esc(GOAL_WORD[p.goal]) +
      "</span>" +
      card(
        figure(m.kcal, " ккал", "в день") +
          '<div class="bars">' +
          bar(
            "Белок",
            "#cba968",
            m.proteinG + " г · " + KM.GOAL_CFG[p.goal].proteinPerKg + " г/кг",
            (m.proteinG * 4 * 100) / m.kcal
          ) +
          bar("Жиры", "#b08d45", m.fatG + " г · 0.9 г/кг", (m.fatG * 9 * 100) / m.kcal) +
          bar("Углеводы", "#8a7a52", m.carbsG + " г · остаток", (m.carbsG * 4 * 100) / m.kcal) +
          "</div>",
        { gold: true }
      ) +
      '<div class="grid-2">' +
      metric("Основной обмен", m.bmr + ' <span class="figure__unit">ккал</span>', "без активности") +
      metric("Полный расход", m.tdee + ' <span class="figure__unit">ккал</span>', "с активностью") +
      "</div>" +
      (m.note
        ? card(
            cardHead(
              m.source === "intake"
                ? "Норма от фактического расхода"
                : m.source === "trend"
                  ? "Норма сдвинута по тренду веса"
                  : "Норма из формулы",
              m.formulaKcal && m.formulaKcal !== m.kcal
                ? "формула давала " + m.formulaKcal + " ккал"
                : "пока мало факта, стоит расчёт"
            ) +
              '<p class="lead">' +
              esc(m.note) +
              "</p>"
          )
        : "") +
      card(
        cardHead("Разбивка по приёмам", "Доли, а не жёсткие граммы") +
          '<table class="table"><thead><tr><th>Приём</th><th>Ккал</th><th>Б / Ж / У</th></tr></thead><tbody>' +
          meals
            .map(function (x) {
              return (
                "<tr><td>" +
                esc(x.name) +
                '</td><td class="table__weight">' +
                x.kcal +
                "</td><td>" +
                x.proteinG +
                " / " +
                x.fatG +
                " / " +
                x.carbsG +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table>"
      ) +
      '<p class="note"><strong>Формула даёт только стартовую точку.</strong> Через 2–3 недели сверь ' +
      "фактический тренд веса в дневнике: он покажет, надо ли двигать калории вверх или вниз.</p>" +
      '<div class="btn-stack" style="margin-top:12px"><button class="btn btn--outline" data-go="diary">Открыть дневник веса</button></div>' +
      "</div>"
    );
  }

  /* ── Экран: расчёты (1ПМ + программа) ───────────────────────────────────── */

  var MODELS = [
    ["531", "5/3/1"],
    ["gzclp", "GZCLP"],
    ["dup", "DUP"],
    ["linear", "Линейная"],
    ["wave", "Волновая"]
  ];

  var MODEL_NOTES = {
    "531": "Вендлер. Рабочий максимум это 90% от 1ПМ, цикл идёт 4 недели, последний подход делается на максимум повторений. Между циклами максимум растёт на 2.5%.",
    gzclp: "Чередование тяжёлого дня (5×3) и объёмного (3×10) с ростом процентов по неделям. Последняя неделя разгрузочная.",
    dup: "Ежедневная волна: у каждого дня своя задача, то сила, то мощность, то объём.",
    linear: "Проценты растут, повторы падают от недели к неделе. Классика базового периода.",
    wave: "Лёгкий / средний / тяжёлый день с волной по неделям. Держит свежесть на длинных циклах."
  };

  function renderCalc() {
    return (
      '<div class="chips" data-seg="calc_tab">' +
      [["orm", "Максимум 1ПМ"], ["program", "Программа"]]
        .map(function (o) {
          return (
            '<button type="button" class="chip" data-value="' +
            o[0] +
            '" aria-pressed="' +
            (state.calcTab === o[0]) +
            '">' +
            o[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      noticeHtml() +
      (state.calcTab === "orm" ? ormForm() : programForm()) +
      '<div id="result">' +
      (state.result === "orm" ? ormResult() : state.result === "program" ? programResult() : "") +
      "</div>"
    );
  }

  function ormForm() {
    return card(
      cardHead("Разовый максимум", "По рабочему подходу, сделанному чисто и почти до отказа") +
        '<div class="row">' +
        field("Вес штанги, кг", numInput("orm.weightKg", { min: 1, max: 500, step: 2.5 })) +
        field("Повторений", numInput("orm.reps", { min: 1, max: 20, step: 1 })) +
        "</div>" +
        '<p class="field__hint">Формулы работают до 15 повторений. Чем больше повторов, тем грубее оценка.</p>' +
        '<div class="btn-stack" style="margin-top:16px"><button class="btn btn--primary" data-action="calc-orm">Рассчитать</button></div>'
    );
  }

  function ormResult() {
    var w = num(state.orm.weightKg);
    var r = num(state.orm.reps);
    if (!(w >= 1 && w <= 500)) return errorBox("Вес: от 1 до 500 кг.");
    if (!(r >= 1 && r <= 20)) return errorBox("Повторения: от 1 до 20.");

    var oneRm = KM.calcOneRm(w, Math.round(r));
    var rows = KM.pctTable(oneRm);
    state.lastOrm = { oneRm: oneRm, weightKg: w, reps: Math.round(r) };

    return (
      '<div class="section"><span class="eyebrow section__label">Расчётный максимум</span>' +
      card(figure(oneRm, " кг", "1ПМ · среднее трёх формул"), { gold: true }) +
      (r > 15
        ? '<p class="note">Указано ' +
          Math.round(r) +
          " " +
          plural(Math.round(r), "повторение", "повторения", "повторений") +
          ", но расчёт сделан по 15: дальше формулы врут. Точнее всего работает подход на 3–8 повторений.</p>"
        : "") +
      card(
        cardHead("Рабочие веса", "Округлено до 2.5 кг") +
          '<table class="table"><thead><tr><th>%</th><th>Вес</th><th>Повторов</th></tr></thead><tbody>' +
          rows
            .map(function (x) {
              return (
                '<tr><td class="table__pct">' +
                x.pct +
                '%</td><td class="table__weight">' +
                x.weightKg +
                " кг</td><td>~" +
                x.reps +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table>"
      ) +
      '<div class="btn-stack"><button class="btn btn--outline" data-action="orm-to-program">Построить программу на этот 1ПМ</button></div>' +
      "</div>"
    );
  }

  function programForm() {
    ensureLifts();
    var pr = state.program;
    var needsGoal = pr.model === "dup" || pr.model === "linear" || pr.model === "wave";

    return card(
      cardHead("Программа на недели", "Веса, подходы и RPE считаются от твоего максимума") +
        field("Модель", chips("p_model", pr.model, MODELS)) +
        '<p class="note note--plain" style="margin-bottom:18px">' +
        esc(MODEL_NOTES[pr.model]) +
        "</p>" +
        (needsGoal
          ? field(
              "Цель",
              chips("p_goal", pr.goal, [
                ["strength", "Сила"],
                ["hypertrophy", "Гипертрофия"],
                ["strength_hypertrophy", "Сила + масса"]
              ])
            )
          : "") +
        field(
          "Недель",
          chips("p_weeks", pr.weeks, [[4, "4"], [6, "6"], [8, "8"], [12, "12"]]),
          pr.model === "531"
            ? "5/3/1 считается циклами по 4 недели, поэтому срок округлится до целых циклов."
            : "Последняя неделя разгрузочная."
        ) +
        field(
          "Тренировок в неделю",
          chips("p_days", pr.days, [[2, "2"], [3, "3"], [4, "4"], [5, "5"]])
        ) +
        '<span class="field__label">Движения и 1ПМ</span><div id="lifts">' +
        liftRows() +
        "</div>" +
        '<div class="btn-stack" style="margin-top:16px"><button class="btn btn--primary" data-action="calc-program">Построить программу</button></div>'
    );
  }

  function liftRows() {
    return state.program.lifts
      .slice(0, state.program.days)
      .map(function (l, i) {
        return (
          '<div class="row" style="margin-bottom:10px">' +
          '<select class="input" data-path="program.lifts.' +
          i +
          '.name">' +
          DEFAULT_LIFTS.map(function (n) {
            return (
              '<option value="' +
              esc(n) +
              '"' +
              (n === l.name ? " selected" : "") +
              ">" +
              esc(n) +
              "</option>"
            );
          }).join("") +
          "</select>" +
          '<input class="input" type="number" inputmode="decimal" step="2.5" min="1" max="500" placeholder="1ПМ, кг" data-path="program.lifts.' +
          i +
          '.oneRmKg" value="' +
          esc(l.oneRmKg === "" || l.oneRmKg == null ? "" : l.oneRmKg) +
          '" />' +
          "</div>"
        );
      })
      .join("");
  }

  function programInput() {
    var pr = state.program;
    var lifts = [];
    for (var i = 0; i < pr.days; i++) {
      var rm = num(pr.lifts[i].oneRmKg);
      if (!(rm >= 1 && rm <= 500)) return null;
      lifts.push({ name: pr.lifts[i].name, oneRmKg: rm });
    }
    return { lifts: lifts, weeks: Number(pr.weeks), goal: pr.goal, model: pr.model };
  }

  function programResult() {
    var pr = state.program;
    var input = programInput();
    if (!input) return errorBox("Заполни 1ПМ для каждого дня: от 1 до 500 кг.");
    var lifts = input.lifts;
    var res = KM.buildProgram(input);

    return (
      '<div class="section"><span class="eyebrow section__label">' +
      esc(modelName(pr.model)) +
      " · " +
      res.weeks.length +
      " " +
      plural(res.weeks.length, "неделя", "недели", "недель") +
      "</span>" +
      res.weeks
        .map(function (wk) {
          var isPeak = wk.week === res.peakWeek && !wk.deload;
          return (
            '<div class="acc' +
            (wk.deload ? " acc--deload" : "") +
            (wk.week === 1 ? " is-open" : "") +
            '"><button class="acc__head" data-acc><span><span class="acc__title">Неделя ' +
            wk.week +
            (wk.deload ? " · разгрузка" : isPeak ? " · пик" : "") +
            '</span><span class="acc__sub">' +
            wk.sessions.length +
            " " +
            plural(wk.sessions.length, "тренировка", "тренировки", "тренировок") +
            '</span></span><span class="acc__sign">' +
            (wk.week === 1 ? "–" : "+") +
            '</span></button><div class="acc__body">' +
            wk.sessions
              .map(function (s) {
                return sessionHtml(s, pr.model);
              })
              .join("") +
            "</div></div>"
          );
        })
        .join("") +
      '<p class="note">' +
      (pr.model === "531"
        ? "<strong>РМ это рабочий максимум, 90% от 1ПМ:</strong> " +
          lifts
            .map(function (l) {
              // Без округления: проценты считаются от точного РМ, округляется только вес на штанге
              return esc(l.name) + " " + Math.round(l.oneRmKg * 0.9 * 10) / 10 + " кг";
            })
            .join(", ") +
          ". Знак «+» у последнего подхода означает максимум повторений с этим весом. "
        : pr.model === "gzclp"
        ? "Знак «+» у последнего подхода означает максимум повторений с этим весом. "
        : "Вес считается от 1ПМ с поправкой на этап цикла, поэтому в первых неделях он ниже номинальной интенсивности: это запас на разгон. ") +
      "Разгрузочная неделя это не пропуск, а часть плана: она снимает накопленную усталость перед новым циклом.</p>" +
      (state.day
        ? (state.busy === "program"
            ? '<p class="muted">Сохраняю программу…</p>'
            : '<div class="btn-stack"><button class="btn btn--primary" data-action="program-activate">' +
              (state.day.program ? "Заменить активную программу" : "Сделать активной программой") +
              "</button></div>") +
          '<p class="note note--plain">Активная программа появится на экране «Сегодня» и в чате бота: ' +
          "он ведёт по дням и пишет тренировки в дневник.</p>"
        : "") +
      "</div>"
    );
  }

  function activateProgram() {
    var input = programInput();
    if (!input || !state.day) return;
    state.busy = "program";
    state.notice = null;
    render();
    KM_API.saveProgram(input)
      .then(function (data) {
        state.day = data;
        state.busy = null;
        state.notice = {
          kind: "ok",
          text:
            "Программа активна: неделя 1, день 1. Дальше её ведёт бот, а ты отмечай тренировки на «Сегодня»."
        };
        haptic("medium");
        render();
      })
      .catch(function (err) {
        state.busy = null;
        state.notice = { kind: "err", text: (err && err.message) || "Не удалось сохранить программу." };
        haptic("heavy");
        render();
      });
  }

  function markProgramDone() {
    if (!state.day || !state.day.program) return;
    state.busy = "program";
    state.notice = null;
    render();
    KM_API.programDone()
      .then(function (data) {
        state.day = data;
        state.busy = null;
        var prText =
          data.pr && data.pr.kind === "weight"
            ? " Новый рекорд веса: " + data.pr.value + " кг."
            : data.pr && data.pr.kind === "e1rm"
            ? " Рекорд по силе: расчётный 1ПМ " + data.pr.value + " кг."
            : "";
        state.notice = {
          kind: "ok",
          text: data.finished
            ? "Цикл пройден до конца." + prText
            : "Тренировка записана." + prText
        };
        haptic("medium");
        render();
      })
      .catch(function (err) {
        state.busy = null;
        state.notice = { kind: "err", text: (err && err.message) || "Не записалось." };
        haptic("heavy");
        render();
      });
  }

  function markWorkoutDone() {
    if (!state.day) return;
    var lifts = collectedLifts();
    if (!lifts.length) {
      state.notice = { kind: "err", text: "Отметь хотя бы один подход." };
      haptic("heavy");
      return render();
    }
    state.busy = "workout";
    state.notice = null;
    render();
    KM_API.workoutLog(state.workout.place, workoutLevel(), lifts, workoutSplit())
      .then(function (data) {
        state.day = data;
        state.busy = null;
        if (state.restDays) delete state.restDays[serverToday()];
        resetSession();
        persist();
        workoutTouched = false;
        state.workout.plan = data.simple.idx % planList().length;
        state.notice = {
          kind: "ok",
          text:
            "Записано " +
            data.lifts +
            " " +
            plural(data.lifts, "движение", "движения", "движений") +
            ", тоннаж " +
            data.volume +
            " кг" +
            (data.prs ? ", рекордов " + data.prs : "") +
            ". Следующая по плану " +
            data.next +
            "."
        };
        persist();
        haptic("medium");
        render();
      })
      .catch(function (err) {
        state.busy = null;
        state.notice = { kind: "err", text: (err && err.message) || "Не записалось." };
        haptic("heavy");
        render();
      });
  }

  function sessionHtml(s, model) {
    // Базы процентов разные: 5/3/1 — от рабочего максимума, GZCLP — от 1ПМ,
    // DUP/линейная/волновая — от 1ПМ с коэффициентом этапа цикла.
    var scheme;
    if (model === "531") {
      scheme = "Топ-сет " + s.weightKg + " кг × " + s.reps + " · " + s.intensity + "% от РМ";
    } else if (model === "gzclp") {
      scheme = s.weightKg + " кг · " + s.sets + "×" + s.reps + " · " + s.intensity + "% от 1ПМ";
    } else {
      scheme = s.weightKg + " кг · " + s.sets + "×" + s.reps;
    }

    return (
      '<div class="sess"><div class="sess__top"><span class="sess__focus">День ' +
      s.day +
      " · " +
      esc(s.focus) +
      '</span><span class="sess__rpe">RPE ' +
      s.rpe +
      '</span></div><div class="sess__scheme">' +
      scheme +
      "</div>" +
      (s.detail ? '<div class="sess__detail">' + esc(s.detail) + "</div>" : "") +
      "</div>"
    );
  }

  /* ── Экран: тренировка ──────────────────────────────────────────────────── */

  /** Цель из анкеты: она задаёт дозировку плана, а не набор упражнений. */
  function workoutGoal() {
    var goal = state.profile && state.profile.goal;
    return goal === "bulk" || goal === "cut" ? goal : "maint";
  }

  /**
   * Стартовый набор или следующая ступень.
   *
   * Если человек не выбирал, берём из активности: высокая значит, что стул
   * и стена ему уже не нужны. Явный выбор на чипе перекрывает догадку.
   */
  function workoutLevel() {
    return KM_PLANS.splitLevel(workoutSplit());
  }

  function workoutSplit() {
    return KM_PLANS.parseSplit(
      state.workout.split,
      state.workout.level === "train" || state.workout.level === "start"
        ? state.workout.level
        : state.profile && state.profile.activity === "high"
          ? "train"
          : "start"
    );
  }

  function programById(id) {
    return KM_PLANS.programById(id);
  }

  function programTitle(id) {
    var prog = programById(id || workoutSplit());
    if (prog.id === "ppl" && state.workout.place === "home") return "Жим / Спина / Ноги";
    return prog.title;
  }

  var PROG_COVER = {
    "fb-start": "prisedaniya-na-stul",
    "fb-train": "prisedaniya-do-paralleli",
    ppl: "zhim-ganteley-lezha",
    ul: "tyaga-dvuh-ganteley-v-naklone"
  };

  function planList() {
    var list = KM_PLANS.forProgram(state.workout.place, workoutSplit());
    if (state.workout.plan >= list.length) state.workout.plan = 0;
    return list;
  }

  function programShelfHtml(seg, current) {
    var start = KM_PLANS.programs.filter(function (p) {
      return p.shelf === "start";
    });
    var train = KM_PLANS.programs.filter(function (p) {
      return p.shelf === "train";
    });
    function cards(items) {
      return items
        .map(function (p) {
          var on = p.id === current;
          var cover = PROG_COVER[p.id] || "";
          var bg = cover
            ? ' style="background-image:linear-gradient(180deg,rgba(11,11,12,.28),rgba(11,11,12,.84)),url(\'img/ex/' +
              esc(cover) +
              ".webp')\""
            : "";
          return (
            '<button type="button" class="prog' +
            (on ? " is-on" : "") +
            '" data-value="' +
            esc(p.id) +
            '" aria-pressed="' +
            on +
            '"' +
            bg +
            '><span class="prog__name">' +
            esc(p.id === "ppl" && state.workout.place === "home" ? "Жим / Спина / Ноги" : p.title) +
            '</span><span class="prog__meta">' +
            p.daysPerWeek +
            " " +
            plural(p.daysPerWeek, "день", "дня", "дней") +
            (p.shelf === "start" ? " · с нуля" : "") +
            '</span><span class="prog__blurb">' +
            esc(
              p.id === "ppl" && state.workout.place === "home"
                ? "Один круг: жим, спина, ноги. Пн ср пт, не шесть дней."
                : p.blurb
            ) +
            "</span></button>"
          );
        })
        .join("");
    }
    return (
      '<div class="shelf" data-seg="' +
      seg +
      '">' +
      '<p class="shelf__label">Новичок</p>' +
      '<div class="shelf__grid">' +
      cards(start) +
      "</div>" +
      '<p class="shelf__label">Уже тренируюсь</p>' +
      '<div class="shelf__grid">' +
      cards(train) +
      "</div></div>"
    );
  }

  function muscleOf(e) {
    if (e.name === "Отжимания с колен") return "грудь и руки";
    var s = e.short || "";
    var i = s.lastIndexOf(":");
    if (i < 0) return "";
    return s.slice(i + 1).trim();
  }

  function dayMuscles(plan) {
    var seen = {};
    var out = [];
    (plan.items || []).forEach(function (ex) {
      var m = muscleOf(ex);
      if (m && !seen[m]) {
        seen[m] = true;
        out.push(m);
      }
    });
    return out.join(" · ");
  }

  function schemeBadge(e, goal) {
    var d = KM_PLANS.dose(e);
    var sets = d.sets + (goal === "bulk" ? 1 : 0);
    if (d.secs) {
      var lo = goal === "bulk" ? Math.round((d.secs[0] * 1.5) / 5) * 5 : d.secs[0];
      var hi = goal === "bulk" ? Math.round((d.secs[1] * 1.5) / 5) * 5 : d.secs[1];
      return sets + "×" + lo + "–" + hi + " с";
    }
    var reps = d.reps || 10;
    var r = goal === "bulk" ? reps + "–" + (reps + 2) : String(reps);
    return sets + "×" + r;
  }

  function dayChipLabel(p) {
    if (p.label === "A" || p.label === "B") return "День " + p.label;
    return p.label;
  }

  var restTick = null;

  function sessionKey() {
    return state.workout.place + "|" + workoutSplit() + "|" + state.workout.plan;
  }

  function restSec() {
    var g = workoutGoal();
    return g === "bulk" ? 105 : g === "cut" ? 75 : 90;
  }

  function resetSession() {
    if (restTick) {
      clearInterval(restTick);
      restTick = null;
    }
    state.session = { key: "", startedAt: 0, restUntil: 0, lifts: {} };
  }

  function ensureSession() {
    var key = sessionKey();
    if (!state.session || state.session.key !== key) {
      state.session = { key: key, startedAt: Date.now(), restUntil: 0, lifts: {} };
    }
    return state.session;
  }

  function lastLog(name) {
    var map = state.day && state.day.lastLifts ? state.day.lastLifts : {};
    return map[name] || null;
  }

  function sessionSets(e) {
    var sess = ensureSession();
    if (!sess.lifts[e.name]) sess.lifts[e.name] = defaultSets(e);
    return sess.lifts[e.name];
  }

  function defaultSets(e) {
    var d = KM_PLANS.dose(e);
    var goal = workoutGoal();
    var n = d.sets + (goal === "bulk" ? 1 : 0);
    var prev = lastLog(e.name);
    var reps = d.secs
      ? goal === "bulk"
        ? Math.round((d.secs[1] * 1.5) / 5) * 5
        : d.secs[0]
      : d.reps || 10;
    var out = [];
    var i;
    for (i = 0; i < n; i++) {
      var p = prev && prev.log && prev.log[i] ? prev.log[i] : null;
      out.push({
        kg: p ? p.kg : 0,
        reps: p ? p.reps : reps,
        done: false
      });
    }
    return out;
  }

  function sessionVolume() {
    var sess = ensureSession();
    var sum = 0;
    Object.keys(sess.lifts).forEach(function (name) {
      sess.lifts[name].forEach(function (s) {
        if (s.done) sum += (Number(s.kg) || 0) * (Number(s.reps) || 0);
      });
    });
    return Math.round(sum);
  }

  function sessionDoneCount() {
    var sess = ensureSession();
    var n = 0;
    Object.keys(sess.lifts).forEach(function (name) {
      sess.lifts[name].forEach(function (s) {
        if (s.done) n++;
      });
    });
    return n;
  }

  function collectedLifts() {
    var sess = ensureSession();
    var out = [];
    Object.keys(sess.lifts).forEach(function (name) {
      var sets = sess.lifts[name]
        .filter(function (s) {
          return s.done;
        })
        .map(function (s) {
          return { kg: Number(s.kg) || 0, reps: Math.max(1, Number(s.reps) || 1) };
        });
      if (sets.length) out.push({ name: name, sets: sets });
    });
    return out;
  }

  function armRest() {
    var sess = ensureSession();
    sess.restUntil = Date.now() + restSec() * 1000;
    if (restTick) clearInterval(restTick);
    restTick = setInterval(function () {
      if (!state.session || !state.session.restUntil || Date.now() >= state.session.restUntil) {
        if (restTick) clearInterval(restTick);
        restTick = null;
        if (state.session) state.session.restUntil = 0;
      }
      if (state.screen === "workout") render();
    }, 1000);
  }

  function restLeft() {
    var until = state.session && state.session.restUntil ? state.session.restUntil : 0;
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }

  function renderWorkout() {
    var wk = state.workout;
    var list = planList();
    var plan = list[wk.plan] || list[0];
    var goal = workoutGoal();
    var split = workoutSplit();
    var prog = programById(split);
    var placeChips = chips("w_place", wk.place, [["home", "Дома"], ["gym", "В зале"]]);

    if (workoutPick) {
      return (
        placeChips +
        '<p class="shelf__label">Программа</p>' +
        programShelfHtml("w_split", split) +
        '<div class="btn-stack"><button class="btn btn--primary" data-action="workout-session">Открыть день</button></div>'
      );
    }

    return (
      placeChips +
      '<div class="progbar"><div><span class="progbar__name">' +
      esc(programTitle(split)) +
      " · " +
      esc(plan.label) +
      '</span><span class="progbar__meta">' +
      (wk.place === "home" ? "дома" : "зал") +
      " · " +
      prog.daysPerWeek +
      " " +
      plural(prog.daysPerWeek, "день", "дня", "дней") +
      " в неделю</span></div>" +
      '<button type="button" class="btn btn--outline btn--slim" data-action="workout-pick">Другая программа</button></div>' +
      '<p class="shelf__label">День</p>' +
      chips(
        "w_plan",
        wk.plan,
        list.map(function (p, i) {
          return [i, dayChipLabel(p)];
        })
      ) +
      card(
        cardHead(
          programTitle(split) + " · " + plan.label,
          plan.items.length +
            " " +
            plural(plan.items.length, "упражнение", "упражнения", "упражнений") +
            (dayMuscles(plan) ? " · " + dayMuscles(plan) : ""),
          prog.shelf === "start" ? "новичок" : "уже тренируюсь"
        ) +
          '<p class="note note--plain" style="margin-top:12px">Цель ' +
          esc(KM_PLANS.doseLabel(goal)) +
          ". Отдых " +
          esc(KM_PLANS.rest(goal)) +
          ".</p>",
        { gold: true }
      ) +
      noticeHtml() +
      sessionBarHtml() +
      plan.items.map(exerciseHtml).join("") +
      (state.day
        ? state.busy === "workout"
          ? card('<p class="lead">Записываю подходы…</p>')
          : '<div class="btn-stack"><button class="btn btn--primary" data-action="workout-done">Записать подходы</button></div>' +
            '<p class="note note--plain">В дневник уходит факт: вес и повторы каждого подхода, не план.</p>'
        : '<p class="note note--plain">Журнал пишется в дневник бота и работает только тогда, ' +
          "когда приложение открыто из Telegram.</p>")
    );
  }

  function extraClipHtml(e) {
    var slug = KM_PLANS.slug(e);
    var local = e.video || KM_PLANS.localVideo(e);
    var media = local
      ? '<div class="shot"><video class="shot__img" controls playsinline muted loop preload="metadata" poster="img/ex/' +
        esc(slug) +
        '.webp" src="' +
        esc(local) +
        '"></video></div>'
      : "";
    return (
      '<div class="acc acc--ex"><button class="acc__head" data-acc>' +
      thumb(slug, e.name, "ex") +
      '<span class="acc__text"><span class="acc__title">' +
      esc(e.name) +
      '</span><span class="acc__sub">' +
      esc(e.short) +
      '</span></span><span class="acc__sign">+</span></button>' +
      '<div class="acc__body">' +
      media +
      '<span class="eyebrow section__label">Как делать</span><ol class="steps-list">' +
      e.steps
        .map(function (s) {
          return "<li>" + esc(s) + "</li>";
        })
        .join("") +
      "</ol>" +
      '<span class="eyebrow section__label">Частые ошибки</span><ul class="bullets">' +
      e.mistakes
        .map(function (s) {
          return "<li>" + esc(s) + "</li>";
        })
        .join("") +
      "</ul>" +
      '<p class="note"><strong>Тяжело?</strong> ' +
      esc(e.easier) +
      "</p></div></div>"
    );
  }

  function extraGymHtml() {
    var extras = KM_PLANS.gymClips();
    if (!extras || !extras.length) return "";
    return (
      card(
        cardHead(
          "Ещё из зала",
          "Не часть выбранной программы и не пишется в журнал. Техника с тех клипов, что уже сняты."
        )
      ) + extras.map(extraClipHtml).join("")
    );
  }

  function sessionBarHtml() {
    var done = sessionDoneCount();
    var vol = sessionVolume();
    var left = restLeft();
    var started = state.session && state.session.startedAt ? state.session.startedAt : 0;
    var mins = started ? Math.max(0, Math.round((Date.now() - started) / 60000)) : 0;
    return card(
      '<div class="sessbar">' +
        '<span><strong>' +
        mins +
        "</strong> мин</span>" +
        '<span><strong>' +
        vol +
        "</strong> кг тоннаж</span>" +
        '<span><strong>' +
        done +
        "</strong> " +
        plural(done, "подход", "подхода", "подходов") +
        "</span>" +
        "</div>" +
        (left
          ? '<p class="lead" style="margin-top:10px">Отдых ' +
            left +
            " " +
            plural(left, "секунда", "секунды", "секунд") +
            "</p>"
          : "")
    );
  }

  function prevText(e, i) {
    var prev = lastLog(e.name);
    if (!prev || !prev.log || !prev.log[i]) return "нет";
    var s = prev.log[i];
    var d = KM_PLANS.dose(e);
    if (d.secs) return s.reps + " сек";
    if (!s.kg) return s.reps + " раз";
    return s.kg + " кг × " + s.reps;
  }

  function exerciseHtml(e, idx) {
    var goal = workoutGoal();
    var slug = KM_PLANS.slug(e);
    var local = KM_PLANS.localVideo(e);
    var d = KM_PLANS.dose(e);
    var sets = sessionSets(e);
    var hold = Boolean(d.secs);
    var log =
      '<div class="sets"><div class="sets__head">' +
      "<span>#</span><span>прошлый</span><span>" +
      (hold ? "сек" : "кг") +
      "</span><span>" +
      (hold ? "" : "раз") +
      "</span><span></span></div>" +
      sets
        .map(function (s, i) {
          return (
            '<div class="sets__row' +
            (s.done ? " is-done" : "") +
            '">' +
            "<span>" +
            (i + 1) +
            "</span>" +
            '<span class="sets__prev">' +
            esc(prevText(e, i)) +
            "</span>" +
            (hold
              ? '<input class="sets__in" type="number" inputmode="numeric" min="5" max="300" step="5" value="' +
                s.reps +
                '" data-set-reps="' +
                esc(e.name) +
                '" data-i="' +
                i +
                '" aria-label="Секунды" />' +
                "<span></span>"
              : '<input class="sets__in" type="number" inputmode="decimal" min="0" max="500" step="2.5" value="' +
                s.kg +
                '" data-set-kg="' +
                esc(e.name) +
                '" data-i="' +
                i +
                '" aria-label="Вес" />' +
                '<input class="sets__in" type="number" inputmode="numeric" min="1" max="100" step="1" value="' +
                s.reps +
                '" data-set-reps="' +
                esc(e.name) +
                '" data-i="' +
                i +
                '" aria-label="Повторы" />') +
            '<button type="button" class="sets__ok" data-set-toggle="' +
            esc(e.name) +
            '" data-i="' +
            i +
            '" aria-label="Готово">' +
            (s.done ? "✓" : "") +
            "</button>" +
            "</div>"
          );
        })
        .join("") +
      '<button type="button" class="sets__add" data-set-add="' +
      esc(e.name) +
      '">+ подход</button></div>';
    var media = local
      ? '<div class="shot"><video class="shot__img" controls playsinline muted loop preload="metadata" poster="img/ex/' +
        esc(slug) +
        '.webp" src="' +
        esc(local) +
        '"></video></div>'
      : slug
        ? '<div class="shot"><img class="shot__img" loading="lazy" decoding="async" alt="" src="img/ex/' +
          esc(slug) +
          '.webp" onerror="this.parentNode.remove()" /></div>'
        : "";
    var btn = local
      ? ""
      : '<div class="btn-stack" style="margin-top:12px"><button class="btn btn--outline btn--slim" data-link="' +
        esc(e.video) +
        '">Техника на видео</button></div>';
    return (
      '<div class="acc acc--ex"><button class="acc__head" data-acc>' +
      thumb(slug, e.name, "ex") +
      '<span class="acc__text"><span class="acc__kicker">Упражнение #' +
      ((idx || 0) + 1) +
      '</span><span class="acc__title">' +
      esc(e.name) +
      '</span><span class="acc__sub"><span class="ex-scheme">' +
      esc(schemeBadge(e, goal)) +
      "</span>" +
      (muscleOf(e) ? '<span class="ex-muscle">' + esc(muscleOf(e)) + "</span>" : "") +
      "</span></span><span class=\"acc__sign\">+</span></button>" +
      log +
      '<div class="acc__body">' +
      media +
      '<span class="eyebrow section__label">Как делать</span><ol class="steps-list">' +
      e.steps
        .map(function (s) {
          return "<li>" + esc(s) + "</li>";
        })
        .join("") +
      "</ol>" +
      '<span class="eyebrow section__label">Частые ошибки</span><ul class="bullets">' +
      e.mistakes
        .map(function (s) {
          return "<li>" + esc(s) + "</li>";
        })
        .join("") +
      "</ul>" +
      '<p class="note"><strong>Тяжело?</strong> ' +
      esc(e.easier) +
      "</p>" +
      (KM_PLANS.harder(e)
        ? '<p class="note"><strong>Легко?</strong> ' + esc(KM_PLANS.harder(e)) + "</p>"
        : "") +
      btn +
      "</div></div>"
    );
  }

  /* ── Экран: дневник ─────────────────────────────────────────────────────── */

  function renderDiary() {
    var entries = sortedEntries();
    var advice = KM.weightTrendAdvice(entries, state.profile.goal);

    return (
      '<div id="diary-section">' +
      card(
        cardHead("Записать вес", "Утром натощак, 3–4 раза в неделю") +
          '<div class="row">' +
          field(
            "Дата",
            '<input class="input" type="date" data-path="diary.date" value="' +
              esc(state.diary.date) +
              '" />'
          ) +
          field("Вес, кг", numInput("diary.weightKg", { min: 30, max: 250, step: 0.1 })) +
          "</div>" +
          '<div class="btn-stack"><button class="btn btn--primary" data-action="add-weight">Записать</button></div>' +
          (state.result === "diary-error"
            ? '<div style="margin-top:12px">' +
              errorBox("Вес: от 30 до 250 кг, дата обязательна.") +
              "</div>"
            : "")
      ) +
      (advice
        ? card(
            cardHead(
              "Тренд",
              "Цель: " + GOAL_WORD[state.profile.goal],
              "за " + advice.days + " " + plural(advice.days, "день", "дня", "дней")
            ) +
              figure(
                (advice.rateKgWeek > 0 ? "+" : "") + advice.rateKgWeek,
                " кг/нед",
                "фактическая скорость"
              ) +
              '<p class="lead">' +
              esc(advice.verdict) +
              "</p>",
            { gold: true }
          )
        : card(
            cardHead(
              "Тренд пока не считается",
              "Нужно 4 взвешивания за 28 дней, и между первым и последним не меньше 10 дней"
            ) +
              '<p class="lead">Дневные колебания воды дают ±1 кг, поэтому по одному взвешиванию ' +
              "решение принимать нельзя. Наберётся история, и я покажу скорость и скажу, " +
              "что делать с калориями.</p>"
          )) +
      (entries.length >= 2
        ? card(
            cardHead(
              "Динамика",
              "Последние " +
                Math.min(entries.length, 16) +
                " " +
                plural(Math.min(entries.length, 16), "запись", "записи", "записей")
            ) + weightChart(entries)
          )
        : "") +
      (entries.length
        ? card(
            cardHead("История", entries.length + " " + plural(entries.length, "запись", "записи", "записей")) +
              '<ul class="log">' +
              entries
                .slice()
                .reverse()
                .map(function (e) {
                  return (
                    '<li><span class="log__date">' +
                    esc(formatDate(e.date)) +
                    '</span><span class="log__value">' +
                    e.weightKg +
                    ' кг</span><button class="log__del" data-del="' +
                    esc(e.date) +
                    '" aria-label="Удалить">×</button></li>'
                  );
                })
                .join("") +
              "</ul>"
          )
        : "") +
      "</div>"
    );
  }

  /* ── Экран: профиль ─────────────────────────────────────────────────────── */

  var SEX_WORD = { m: "Мужчина", f: "Женщина" };
  var ACTIVITY_WORD = { low: "Низкая", mid: "Средняя", high: "Высокая" };

  /**
   * Вода за сегодня. С сервером — общая цифра с ботом; без сервера — только на
   * устройстве. Ориентир: 35 мл на кг, от свежего веса из дневника, а не из анкеты.
   */
  function waterToday() {
    return Boolean(state.day && state.day.water && state.day.date === (state.day.today || serverToday()));
  }

  function water() {
    // После просмотра вчерашнего дня state.day ещё вчерашний, пока не придёт
    // сегодня. Показывать и писать ту воду нельзя: +250 уедет не в тот день.
    if (waterToday()) return state.day.water;
    var last = sortedEntries().slice(-1)[0];
    var kg = last ? last.weightKg : num(state.profile.weightKg) || 0;
    return {
      ml: state.localWater[today()] || 0,
      targetMl: Math.round(((kg > 0 ? kg : 80) * 35) / 100) * 100,
      basedOnKg: kg || null,
      local: true
    };
  }

  function waterHomeChips() {
    var w = water();
    return (
      '<div class="chips chips--wrap" style="margin:0 0 14px">' +
      [250, 500, 750]
        .map(function (ml) {
          return '<button type="button" class="chip" data-water="' + ml + '">+' + ml + " мл</button>";
        })
        .join("") +
      (w.ml > 0 ? '<button type="button" class="chip" data-water="-250">−250 мл</button>' : "") +
      "</div>"
    );
  }

  function fmtWater(ml) {
    return ml >= 1000 ? (Math.round(ml / 100) / 10).toFixed(1).replace(".", ",") + " л" : ml + " мл";
  }

  var waterShownPct = null;

  function waterFillPct(w) {
    if (!w || !w.targetMl) return 0;
    return Math.max(0, Math.min(100, (w.ml * 100) / w.targetMl));
  }

  function glassHtml(w, size) {
    var from = waterShownPct == null ? waterFillPct(w) : waterShownPct;
    var empty = from < 2;
    return (
      '<div class="glass glass--' +
      (size || "sm") +
      (w.ml >= w.targetMl ? " glass--full" : "") +
      (empty ? " glass--empty" : "") +
      '" data-glass><div class="glass__shine"></div><div class="glass__fill" style="height:' +
      from.toFixed(1) +
      '%"><span class="glass__wave"></span><span class="glass__wave glass__wave--b"></span></div></div>'
    );
  }

  function playWaterFill() {
    var nodes = document.querySelectorAll("[data-glass]");
    if (!nodes.length) return;
    var w = water();
    var to = waterFillPct(w);
    var from = waterShownPct == null ? to : waterShownPct;
    waterShownPct = to;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var fill = el.querySelector(".glass__fill");
      if (!fill) continue;
      el.classList.toggle("glass--full", to >= 99.5);
      el.classList.toggle("glass--empty", to < 2);
      if (from === to) {
        fill.style.height = to.toFixed(1) + "%";
        continue;
      }
      fill.style.transition = "none";
      fill.style.height = from.toFixed(1) + "%";
      void fill.offsetWidth;
      fill.style.transition = "";
      fill.style.height = to.toFixed(1) + "%";
    }
  }

  function waterMetric() {
    var w = water();
    return (
      '<div class="metric metric--water">' +
      glassHtml(w, "sm") +
      "<div><span class=\"metric__label\">Вода</span><span class=\"metric__value\">" +
      fmtWater(w.ml) +
      '</span><span class="metric__sub">' +
      esc(w.ml >= w.targetMl ? "норма закрыта" : "из " + fmtWater(w.targetMl)) +
      "</span></div></div>"
    );
  }

  function waterCard() {
    var w = water();
    var left = w.targetMl - w.ml;
    return card(
      cardHead(
        left > 0 ? "Вода: осталось " + fmtWater(left) : "Вода: норма закрыта",
        w.basedOnKg
          ? "Ориентир " + fmtWater(w.targetMl) + ": 35 мл на кг при весе " + w.basedOnKg + " кг"
          : "Ориентир " + fmtWater(w.targetMl) + ". Задай вес, и посчитаю точнее",
        w.local ? "на устройстве" : null
      ) +
        '<div class="glass-row">' +
        glassHtml(w, "lg") +
        figure(fmtWater(w.ml).replace(/ (мл|л)$/, ""), w.ml >= 1000 ? " л" : " мл", "выпито сегодня") +
        "</div>" +
        // Перенос обязателен: на узком экране четвёртая кнопка уезжала в скролл
        // и «убрать лишнее» просто не было видно
        '<div class="chips chips--wrap" style="margin-top:14px">' +
        [250, 500, 750]
          .map(function (ml) {
            return (
              '<button type="button" class="chip" data-water="' +
              ml +
              '">+' +
              ml +
              " мл</button>"
            );
          })
          .join("") +
        (w.ml > 0 ? '<button type="button" class="chip" data-water="-250">−250 мл</button>' : "") +
        "</div>" +
        '<p class="note note--plain">Это ориентир для тренирующегося человека, а не ' +
        "медицинская норма. В жару и в тяжёлый день добавляй 500–700 мл сверху: Таиланд " +
        "и час работы со штангой стоят литра пота.</p>"
    );
  }

  function renderProfile() {
    var p = state.profile;
    var m = macros();
    var eaten = eatenTotals();
    var entries = sortedEntries();
    var advice = KM.weightTrendAdvice(entries, p.goal);
    var last = lastWeighIn();
    var name = state.day && state.day.firstName ? state.day.firstName : "";
    var workouts = state.day ? state.day.workoutsTotal : null;

    // Уйдя из «Питания» с открытым прошлым днём, мы ещё держим его данные, пока не
    // придёт ответ за сегодня. Показывать их под заголовком «сегодня» нельзя.
    var stale = Boolean(state.day && state.day.date !== state.day.today);

    var left = m ? m.kcal - eaten.kcal : 0;
    var factCard = stale
      ? card(cardHead("Съедено сегодня", "Обновляю данные…"))
      : m
      ? card(
          cardHead(
            left >= 0 ? "Осталось на сегодня" : "Перебор",
            "Съедено " + eaten.kcal + " из " + m.kcal + " ккал · цель: " + GOAL_WORD[p.goal],
            eaten.count + " " + plural(eaten.count, "приём", "приёма", "приёмов")
          ) +
            figure(
              (left >= 0 ? "" : "+") + Math.abs(left),
              " ккал",
              left >= 0 ? "можно съесть ещё" : "сверх нормы"
            ) +
            '<div class="bars">' +
            bar(
              "Калории",
              m.kcal - eaten.kcal >= 0 ? "#cba968" : "#d98a8a",
              eaten.kcal + " / " + m.kcal,
              (eaten.kcal * 100) / m.kcal
            ) +
            bar("Белок", "#8a7a52", eaten.proteinG + " / " + m.proteinG + " г", (eaten.proteinG * 100) / m.proteinG) +
            bar("Жиры", "#b08d45", eaten.fatG + " / " + m.fatG + " г", (eaten.fatG * 100) / m.fatG) +
            bar("Углеводы", "#7d8ea8", eaten.carbsG + " / " + m.carbsG + " г", (eaten.carbsG * 100) / m.carbsG) +
            "</div>",
          { gold: true }
        )
      : card(
          cardHead("Норма не задана", "Заполни данные, и покажу, сколько осталось на день") +
            '<div class="btn-stack"><button class="btn btn--primary" data-action="edit-profile">Задать норму</button></div>'
        );

    // Профиль вырос до восьми карточек: анкета, факт дня, еда, вода, цель, дневник
    // веса, график, оформление. Одним свитком это не читается, поэтому три
    // подраздела: что сегодня, что в динамике, как выглядит.
    var tabs =
      '<div class="chips" data-seg="prof_tab">' +
      [["day", "Сегодня"], ["progress", "Прогресс"], ["look", "Вид"]]
        .map(function (o) {
          return (
            '<button type="button" class="chip" data-value="' +
            o[0] +
            '" aria-pressed="' +
            (state.profTab === o[0]) +
            '">' +
            o[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>";

    if (state.profTab === "progress") {
      return (
        noticeHtml() +
        tabs +
        progressHeroCard() +
        weekMomentumCard() +
        forecastProgressCard() +
        topLiftsCard() +
        programCard() +
        goalWeightCard() +
        recentWorkoutsCard() +
        renderDiary()
      );
    }
    if (state.profTab === "look") {
      return noticeHtml() + tabs + themeCard() + aboutCard();
    }

    return (
      noticeHtml() +
      tabs +
      card(
        cardHead(
          name ? esc(name) : "Личный профиль",
          SEX_WORD[p.sex] +
            " · " +
            num(p.age) +
            " " +
            plural(num(p.age), "год", "года", "лет") +
            " · " +
            num(p.heightCm) +
            " см",
          GOAL_WORD[p.goal]
        ) +
          '<div class="grid-2">' +
          metric(
            "Вес",
            last ? last.weightKg + ' <span class="figure__unit">кг</span>' : "нет",
            last
              ? last.fromDiary
                ? "запись " + formatDate(last.date)
                : "из анкеты"
              : "ещё не взвешивался"
          ) +
          metric(
            "Тренд",
            advice ? (advice.rateKgWeek > 0 ? "+" : "") + advice.rateKgWeek + ' <span class="figure__unit">кг/нед</span>' : "нет",
            advice
              ? "за " + advice.days + " " + plural(advice.days, "день", "дня", "дней")
              : "нужно 4 взвешивания"
          ) +
          "</div>" +
          '<div class="grid-2">' +
          metric("Активность", ACTIVITY_WORD[p.activity], "коэффициент в норме калорий") +
          metric(
            "Тренировок",
            workouts === null ? "нет" : String(workouts),
            workouts === null ? "счёт ведёт бот в чате" : "записано всего"
          ) +
          "</div>" +
          '<div class="btn-stack" style="margin-top:16px">' +
          '<button class="btn btn--outline btn--slim" data-action="edit-profile">Изменить данные</button>' +
          "</div>"
      ) +
      factCard +
      // Еда и вода стоят рядом: то, что человек делает каждый день по многу раз,
      // не должно требовать перехода в другой раздел
      (stale ? "" : addOrBusy(state.day ? state.day.photo : null) + mealsListCard(mealsToday(), true)) +
      waterCard()
    );
  }

  /**
   * Цель по весу. Одно поле, но без него прогноз на «Сегодня» невозможен, а
   * прогноз — единственная честная замена обещаниям «−8 кг за месяц», которыми
   * торгуют соседи по нише.
   */
  function goalWeightCard() {
    var goal = num(state.goalWeightKg);
    var last = sortedEntries().slice(-1)[0];
    var set = goal >= 30 && goal <= 250;
    return card(
      cardHead(
        set ? "Цель: " + goal + " кг" : "Цель по весу не задана",
        set && last
          ? (goal > last.weightKg ? "+" : "") + (goal - last.weightKg).toFixed(1) + " кг от последнего взвешивания"
          : "Задай цель, и на «Сегодня» появится прогноз: когда ты её достигнешь при текущем темпе"
      ) +
        field("Целевой вес, кг", numInput("goalWeightKg", { min: 30, max: 250, step: 0.1, placeholder: "например 82" })) +
        '<div class="btn-stack"><button class="btn btn--outline btn--slim" data-action="save-goal-weight">Сохранить цель</button></div>'
    );
  }

  /** Где живут данные и какая версия открыта: без этого спор «я обновил» не решить. */
  function aboutCard() {
    var b = KM_API.build ? KM_API.build() : "";
    var when = b ? new Date(Number(b) * 1000) : null;
    return card(
      cardHead(
        "Где хранятся данные",
        online ? "Дневник общий с ботом: записи видны и в чате" : "Только на этом устройстве: приложение открыто вне Telegram"
      ) +
        '<ul class="bullets">' +
        "<li>Еда, вода, вес и тренировки лежат в базе бота и привязаны к твоему Telegram.</li>" +
        "<li>Тема оформления и цель по весу хранятся на устройстве и ни на что не влияют.</li>" +
        "<li>Фото уходит на сервер бота для распознавания и не сохраняется.</li>" +
        "</ul>" +
        '<div class="btn-stack" style="margin-top:14px"><button class="btn btn--outline btn--slim" data-action="open-calc">Циклы 5/3/1 и DUP</button></div>' +
        '<p class="note note--plain">Версия приложения: ' +
        (when
          ? String(when.getDate()).padStart(2, "0") +
            "." +
            String(when.getMonth() + 1).padStart(2, "0") +
            " " +
            String(when.getHours()).padStart(2, "0") +
            ":" +
            String(when.getMinutes()).padStart(2, "0")
          : "не определена") +
        "</p>"
    );
  }

  /** Оформление: выбор человека, а не подстройка под тему Telegram. */
  function themeCard() {
    return card(
      cardHead("Оформление", "Три темы: ночная, графитовая и светлая") +
        chips(
          "theme",
          state.theme,
          Object.keys(THEMES).map(function (id) {
            return [id, THEMES[id].label];
          }),
          true
        ) +
        '<p class="note note--plain">Тема хранится на устройстве и не влияет на расчёты.</p>'
    );
  }

  function addWater(ml) {
    haptic("light");
    if (state.day) {
      KM_API.addWater(ml)
        .then(function (data) {
          state.day = data;
          render();
        })
        .catch(function (e) {
          state.notice = { kind: "err", text: e && e.message ? e.message : "Не сохранилось." };
          render();
        });
      return;
    }
    var key = today();
    state.localWater[key] = Math.max(0, Math.min(15000, (state.localWater[key] || 0) + ml));
    persist();
    render();
  }

  function recentWorkoutsCard() {
    var list = state.day && state.day.workoutsRecent ? state.day.workoutsRecent : [];
    if (!list.length) {
      return card(
        cardHead("Тренировки", "Пока нет записей") +
          '<p class="lead">Запиши подходы в «Тренировке», и веса появятся здесь.</p>'
      );
    }
    return card(
      cardHead(
        "Тренировки",
        "Последние " + list.length,
        String(state.day.workoutsTotal || list.length)
      ) +
        '<ul class="log">' +
        list
          .map(function (w) {
            return (
              '<li><span class="log__date">' +
              esc(formatDate(w.date)) +
              '</span><span class="log__value">' +
              esc(w.name) +
              (w.kg
                ? " · " + w.kg + " кг × " + w.reps
                : w.volume
                  ? " · " + w.volume + " кг"
                  : "") +
              "</span></li>"
            );
          })
          .join("") +
        "</ul>"
    );
  }

  function formatDate(iso) {
    var p = iso.split("-");
    return p[2] + "." + p[1];
  }

  function weightChart(entries) {
    var pts = entries.slice(-16);
    var w = 320,
      h = 110,
      pad = 10;
    var vals = pts.map(function (e) {
      return e.weightKg;
    });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (max - min < 1) {
      min -= 0.5;
      max += 0.5;
    }
    var x = function (i) {
      return pad + (i * (w - 2 * pad)) / (pts.length - 1);
    };
    var y = function (v) {
      return pad + ((max - v) * (h - 2 * pad)) / (max - min);
    };

    var line = pts
      .map(function (e, i) {
        return x(i).toFixed(1) + "," + y(e.weightKg).toFixed(1);
      })
      .join(" ");

    var area =
      "M" +
      x(0).toFixed(1) +
      "," +
      (h - pad).toFixed(1) +
      " L" +
      line.split(" ").join(" L") +
      " L" +
      x(pts.length - 1).toFixed(1) +
      "," +
      (h - pad).toFixed(1) +
      " Z";

    var dots = pts
      .map(function (e, i) {
        return (
          '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(e.weightKg).toFixed(1) + '" r="2.6" fill="#cba968"/>'
        );
      })
      .join("");

    return (
      '<div class="chart"><svg viewBox="0 0 ' +
      w +
      " " +
      h +
      '" preserveAspectRatio="none" role="img" aria-label="График веса">' +
      '<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#b08d45" stop-opacity="0.28"/>' +
      '<stop offset="100%" stop-color="#b08d45" stop-opacity="0"/>' +
      "</linearGradient></defs>" +
      '<path d="' +
      area +
      '" fill="url(#wg)"/>' +
      '<polyline points="' +
      line +
      '" fill="none" stroke="#cba968" stroke-width="1.6" stroke-linejoin="round"/>' +
      dots +
      '</svg><div class="chart__axis"><span>' +
      formatDate(pts[0].date) +
      " · " +
      pts[0].weightKg +
      " кг</span><span>" +
      formatDate(pts[pts.length - 1].date) +
      " · " +
      pts[pts.length - 1].weightKg +
      " кг</span></div></div>"
    );
  }

  /* ── Навигация ──────────────────────────────────────────────────────────── */

  var ICONS = {
    home: "M4 11l8-6.5 8 6.5v8a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
    workout: "M4 9v6M8 6.5v11M16 6.5v11M20 9v6M8 12h8",
    nutrition: "M7 3v8M5 3v3.5a2 2 0 0 0 4 0V3M7 11v10M15.5 21V3c2 1.2 3 3.2 3 6.2s-1 3.8-3 3.8",
    calc: "M6 3.5h12v17H6zM9.5 7.5h5M9 11.5h.01M12 11.5h.01M15 11.5h.01M9 15.5h.01M12 15.5h.01M15 15.5h.01",
    diary: "M4 19h16M6.5 15.5l4-5 3 3 4.5-6.5",
    profile: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
  };

  // Дневник веса больше не отдельная вкладка: он часть профиля — там же, где вес,
  // тренд и вода. Экран `diary` остался в SCREENS, на него ведут ссылки из подсказок.
  var TABS = [
    ["home", "Сегодня", "Сегодня"],
    ["workout", "Тренировка", "Тренировка"],
    ["nutrition", "Питание", "Питание"],
    ["profile", "Профиль", "Личный профиль"]
  ];

  function renderTabs() {
    tabbar.innerHTML = TABS.map(function (t) {
      var active = state.screen === t[0];
      return (
        '<button class="tab" data-go="' +
        t[0] +
        '"' +
        (active ? ' aria-current="page"' : "") +
        '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
        ICONS[t[0]] +
        '"/></svg><span class="tab__label">' +
        esc(t[1]) +
        "</span></button>"
      );
    }).join("");
  }

  var SCREENS = {
    setup: renderSetup,
    home: renderHome,
    workout: renderWorkout,
    nutrition: renderNutrition,
    calc: renderCalc,
    diary: renderDiary,
    profile: renderProfile
  };

  /** Нижняя web_app-клавиатура на iPhone: SDK есть, подписи нет. Нельзя
   *  показывать локальный дневник: человек принимает его за настоящий. */
  function telegramUnsigned() {
    if (KM_API.available()) return false;
    var d = KM_API.diag ? KM_API.diag() : null;
    if (!d) return false;
    return Boolean(d.sdk || (d.platform && d.platform !== "неизвестен"));
  }

  function unsignedGate() {
    return card(
      cardHead("Это окно без доступа к дневнику", "Открой заново из сообщения бота") +
        "<p class=\"lead\">Широкая кнопка внизу чата на iPhone не передаёт подпись Telegram. " +
        "Цифры здесь будут пустыми или чужими. Закрой окно и нажми «Открыть KINGMODE» в сообщении " +
        "или «KINGMODE» слева от поля ввода.</p>"
    );
  }

  function joinGate(info) {
    var j = info || {};
    var kind = j.kind === "group" ? "группу" : "канал";
    var title = j.title || "KINGMODE";
    var url = j.url || "";
    return card(
      cardHead("Вход для своих", "Без подписки приложение закрыто") +
        "<p class=\"lead\">KINGMODE работает только для тех, кто в " +
        kind +
        " " +
        esc(title) +
        ". Вступи и вернись, кнопка перепроверит.</p>" +
        '<div class="btn-stack" style="margin-top:14px">' +
        (url
          ? '<a class="btn btn--primary" href="' +
            esc(url) +
            '" data-ext="tg">Вступить</a>'
          : "") +
        '<button class="btn ' +
        (url ? "btn--outline" : "btn--primary") +
        '" data-action="reload-day">Я уже внутри</button>' +
        "</div>"
    );
  }

  function render() {
    if (telegramUnsigned()) {
      view.innerHTML = '<div class="screen">' + unsignedGate() + "</div>";
      titleEl.textContent = "KINGMODE";
      tabbar.hidden = true;
      if (tg && tg.BackButton) tg.BackButton.hide();
      return;
    }
    if (needJoin) {
      view.innerHTML = '<div class="screen">' + joinGate(needJoin) + "</div>";
      titleEl.textContent = "Вход";
      tabbar.hidden = true;
      if (tg && tg.BackButton) tg.BackButton.hide();
      return;
    }
    view.innerHTML = '<div class="screen">' + SCREENS[state.screen]() + "</div>";
    var tab = TABS.filter(function (t) {
      return t[0] === state.screen;
    })[0];
    titleEl.textContent = tab ? tab[2] : state.screen === "setup" ? "Знакомство" : "KINGMODE";
    tabbar.hidden = state.screen === "setup";
    renderTabs();

    if (tg && tg.BackButton) {
      if (state.screen === "home" || state.screen === "setup") tg.BackButton.hide();
      else tg.BackButton.show();
    }
    playWaterFill();
  }

  function go(screen) {
    if (!SCREENS[screen]) return;
    if (screen === "workout") workoutPick = false;
    state.screen = screen;
    state.result = null;
    state.notice = null;
    // Вопрос про порцию задаётся один раз, сразу после записи: на другом экране
    // он превращается в непонятную карточку без повода
    state.lastMeal = null;
    // Неподтверждённый разбор остаётся: вернёшься в «Съедено» или с «Сегодня» —
    // карточка на месте. Явный отказ — кнопка «Поправить результат».
    clearPhotoPreview();
    haptic("light");
    // Уходя из «Съедено», возвращаемся к сегодняшнему дню: иначе «Сегодня»
    // покажет итоги вчерашнего
    var reload = state.viewDate && screen !== "nutrition";
    if (reload) state.viewDate = null;
    render();
    if (reload) loadDay(true);
    window.scrollTo(0, 0);
  }

  function showResult(kind) {
    state.result = kind;
    haptic("medium");
    // Норма уходит в бота, чтобы в чате и в приложении была одна цифра
    if (kind === "nutrition") syncProfile();
    var box = document.getElementById("result");
    if (!box) return render();
    box.innerHTML =
      kind === "nutrition" ? nutritionResult() : kind === "orm" ? ormResult() : programResult();
    persist();
    var target = box.querySelector(".section, .error");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── События ────────────────────────────────────────────────────────────── */

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;

    var goEl = t.closest("[data-go]");
    if (goEl) return go(goEl.getAttribute("data-go"));

    // Вода проверяется до .chip: кнопки объёма используют тот же класс,
    // но переключателем разделов не являются
    var wat = t.closest("[data-water]");
    if (wat) return addWater(parseInt(wat.getAttribute("data-water"), 10));

    // Повтор частого блюда — тоже раньше .chip, по той же причине
    var ask = t.closest("[data-repeat-ask]");
    if (ask) {
      state.repeatAsk = {
        name: ask.getAttribute("data-repeat-ask"),
        kcal: Number(ask.getAttribute("data-kcal")) || 0,
      };
      state.notice = null;
      haptic("light");
      return render();
    }
    var rep = t.closest("[data-repeat]");
    if (rep) return repeatMeal(rep.getAttribute("data-repeat"));

    // Множитель порции: тоже чип, и его нельзя отдавать общему переключателю
    var portion = t.closest("[data-portion]");
    if (portion) return scaleLastMeal(Number(portion.getAttribute("data-portion")));

    // Крестик у позиции разбора: убрать то, чего на снимке не было
    var partDrop = t.closest("[data-part-drop]");
    if (partDrop) return dropPendingPart(Number(partDrop.getAttribute("data-part-drop")));

    var setToggle = t.closest("[data-set-toggle]");
    if (setToggle) {
      var tn = setToggle.getAttribute("data-set-toggle");
      var ti = Number(setToggle.getAttribute("data-i"));
      var tsets = ensureSession().lifts[tn];
      if (tsets && tsets[ti]) {
        tsets[ti].done = !tsets[ti].done;
        if (tsets[ti].done) armRest();
        haptic("medium");
        return render();
      }
    }
    var setAdd = t.closest("[data-set-add]");
    if (setAdd) {
      var an = setAdd.getAttribute("data-set-add");
      var asets = ensureSession().lifts[an];
      if (asets && asets.length < 12) {
        var last = asets[asets.length - 1] || { kg: 0, reps: 8 };
        asets.push({ kg: last.kg, reps: last.reps, done: false });
        haptic("light");
        return render();
      }
    }

    var chip = t.closest(".chip, .prog");
    if (chip) return onSeg(chip);

    var acc = t.closest("[data-acc]");
    if (acc) {
      var open = acc.parentElement.classList.toggle("is-open");
      acc.querySelector(".acc__sign").textContent = open ? "–" : "+";
      haptic("light");
      return;
    }

    var link = t.closest("[data-link]");
    if (link) {
      var url = link.getAttribute("data-link");
      if (tg && tg.openLink) tg.openLink(url);
      else window.open(url, "_blank", "noopener");
      return;
    }

    // Ссылки в подвале. Внутри Telegram обычный target="_blank" не открывается:
    // WebView блокирует новое окно, поэтому адрес отдаём в SDK. Для t.me нужен
    // именно openTelegramLink — openLink уводит канал во внешний браузер.
    var ext = t.closest("[data-ext]");
    if (ext && tg) {
      ev.preventDefault();
      var extUrl = ext.getAttribute("href");
      if (ext.getAttribute("data-ext") === "tg" && tg.openTelegramLink) tg.openTelegramLink(extUrl);
      else if (tg.openLink) tg.openLink(extUrl);
      else window.open(extUrl, "_blank", "noopener");
      return;
    }

    var delMeal = t.closest("[data-delmeal]");
    if (delMeal) {
      var mealId = delMeal.getAttribute("data-delmeal");
      state.notice = null;
      if (state.day) {
        KM_API.remove(mealId)
          .then(function (data) {
            state.day = data;
            haptic("light");
            render();
          })
          .catch(mealError);
      } else {
        state.localMeals = state.localMeals.filter(function (m) {
          return m.id !== mealId;
        });
        persist();
        haptic("light");
        render();
      }
      return;
    }

    var del = t.closest("[data-del]");
    if (del) {
      var date = del.getAttribute("data-del");
      state.entries = state.entries.filter(function (e) {
        return e.date !== date;
      });
      persist();
      haptic("light");
      if (state.day) {
        KM_API.removeWeight(date)
          .then(function (data) {
            state.day = data;
            render();
          })
          .catch(function () {
            render();
          });
        return;
      }
      return render();
    }

    var action = t.closest("[data-action]");
    if (!action) return;

    switch (action.getAttribute("data-action")) {
      case "calc-nutrition":
        return showResult("nutrition");
      case "calc-orm":
        return showResult("orm");
      case "calc-program":
        return showResult("program");
      case "add-weight":
        return addWeight();
      case "go-norm":
        state.nutTab = "norm";
        state.notice = null;
        return render();
      case "edit-profile":
        // Данные профиля живут в одной форме с нормой калорий: две копии полей
        // разошлись бы, и человек не понял бы, какая цифра считается
        state.nutTab = "norm";
        return go("nutrition");
      case "add-text-form":
      case "add-manual-form":
      case "add-food-form":
        state.addMode = action.getAttribute("data-action").replace("add-", "").replace("-form", "");
        if (state.addMode === "food") state.foodMore = {};
        state.notice = null;
        haptic("light");
        return render();
      case "food-more":
        var grp = action.getAttribute("data-group");
        if (!state.foodMore) state.foodMore = {};
        if (grp) state.foodMore[grp] = true;
        haptic("light");
        return render();
      case "reload-day":
        state.linkError = null;
        state.notice = null;
        haptic("light");
        render();
        return loadDay(false, Boolean(needJoin));
      case "pick-photo": {
        var pick = document.getElementById("photoInput");
        if (!pick) return;
        pick.value = "";
        haptic("light");
        pick.click();
        return;
      }
      case "water-250":
        return addWater(250);
      case "open-pending":
        state.screen = "nutrition";
        state.nutTab = "eaten";
        haptic("light");
        return render();
      case "meal-confirm":
        return confirmPending();
      case "meal-reject":
        return rejectPending();
      case "same-as-yes": {
        var same = sameAsOffered();
        if (!same) return;
        return repeatMeals(
          same.meals.map(function (m) {
            return m.name;
          })
        );
      }
      case "same-as-no": {
        var off = sameAsOffered();
        state.sameAsSkip = off ? { date: serverToday(), slot: off.slot } : null;
        persist();
        haptic("light");
        return render();
      }
      case "repeat-yes":
        if (!state.repeatAsk) return;
        return repeatMeals([state.repeatAsk.name]);
      case "repeat-no":
        state.repeatAsk = null;
        haptic("light");
        return render();
      case "portion-done":
        state.lastMeal = null;
        state.notice = null;
        haptic("light");
        return render();
      case "nutrition-tab":
        // Объяснение, почему фото недоступно, живёт в «Питании»: там же кнопка
        // «Проверить связь» и вся диагностика
        state.nutTab = "eaten";
        return go("nutrition");
      case "save-goal-weight":
        persist();
        state.notice = { kind: "ok", text: "Цель сохранена." };
        haptic("medium");
        return render();
      case "add-food":
        return addMealFood(action.getAttribute("data-food"), Number(action.getAttribute("data-grams")));
      case "day-prev":
        return openDay(shiftDate(viewDate(), -1));
      case "day-next":
        return openDay(shiftDate(viewDate(), 1));
      case "route-food":
        return openRouteFood();
      case "route-water":
        return openRouteWater();
      case "route-workout":
        if (isRestToday() && !workoutLoggedToday()) return markRestDay();
        workoutPick = false;
        return go("workout");
      case "route-rest":
        return markRestDay();
      case "route-weight":
        state.profTab = "progress";
        return go("profile");
      case "go-progress":
        state.profTab = "progress";
        return go("profile");
      case "scroll-diary":
        state.profTab = "progress";
        go("profile");
        setTimeout(function () {
          var el = document.getElementById("diary-section");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
        return;
      case "workout-done":
        return markWorkoutDone();
      case "workout-pick":
        workoutPick = true;
        haptic("light");
        return render();
      case "workout-session":
        workoutPick = false;
        haptic("light");
        return render();
      case "open-calc":
        return go("calc");
      case "program-activate":
        return activateProgram();
      case "program-done":
        return markProgramDone();
      case "add-text":
        return addMealText();
      case "add-manual":
        return addMealManual();
      case "log-menu":
        return logMenuMeal(action.getAttribute("data-mealkey"));
      case "menu-meal":
        return toggleMenuMeal(action.getAttribute("data-mealkey"));
      case "menu-pick":
        return toggleMenuPick(action.getAttribute("data-itemid"));
      case "menu-swap":
        return swapMenuItem(action.getAttribute("data-itemid"), action.getAttribute("data-food"));
      case "setup-done":
        return finishSetup();
      case "setup-skip":
        state.setupDone = true;
        persist();
        return go("home");
      case "orm-to-program":
        ensureLifts();
        state.program.lifts[0].oneRmKg = KM.calcOneRm(
          num(state.orm.weightKg),
          Math.round(num(state.orm.reps))
        );
        state.calcTab = "program";
        state.result = null;
        persist();
        haptic("medium");
        render();
        return window.scrollTo(0, 0);
    }
  });

  /*
   * Браузер шагает значение input[type=number] колесом мыши, если поле в фокусе.
   * Прокрутил страницу, стоя курсором над полем веса, — вес молча уехал на 0.1
   * за каждый щелчок колеса. Снимаем фокус: страница листается, цифра не меняется.
   */
  document.addEventListener(
    "wheel",
    function (ev) {
      var el = ev.target;
      if (el && el.tagName === "INPUT" && el.type === "number" && el === document.activeElement) {
        el.blur();
      }
    },
    { passive: true }
  );

  ["input", "change"].forEach(function (evt) {
    view.addEventListener(evt, function (ev) {
      var path = ev.target.getAttribute && ev.target.getAttribute("data-path");
      if (!path) return;
      setPath(path, ev.target.value);
      persist();
      // Список продуктов обновляем точечно: перерисовка всего экрана
      // забрала бы фокус из поля поиска
      if (path === "foodQuery" || path === "foodGrams") {
        var box = document.getElementById("foodList");
        if (box) box.innerHTML = foodListHtml();
      }
      if (path.indexOf("profile.") === 0) {
        var result = document.getElementById("result");
        if (result) result.innerHTML = macros() ? nutritionResult() : "";
        syncProfile();
      }
    });
  });

  // Слушаем на document, а не на #view: событие change от файлового поля в некоторых
  // WebView не всплывает до промежуточного контейнера
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (!t) return;

    // Вес позиции в разборе. Слушаем change, а не input: пересчёт идёт на сервере,
    // и запрос на каждую набранную цифру означал бы три запроса вместо одного.
    if (t.hasAttribute && t.hasAttribute("data-part-g")) {
      setPendingPartGrams(Number(t.getAttribute("data-part-g")), Number(t.value));
      return;
    }
    if (t.hasAttribute && (t.hasAttribute("data-set-kg") || t.hasAttribute("data-set-reps"))) {
      var sname = t.getAttribute("data-set-kg") || t.getAttribute("data-set-reps");
      var si = Number(t.getAttribute("data-i"));
      var rows = ensureSession().lifts[sname];
      if (rows && rows[si]) {
        if (t.hasAttribute("data-set-kg")) rows[si].kg = Number(t.value) || 0;
        else rows[si].reps = Number(t.value) || 1;
      }
      return;
    }

    if (t.id !== "photoInput") return;
    var file = t.files && t.files[0];
    t.value = ""; // чтобы повторный выбор того же файла снова дал событие
    if (file) addMealPhoto(file);
  });

  function onSeg(btn) {
    var group = btn.closest("[data-seg]");
    if (!group) return;
    var name = group.getAttribute("data-seg");
    var value = btn.getAttribute("data-value");
    haptic("light");

    switch (name) {
      case "sex":
      case "activity":
      case "goal":
        state.profile[name] = value;
        persist();
        syncProfile();
        return render();
      case "calc_tab":
        state.calcTab = value;
        state.result = null;
        return render();
      case "nut_tab":
        state.nutTab = value;
        state.notice = null;
        state.addMode = null;
        return render();
      case "prof_tab":
        state.profTab = value;
        state.notice = null;
        state.addMode = null;
        return render();
      case "theme":
        state.theme = value;
        persist();
        applyTheme();
        return render();
      case "menu_id":
        state.menu.id = value;
        state.notice = null;
        persist();
        return render();
      case "s_place":
        state.workout.place = value;
        state.workout.plan = 0;
        persist();
        return render();
      case "s_level":
        state.workout.level = value;
        state.workout.split = value === "train" ? "fb-train" : "fb-start";
        state.workout.plan = 0;
        persist();
        return render();
      case "s_split":
        state.workout.split = value;
        state.workout.level = KM_PLANS.splitLevel(value);
        state.workout.plan = 0;
        persist();
        return render();
      case "p_model":
        state.program.model = value;
        state.result = null;
        return render();
      case "p_goal":
        state.program.goal = value;
        break;
      case "p_weeks":
        state.program.weeks = Number(value);
        break;
      case "p_days":
        state.program.days = Number(value);
        ensureLifts();
        markPressed(group, value);
        document.getElementById("lifts").innerHTML = liftRows();
        persist();
        return;
      case "w_place":
        state.workout.place = value;
        state.workout.plan = 0;
        resetSession();
        workoutTouched = true;
        persist();
        if (state.day) {
          KM_API.saveSettings({ place: value, level: workoutLevel(), split: workoutSplit() })
            .then(function (data) {
              state.day = data;
            })
            .catch(function () {});
        }
        return render();
      case "w_level":
        state.workout.level = value;
        state.workout.split = value === "train" ? "fb-train" : "fb-start";
        state.workout.plan = 0;
        resetSession();
        workoutTouched = true;
        persist();
        if (state.day) {
          KM_API.saveSettings({ place: state.workout.place, level: value, split: workoutSplit() })
            .then(function (data) {
              state.day = data;
            })
            .catch(function () {});
        }
        return render();
      case "w_split":
        state.workout.split = value;
        state.workout.level = KM_PLANS.splitLevel(value);
        state.workout.plan = 0;
        workoutPick = false;
        resetSession();
        workoutTouched = true;
        persist();
        if (state.day) {
          KM_API.saveSettings({ place: state.workout.place, level: workoutLevel(), split: value })
            .then(function (data) {
              state.day = data;
            })
            .catch(function () {});
        }
        return render();
      case "w_plan":
        state.workout.plan = Number(value);
        resetSession();
        workoutTouched = true;
        persist();
        return render();
    }

    markPressed(group, value);
    persist();

    // Результат уже на экране — пересчитываем сразу, без повторного нажатия кнопки
    if (state.result && state.result !== "diary-error") showResult(state.result);
  }

  function markPressed(group, value) {
    Array.prototype.forEach.call(group.querySelectorAll(".chip, .prog"), function (b) {
      var on = b.getAttribute("data-value") === String(value);
      b.setAttribute("aria-pressed", String(on));
      if (b.classList.contains("prog")) {
        if (on) b.classList.add("is-on");
        else b.classList.remove("is-on");
      }
    });
  }

  function addMealText() {
    var text = String(state.mealText || "").trim();
    if (text.length < 2) {
      state.notice = { kind: "err", text: "Напиши, что съел: продукты и граммы." };
      return render();
    }
    state.busy = "text";
    state.notice = null;
    render();
    KM_API.text(text).then(applyPendingResult).catch(mealError);
  }

  function addMealManual() {
    var m = state.manual;
    var kcal = num(m.kcal);
    if (!(kcal >= 1 && kcal <= 6000)) {
      state.notice = { kind: "err", text: "Калории: от 1 до 6000." };
      return render();
    }
    var meal = {
      name: String(m.name || "").trim().slice(0, 60) || "Приём пищи",
      kcal: Math.round(kcal),
      proteinG: Math.round(num(m.proteinG) || 0),
      fatG: Math.round(num(m.fatG) || 0),
      carbsG: Math.round(num(m.carbsG) || 0)
    };

    saveMeal(meal, "manual");
  }

  /** Запись приёма с уже известными КБЖУ: ручной ввод и меню идут одним путём. */
  function saveMeal(meal, busyKind) {
    if (state.day) {
      state.busy = busyKind;
      state.notice = null;
      render();
      KM_API.manual(meal)
        .then(function (data) {
          applyMealResult(data, "Записал: " + meal.name + ", " + meal.kcal + " ккал.");
        })
        .catch(mealError);
      return;
    }

    state.localMeals.push(
      Object.assign({ id: "l" + Date.now().toString(36), date: today() }, meal)
    );
    state.addMode = null;
    state.manual = { name: "", kcal: "", proteinG: "", fatG: "", carbsG: "" };
    state.notice = { kind: "ok", text: "Записал: " + meal.name + ", " + meal.kcal + " ккал." };
    persist();
    haptic("medium");
    render();
  }

  /** Повтор блюда из истории: сервер копирует последнюю запись с этим названием. */
  function repeatMeal(name) {
    return repeatMeals(name ? [name] : []);
  }

  function repeatMeals(names) {
    if (!names || !names.length || !state.day) return;
    state.busy = "food";
    state.repeatAsk = null;
    state.notice = null;
    render();
    KM_API.repeat(names)
      .then(function (data) {
        var extra = data.copied && data.copied.length > 1 ? data.copied : null;
        var kcal = extra
          ? extra.reduce(function (a, m) {
              return a + m.kcal;
            }, 0)
          : data.meal.kcal;
        var text = extra
          ? "Записал " + extra.length + " " + plural(extra.length, "приём", "приёма", "приёмов") + ", " + kcal + " ккал."
          : "Записал: " + data.meal.name + ", " + data.meal.kcal + " ккал.";
        applyMealResult(data, text);
      })
      .catch(mealError);
  }

  function addMealFood(name, grams) {
    if (!name || !state.day) return;
    state.busy = "food";
    state.notice = null;
    render();
    KM_API.food(name, grams)
      .then(function (data) {
        state.foodQuery = "";
        state.foodGrams = "";
        applyMealResult(data, "Записал: " + data.meal.name + ", " + data.meal.kcal + " ккал.");
      })
      .catch(mealError);
  }

  function openDay(date) {
    if (!state.day) return;
    if (date > serverToday()) return;
    state.viewDate = date === serverToday() ? null : date;
    state.notice = null;
    state.addMode = null;
    haptic("light");
    render();
    loadDay(true);
  }

  function clearPhotoPreview() {
    if (state.photoPreview && String(state.photoPreview).indexOf("blob:") === 0) {
      try {
        URL.revokeObjectURL(state.photoPreview);
      } catch (e) {
        /* старый WebView */
      }
    }
    state.photoPreview = null;
  }

  function addMealPhoto(file) {
    clearPhotoPreview();
    state.photoPreview = URL.createObjectURL(file);
    state.busy = "photo";
    state.notice = null;
    render();
    KM_API.photo(file).then(applyPendingResult).catch(mealError);
  }

  function addWeight() {
    var w = num(state.diary.weightKg);
    var date = state.diary.date;
    if (!(w >= 30 && w <= 250) || !date) {
      state.result = "diary-error";
      haptic("heavy");
      return render();
    }
    var kg = Math.round(w * 10) / 10;

    // Локальную копию пишем всегда: она резерв и источник в офлайн-режиме
    state.entries = state.entries.filter(function (e) {
      return e.date !== date;
    });
    state.entries.push({ date: date, weightKg: kg });
    if (date === serverToday()) state.profile.weightKg = kg; // свежий вес идёт в расчёт калорий
    state.diary.weightKg = "";
    state.result = null;
    persist();
    haptic("medium");
    render();

    if (state.day) {
      KM_API.saveWeight(kg, date)
        .then(function (data) {
          state.day = data;
          render();
        })
        .catch(function (err) {
          state.notice = {
            kind: "err",
            text: (err && err.message) || "Вес записан на устройстве, но не ушёл в бота."
          };
          render();
        });
    }
  }

  /* ── Старт ──────────────────────────────────────────────────────────────── */

  restore();
  ensureLifts();
  state.diary.date = today();
  state.nutTab = online ? "eaten" : "norm";
  if (!state.setupDone && !hadSavedProfile) state.screen = "setup";

  applyTheme();

  if (tg) {
    tg.ready();
    tg.expand();
    applyTheme(); // после ready(): до него клиент не принимает цвет полос
    if (tg.BackButton) {
      tg.BackButton.onClick(function () {
        if (state.screen === "home") tg.close();
        else if (state.screen === "workout" && workoutPick) {
          workoutPick = false;
          render();
        } else go("home");
      });
      tg.BackButton.hide();
    }
  }

  // Метка версии в подвале: по скриншоту сразу видно, какой код открыт на
  // устройстве. Без неё «я обновил» против «у меня по-прежнему» не проверить.
  try {
    var mark = document.getElementById("buildMark");
    var b = KM_API.build ? KM_API.build() : "";
    if (mark) {
      var when = b ? new Date(Number(b) * 1000) : null;
      mark.textContent = when
        ? "Сборка " +
          String(when.getDate()).padStart(2, "0") +
          "." +
          String(when.getMonth() + 1).padStart(2, "0") +
          " " +
          String(when.getHours()).padStart(2, "0") +
          ":" +
          String(when.getMinutes()).padStart(2, "0")
        : "Версия сборки не определилась";
    }
  } catch (e) {
    /* метка не критична */
  }

  render();
  loadDay(true);
})();
