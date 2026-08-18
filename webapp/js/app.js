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
    calcTab: "orm",
    nutTab: "eaten",
    menu: { id: "ru" },
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
    migrated: false, // локальные записи веса уже перенесены в базу бота
    localMeals: [], // режим без сервера: только ручной ввод, хранение на устройстве
    localWater: {}, // режим без сервера: { "YYYY-MM-DD": мл }
    profile: { sex: "m", age: 30, heightCm: 180, weightKg: 80, activity: "mid", goal: "maint" },
    orm: { weightKg: 100, reps: 5 },
    program: { model: "531", goal: "strength", weeks: 8, days: 3, lifts: [] },
    workout: { place: "home", plan: 0 },
    diary: { date: today(), weightKg: "" },
    entries: [],
    lastOrm: null,
    result: null
  };

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
          migrated: state.migrated
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

  function macros() {
    var p = state.profile;
    var age = num(p.age),
      h = num(p.heightCm),
      w = num(p.weightKg);
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

  /** Источник дневника веса: база бота, если приложение online, иначе устройство. */
  function sortedEntries() {
    var src = state.day && state.day.bodyweight ? state.day.bodyweight : state.entries;
    return src.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
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

  function loadDay(silent) {
    if (!online) return;
    KM_API.state(state.viewDate || undefined)
      .then(function (data) {
        state.day = data;
        state.linkError = null;
        // План тренировки ведёт бот: в чате и в приложении должна быть одна
        // очередь A/B. Ручное переключение в этой сессии не перетираем.
        if (!workoutTouched && data.simple) {
          state.workout.place = data.simple.place === "gym" ? "gym" : "home";
          state.workout.plan = data.simple.idx % KM_PLANS.plans[state.workout.place].length;
        }
        migrateWeights();
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
        else if (state.screen === "home" || state.screen === "nutrition") render();
      })
      .catch(function (err) {
        // 401 — приложение открыто вне Telegram или подпись устарела: уходим
        // в локальный режим, он честно об этом скажет на экране
        if (err && err.status === 401) {
          online = false;
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
    haptic("medium");
    render();
  }

  function mealError(err) {
    state.busy = null;
    state.notice = {
      kind: "err",
      text: (err && err.message) || "Не получилось. Попробуй ещё раз."
    };
    if (err && err.data && err.data.photo && state.day) state.day.photo = err.data.photo;
    haptic("heavy");
    render();
  }

  /* ── Экран: анкета первого запуска ──────────────────────────────────────── */
  // Одна страница вместо шести форм в разных разделах: эти же данные раньше
  // приходилось вводить отдельно в «Норме» и в «Тренировке».

  function renderSetup() {
    var p = state.profile;
    return (
      card(
        cardHead("Шесть полей — и всё считается", "Данные остаются на устройстве и в твоём чате с ботом") +
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
            "Низкая — 1–3 тренировки и сидячая работа. Средняя — 3–5. Высокая — 6+ или физическая работа."
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
    haptic("medium");
    go("home");
  }

  function syncProfile() {
    if (!online || !macros()) return;
    KM_API.saveProfile({
      sex: state.profile.sex,
      age: num(state.profile.age),
      heightCm: num(state.profile.heightCm),
      weightKg: num(state.profile.weightKg),
      goal: state.profile.goal,
      activity: state.profile.activity
    }).catch(function () {
      /* норма всё равно посчитана локально — молчим */
    });
  }

  /* ── Экран: сегодня ─────────────────────────────────────────────────────── */

  function renderHome() {
    var m = macros();
    var entries = sortedEntries();
    var advice = KM.weightTrendAdvice(entries, state.profile.goal);
    var last = entries.length ? entries[entries.length - 1] : null;
    var place = state.workout.place;
    var plan = KM_PLANS.plans[place][state.workout.plan] || KM_PLANS.plans[place][0];
    var pr = state.program;

    var eaten = eatenTotals();
    var normCard = m
      ? eaten.count
        ? card(
            cardHead(
              m.kcal - eaten.kcal >= 0 ? "Осталось на сегодня" : "Перебор",
              "Съедено " + eaten.kcal + " из " + m.kcal + " ккал",
              eaten.count + " " + plural(eaten.count, "приём", "приёма", "приёмов")
            ) +
              figure(
                (m.kcal - eaten.kcal >= 0 ? "" : "+") + Math.abs(m.kcal - eaten.kcal),
                " ккал",
                "цель: " + GOAL_WORD[state.profile.goal]
              ) +
              '<div class="bars">' +
              bar(
                "Калории",
                m.kcal - eaten.kcal >= 0 ? "#cba968" : "#d98a8a",
                eaten.kcal + " / " + m.kcal,
                (eaten.kcal * 100) / m.kcal
              ) +
              bar(
                "Белок",
                "#8a7a52",
                eaten.proteinG + " / " + m.proteinG + " г",
                (eaten.proteinG * 100) / m.proteinG
              ) +
              "</div>",
            { gold: true, tap: "nutrition" }
          )
        : card(
            cardHead("Норма на день", "Цель: " + GOAL_WORD[state.profile.goal], "Питание") +
              figure(m.kcal, " ккал", "по твоим данным") +
              '<div class="bars">' +
              bar("Белок", "#cba968", m.proteinG + " г", (m.proteinG * 4 * 100) / m.kcal) +
              bar("Жиры", "#b08d45", m.fatG + " г", (m.fatG * 9 * 100) / m.kcal) +
              bar("Углеводы", "#8a7a52", m.carbsG + " г", (m.carbsG * 4 * 100) / m.kcal) +
              "</div>",
            { gold: true, tap: "nutrition" }
          )
      : card(
          cardHead("Норма на день", "Заполни данные — посчитаю калории и БЖУ") +
            '<p class="lead">Открыть раздел «Питание»</p>',
          { tap: "nutrition" }
        );

    return (
      noticeHtml() +
      normCard +
      programCard() +
      '<div class="grid-2">' +
      metric(
        "Вес",
        last ? last.weightKg + " <span class=\"figure__unit\">кг</span>" : "—",
        last ? "запись " + formatDate(last.date) : "нет записей"
      ) +
      metric(
        "Тренд",
        advice
          ? (advice.rateKgWeek > 0 ? "+" : "") + advice.rateKgWeek + " <span class=\"figure__unit\">кг/нед</span>"
          : "—",
        advice ? "за " + advice.days + " дн." : "нужно 4 взвешивания"
      ) +
      "</div>" +
      '<div class="grid-2">' +
      (function () {
        var w = water();
        return metric(
          "Вода",
          fmtWater(w.ml),
          w.ml >= w.targetMl ? "норма закрыта" : "из " + fmtWater(w.targetMl)
        );
      })() +
      metric(
        "Последний 1ПМ",
        state.lastOrm ? state.lastOrm.oneRm + " <span class=\"figure__unit\">кг</span>" : "—",
        state.lastOrm ? state.lastOrm.weightKg + " кг × " + state.lastOrm.reps : "не считал"
      ) +
      "</div>" +
      '<div class="chips chips--wrap" style="margin-bottom:18px">' +
      [250, 500]
        .map(function (ml) {
          return '<button type="button" class="chip" data-water="' + ml + '">+' + ml + " мл</button>";
        })
        .join("") +
      '<button type="button" class="chip" data-go="profile">Профиль</button>' +
      "</div>" +
      '<div class="grid-2">' +
      metric(
        "Программа",
        modelName(pr.model),
        pr.weeks + " " + plural(pr.weeks, "неделя", "недели", "недель") + " · " + pr.days + " в нед."
      ) +
      metric(
        "Тренировок",
        state.day ? String(state.day.workoutsTotal) : "—",
        state.day ? "записано всего" : "нет связи с ботом"
      ) +
      "</div>" +
      card(
        cardHead(
          "Тренировка · план " + esc(plan.label),
          place === "home" ? "Дома, без инвентаря" : "В зале, гантели и блок",
          plan.items.length + " упр."
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
      (advice && advice.kcalDelta !== 0
        ? '<p class="note"><strong>Тренд против цели.</strong> ' +
          esc(advice.verdict) +
          " Правь норму в «Питании» и держи новую цифру две недели.</p>"
        : '<p class="note note--plain">Калории — Миффлин–Сан-Жеор с коэффициентом активности. ' +
          "1ПМ — среднее трёх формул: Эпли, Бжицки, Ландер. Программы — проценты от максимума " +
          "с округлением до 2.5 кг. Цифры совпадают с ботом.</p>")
    );
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
              : '<div class="btn-stack" style="margin-top:12px"><button class="btn btn--primary" data-action="program-done">Выполнено — записать</button></div>')
          : '<p class="lead">Цикл пройден. Построй новый в разделе «Расчёты».</p>')
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

  function renderMenu() {
    var target = macros();
    var d = KM_MENUS.day(state.menu.id, state.profile.goal, target ? target.kcal : 0);
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
      card(
        cardHead(
          d.title,
          d.personal
            ? "Порции пересчитаны под твою норму " + d.basedOn + " ккал"
            : "Порции под " + d.basedOn + " ккал — задай свои данные в «Норме», пересчитаю точнее",
          GOAL_WORD[state.profile.goal]
        ) +
          figure(d.total.kcal, " ккал", "за день по всем приёмам") +
          '<div class="bars">' +
          bar("Белок", "#cba968", d.total.proteinG + " г", (d.total.proteinG * 4 * 100) / d.total.kcal) +
          bar("Жиры", "#b08d45", d.total.fatG + " г", (d.total.fatG * 9 * 100) / d.total.kcal) +
          bar("Углеводы", "#8a7a52", d.total.carbsG + " г", (d.total.carbsG * 4 * 100) / d.total.kcal) +
          "</div>",
        { gold: true }
      ) +
      (state.notice
        ? state.notice.kind === "ok"
          ? '<p class="note"><strong>Записал.</strong> ' + esc(state.notice.text) + "</p>"
          : errorBox(state.notice.text)
        : "") +
      d.meals.map(function (m) {
        return menuMealHtml(m, logged.indexOf(mealTitle(m)) !== -1);
      }).join("") +
      '<p class="note"><strong>' +
      esc(d.hint) +
      "</strong> Меню — рабочий шаблон, а не догма: меняй продукты на такие же по КБЖУ. " +
      "Кнопка «Съел» пишет приём в дневник — дальше видно, сколько осталось на день.</p>"
    );
  }

  function mealTitle(m) {
    return m.label + " · " + KM_MENUS.titles[state.menu.id];
  }

  function menuMealHtml(m, alreadyLogged) {
    return (
      '<div class="acc"><button class="acc__head" data-acc><span><span class="acc__title">' +
      esc(m.label) +
      '</span><span class="acc__sub">' +
      m.kcal +
      " ккал · Б " +
      m.proteinG +
      " / Ж " +
      m.fatG +
      " / У " +
      m.carbsG +
      '</span></span><span class="acc__sign">+</span></button><div class="acc__body">' +
      '<ul class="bullets">' +
      m.items
        .map(function (i) {
          return "<li>" + esc(i) + "</li>";
        })
        .join("") +
      "</ul>" +
      '<div class="btn-stack" style="margin-top:12px"><button class="btn ' +
      (alreadyLogged ? "btn--outline" : "btn--primary") +
      ' btn--slim" data-action="log-menu" data-mealkey="' +
      esc(m.key) +
      '">' +
      (alreadyLogged ? "Записать ещё раз" : "Съел — записать в дневник") +
      "</button></div></div></div>"
    );
  }

  function logMenuMeal(key) {
    var target = macros();
    var d = KM_MENUS.day(state.menu.id, state.profile.goal, target ? target.kcal : 0);
    var m = d.meals.filter(function (x) {
      return x.key === key;
    })[0];
    if (!m) return;
    saveMeal(
      {
        name: mealTitle(m),
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
          cardHead("Норма не задана", "Заполни данные — покажу, сколько осталось на день") +
            '<div class="btn-stack"><button class="btn btn--primary" data-action="go-norm">Задать норму</button></div>'
        );

    return (
      (state.day ? dayNav() : "") +
      head +
      (state.notice
        ? state.notice.kind === "ok"
          ? '<p class="note"><strong>Записал.</strong> ' + esc(state.notice.text) + "</p>"
          : errorBox(state.notice.text)
        : "") +
      (!isToday
        ? '<p class="note note--plain">Открыт прошлый день — только просмотр. Новые приёмы ' +
          "пишутся в сегодняшний.</p>"
        : addOrBusy(quota)) +
      mealsListCard(meals, isToday) +
      '<p class="note note--plain">Оценка по фото — компоненты определяет модель, ' +
      "калории берутся из справочника продуктов. Ошибка порции легко даёт ±15–20%, " +
      "особенно с маслом и соусами. Итог сверяй по тренду веса в дневнике, а не по одному дню.</p>"
    );
  }

  /* Ввод еды и список приёмов — общие для «Питания» и «Профиля». Одна разметка на два
     экрана: две копии разошлись бы при первой же правке форм. */

  function addOrBusy(quota) {
    if (!state.busy) return addBlock(quota);
    return card(
      '<p class="lead">' +
        (state.busy === "photo" ? "Распознаю блюдо…" : "Считаю…") +
        '</p><p class="muted">Обычно 3–10 секунд.</p>'
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
              '<li><span class="meal__name">' +
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
    var list = state.foods
      .filter(function (f) {
        return !q || f.name.toLowerCase().indexOf(q) !== -1;
      })
      .slice(0, 10);

    if (!list.length) return '<p class="muted">Ничего не нашёл. Добавь текстом или вручную.</p>';

    return (
      '<ul class="log">' +
      list
        .map(function (f) {
          var grams = num(state.foodGrams);
          var g = grams >= 1 && grams <= 3000 ? Math.round(grams) : f.defaultG;
          return (
            '<li><span class="meal__name">' +
            esc(f.name) +
            '<span class="meal__macro">' +
            f.kcal100 +
            " ккал / 100 г</span></span>" +
            '<button class="btn btn--outline btn--slim" data-action="add-food" data-food="' +
            esc(f.name) +
            '" data-grams="' +
            g +
            '">' +
            g +
            " г</button></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function foodForm() {
    loadFoods();
    return (
      '<div style="margin-top:18px">' +
      field(
        "Продукт",
        '<input class="input" type="text" data-path="foodQuery" placeholder="курица, рис, творог" value="' +
          esc(state.foodQuery) +
          '" />',
        "КБЖУ берутся из справочника бота — без модели и без догадок."
      ) +
      field(
        "Граммы",
        numInput("foodGrams", { min: 1, max: 3000, step: 10, placeholder: "пусто = обычная порция" })
      ) +
      '<div id="foodList">' +
      foodListHtml() +
      "</div></div>"
    );
  }

  function addBlock(quota) {
    if (!online) {
      return card(
        cardHead("Фото доступно только из Telegram", "Открой приложение кнопкой в боте") +
          '<p class="lead">Распознавание идёт через сервер бота: ключ модели нельзя ' +
          "держать в приложении. Здесь работает ручной ввод — если КБЖУ написаны на упаковке.</p>" +
          '<div class="btn-stack" style="margin-top:14px">' +
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
            : "Секунду — подгружаю дневник"
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
        cardHead("Анализ фото не подключён", "Нужен GEMINI_API_KEY в переменных бота") +
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
        ? "Осталось " +
          quota.left +
          " " +
          plural(quota.left, "фото", "фото", "фото") +
          " на этой неделе из " +
          quota.limit
        : quota && quota.trial
        ? "Пробный период — фото без ограничений"
        : "Фото без ограничений";

    return card(
      cardHead("Добавить приём пищи", limitLine) +
        '<div class="btn-stack">' +
        // Кнопка, а не <label for>, и открытие через .click() из кода: в WebView
        // Telegram связка «label → input с display:none» часто не срабатывает, причём
        // молча. Атрибута capture нет намеренно — с ним Android уходит сразу в камеру
        // и падает без разрешения, а галерея становится недоступна.
        '<button class="btn btn--primary" data-action="pick-photo">Сфотографировать еду</button>' +
        '<input id="photoInput" type="file" accept="image/*" ' +
        'style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" />' +
        '<button class="btn btn--outline" data-action="add-food-form">Из справочника</button>' +
        '<button class="btn btn--outline" data-action="add-text-form">Добавить текстом</button>' +
        '<button class="btn btn--outline" data-action="add-manual-form">Ввести вручную</button>' +
        "</div>" +
        (state.addMode === "food" ? foodForm() : "") +
        (state.addMode === "text" ? textForm() : "") +
        (state.addMode === "manual" ? manualForm() : "") +
        '<p class="note note--plain">Если выбор фото не открывается — это ограничение ' +
        "встроенного браузера Telegram, а не сервера: посчитай тот же приём кнопкой " +
        "«Добавить текстом», результат одинаковый.</p>"
    );
  }

  function textForm() {
    return (
      '<div style="margin-top:18px">' +
      field(
        "Что съел",
        '<input class="input" type="text" data-path="mealText" placeholder="лосось 150 г, рис 200 г, салат" value="' +
          esc(state.mealText) +
          '" />',
        "Продукты и граммы. Сначала ищу в справочнике, если не нашёл — разбираю моделью."
      ) +
      '<button class="btn btn--primary" data-action="add-text">Посчитать и записать</button></div>'
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
            "Низкая — 1–3 тренировки и сидячая работа. Средняя — 3–5. Высокая — 6+ или физическая работа."
          ) +
          field(
            "Цель",
            chips("goal", p.goal, [
              ["bulk", "Набор"],
              ["cut", "Сушка"],
              ["maint", "Поддержание"]
            ])
          ) +
          '<div class="btn-stack"><button class="btn btn--primary" data-action="calc-nutrition">Рассчитать</button></div>'
      ) +
      '<div id="result">' +
      (state.result === "nutrition" ? nutritionResult() : "") +
      "</div>"
    );
  }

  /**
   * Вес живёт в двух местах: поле расчёта и запись в дневнике. Плитка «Вес» на
   * «Сегодня» показывает запись, поэтому расхождение надо называть вслух.
   */
  function weightHint() {
    var last = sortedEntries().slice(-1)[0];
    if (!last) return "Взвешивания пиши в «Дневник» — из них считается тренд.";
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
      '<p class="note"><strong>Формула — стартовая точка.</strong> Через 2–3 недели сверь ' +
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
    "531": "Вендлер: рабочий максимум — 90% от 1ПМ, цикл 4 недели, последний подход на максимум повторений. Между циклами максимум растёт на 2.5%.",
    gzclp: "Чередование тяжёлого дня (5×3) и объёмного (3×10) с ростом процентов по неделям. Последняя неделя — разгрузка.",
    dup: "Ежедневная волна: у каждого дня своя задача — сила, мощность, объём.",
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
        '<p class="field__hint">Формулы работают до 15 повторений. Чем больше повторов — тем грубее оценка.</p>' +
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
          " повторений — расчёт сделан по 15, дальше формулы врут. Точнее всего подход на 3–8 повторений.</p>"
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
            ? "5/3/1 считается циклами по 4 недели — срок округлится до целых циклов."
            : "Последняя неделя — разгрузка."
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
        ? "<strong>РМ — рабочий максимум, 90% от 1ПМ:</strong> " +
          lifts
            .map(function (l) {
              // Без округления: проценты считаются от точного РМ, округляется только вес на штанге
              return esc(l.name) + " " + Math.round(l.oneRmKg * 0.9 * 10) / 10 + " кг";
            })
            .join(", ") +
          ". «+» у последнего подхода — максимум повторений с этим весом. "
        : pr.model === "gzclp"
        ? "«+» у последнего подхода — максимум повторений с этим весом. "
        : "Вес считается от 1ПМ с поправкой на этап цикла, поэтому в первых неделях он ниже номинальной интенсивности — это запас на разгон. ") +
      "Разгрузочная неделя — не пропуск, а часть плана: снимает накопленную усталость перед новым циклом.</p>" +
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
            "Программа активна: неделя 1, день 1. Дальше её ведёт бот — отмечай тренировки на «Сегодня»."
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
    state.busy = "workout";
    state.notice = null;
    render();
    KM_API.workoutDone(state.workout.place)
      .then(function (data) {
        state.day = data;
        state.busy = null;
        // Дальше очередь A/B снова ведёт бот
        workoutTouched = false;
        state.workout.plan = data.simple.idx % KM_PLANS.plans[state.workout.place].length;
        state.notice = {
          kind: "ok",
          text:
            "Тренировка " +
            data.done +
            " записана — всего " +
            data.workoutsTotal +
            ". Следующая: план " +
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

  function renderWorkout() {
    var wk = state.workout;
    var list = KM_PLANS.plans[wk.place];
    var plan = list[wk.plan] || list[0];

    return (
      chips("w_place", wk.place, [["home", "Дома"], ["gym", "В зале"]]) +
      chips(
        "w_plan",
        wk.plan,
        list.map(function (p, i) {
          return [i, "План " + p.label];
        })
      ) +
      card(
        cardHead(
          wk.place === "home" ? "Дома · без инвентаря" : "В зале · гантели и блок",
          plan.items.length +
            " " +
            plural(plan.items.length, "упражнение", "упражнения", "упражнений") +
            ". Чередуй A и B через день отдыха. Тапни упражнение — откроется техника.",
          "План " + plan.label
        ),
        { gold: true }
      ) +
      noticeHtml() +
      plan.items.map(exerciseHtml).join("") +
      (state.day
        ? state.busy === "workout"
          ? card('<p class="lead">Записываю тренировку…</p>')
          : '<div class="btn-stack"><button class="btn btn--primary" data-action="workout-done">Выполнил — записать</button></div>' +
            '<p class="note note--plain">Запись идёт в тот же дневник, что кнопка в чате: ' +
            "всего тренировок — " +
            (state.day.workoutsTotal || 0) +
            ". Очередь планов A/B бот ведёт сам.</p>"
        : '<p class="note note--plain">Отметка тренировки пишется в дневник бота — работает, ' +
          "когда приложение открыто из Telegram.</p>") +
      '<p class="note">' +
      esc(wk.place === "home" ? KM_PLANS.homeRule : KM_PLANS.weightRule) +
      "</p>"
    );
  }

  function exerciseHtml(e) {
    return (
      '<div class="acc"><button class="acc__head" data-acc><span><span class="acc__title">' +
      esc(e.name) +
      '</span><span class="acc__sub">' +
      esc(e.scheme) +
      " · " +
      esc(e.short) +
      '</span></span><span class="acc__sign">+</span></button><div class="acc__body">' +
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
      '<div class="btn-stack" style="margin-top:12px"><button class="btn btn--outline btn--slim" data-link="' +
      esc(e.video) +
      '">Техника на видео</button></div>' +
      "</div></div>"
    );
  }

  /* ── Экран: дневник ─────────────────────────────────────────────────────── */

  function renderDiary() {
    var entries = sortedEntries();
    var advice = KM.weightTrendAdvice(entries, state.profile.goal);

    return (
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
            cardHead("Тренд", "Цель: " + GOAL_WORD[state.profile.goal], advice.days + " дн.") +
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
            cardHead("Тренд пока не считается", "Нужно 4 взвешивания за 28 дней с разбросом от 10 дней") +
              '<p class="lead">Дневные колебания воды дают ±1 кг — по одному взвешиванию решение ' +
              "принимать нельзя. Наберётся история — покажу скорость и скажу, что делать с калориями.</p>"
          )) +
      (entries.length >= 2
        ? card(cardHead("Динамика", "Последние " + Math.min(entries.length, 16) + " записей") + weightChart(entries))
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
        : "")
    );
  }

  /* ── Экран: профиль ─────────────────────────────────────────────────────── */

  var SEX_WORD = { m: "Мужчина", f: "Женщина" };
  var ACTIVITY_WORD = { low: "Низкая", mid: "Средняя", high: "Высокая" };

  /**
   * Вода за сегодня. С сервером — общая цифра с ботом; без сервера — только на
   * устройстве. Ориентир: 35 мл на кг, от свежего веса из дневника, а не из анкеты.
   */
  function water() {
    if (state.day && state.day.water) return state.day.water;
    var last = sortedEntries().slice(-1)[0];
    var kg = last ? last.weightKg : num(state.profile.weightKg) || 0;
    return {
      ml: state.localWater[today()] || 0,
      targetMl: Math.round(((kg > 0 ? kg : 80) * 35) / 100) * 100,
      basedOnKg: kg || null,
      local: true
    };
  }

  function fmtWater(ml) {
    return ml >= 1000 ? (Math.round(ml / 100) / 10).toFixed(1).replace(".", ",") + " л" : ml + " мл";
  }

  function waterCard() {
    var w = water();
    var left = w.targetMl - w.ml;
    return card(
      cardHead(
        left > 0 ? "Вода: осталось " + fmtWater(left) : "Вода: норма закрыта",
        w.basedOnKg
          ? "Ориентир " + fmtWater(w.targetMl) + " — 35 мл на кг при весе " + w.basedOnKg + " кг"
          : "Ориентир " + fmtWater(w.targetMl) + " — задай вес, посчитаю точнее",
        w.local ? "на устройстве" : null
      ) +
        figure(fmtWater(w.ml).replace(/ (мл|л)$/, ""), w.ml >= 1000 ? " л" : " мл", "выпито сегодня") +
        '<div class="bars">' +
        bar(
          "Норма дня",
          left > 0 ? "#6fa8c7" : "#cba968",
          fmtWater(w.ml) + " / " + fmtWater(w.targetMl),
          (w.ml * 100) / w.targetMl
        ) +
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
        '<p class="note note--plain">Цифра — ориентир для тренирующегося человека, а не ' +
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
    var last = entries.length ? entries[entries.length - 1] : null;
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
          cardHead("Норма не задана", "Заполни данные — покажу, сколько осталось на день") +
            '<div class="btn-stack"><button class="btn btn--primary" data-action="edit-profile">Задать норму</button></div>'
        );

    return (
      noticeHtml() +
      card(
        cardHead(
          name ? esc(name) : "Личный профиль",
          SEX_WORD[p.sex] + " · " + num(p.age) + " лет · " + num(p.heightCm) + " см",
          GOAL_WORD[p.goal]
        ) +
          '<div class="grid-2">' +
          metric("Вес", last ? last.weightKg + ' <span class="figure__unit">кг</span>' : "—", last ? "запись " + formatDate(last.date) : "нет записей") +
          metric(
            "Тренд",
            advice ? (advice.rateKgWeek > 0 ? "+" : "") + advice.rateKgWeek + ' <span class="figure__unit">кг/нед</span>' : "—",
            advice ? "за " + advice.days + " дн." : "нужно 4 взвешивания"
          ) +
          "</div>" +
          '<div class="grid-2">' +
          metric("Активность", ACTIVITY_WORD[p.activity], "коэффициент в норме калорий") +
          metric(
            "Тренировок",
            workouts === null ? "—" : String(workouts),
            workouts === null ? "считается в чате" : "записано всего"
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
      waterCard() +
      renderDiary()
    );
  }

  function addWater(ml) {
    haptic("light");
    if (state.day) {
      KM_API.addWater(ml, state.day.date)
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
    state.localWater[key] = Math.max(0, (state.localWater[key] || 0) + ml);
    persist();
    render();
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
    ["calc", "Расчёты", "Расчёты"],
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

  function render() {
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
  }

  function go(screen) {
    if (!SCREENS[screen]) return;
    state.screen = screen;
    state.result = null;
    state.notice = null;
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

    var chip = t.closest(".chip");
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
        state.notice = null;
        haptic("light");
        return render();
      case "reload-day":
        state.linkError = null;
        state.notice = null;
        haptic("light");
        render();
        return loadDay(false);
      case "pick-photo": {
        var pick = document.getElementById("photoInput");
        if (!pick) return;
        pick.value = "";
        haptic("light");
        pick.click();
        return;
      }
      case "add-food":
        return addMealFood(action.getAttribute("data-food"), Number(action.getAttribute("data-grams")));
      case "day-prev":
        return openDay(shiftDate(viewDate(), -1));
      case "day-next":
        return openDay(shiftDate(viewDate(), 1));
      case "workout-done":
        return markWorkoutDone();
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
    });
  });

  // Слушаем на document, а не на #view: событие change от файлового поля в некоторых
  // WebView не всплывает до промежуточного контейнера
  document.addEventListener("change", function (ev) {
    if (!ev.target || ev.target.id !== "photoInput") return;
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = ""; // чтобы повторный выбор того же файла снова дал событие
    if (file) addMealPhoto(file);
  });

  function onSeg(btn) {
    var group = btn.parentElement;
    var name = group.getAttribute("data-seg");
    var value = btn.getAttribute("data-value");
    haptic("light");

    switch (name) {
      case "sex":
      case "activity":
      case "goal":
        state.profile[name] = value;
        break;
      case "calc_tab":
        state.calcTab = value;
        state.result = null;
        return render();
      case "nut_tab":
        state.nutTab = value;
        state.notice = null;
        state.addMode = null;
        return render();
      case "menu_id":
        state.menu.id = value;
        state.notice = null;
        persist();
        return render();
      case "s_place":
        state.workout.place = value;
        state.workout.plan = 0;
        break;
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
        workoutTouched = true;
        persist();
        // Место тренировок общее с ботом: в чате должен открываться тот же зал/дом
        if (state.day) {
          KM_API.savePlace(value)
            .then(function (data) {
              state.day = data;
            })
            .catch(function () {
              /* не критично: план на экране уже переключён */
            });
        }
        return render();
      case "w_plan":
        state.workout.plan = Number(value);
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
    Array.prototype.forEach.call(group.querySelectorAll(".chip"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-value") === String(value)));
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
    KM_API.text(text)
      .then(function (data) {
        applyMealResult(data, data.meal.name + " — " + data.meal.kcal + " ккал.");
      })
      .catch(mealError);
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
          applyMealResult(data, meal.name + " — " + meal.kcal + " ккал.");
        })
        .catch(mealError);
      return;
    }

    state.localMeals.push(
      Object.assign({ id: "l" + Date.now().toString(36), date: today() }, meal)
    );
    state.addMode = null;
    state.manual = { name: "", kcal: "", proteinG: "", fatG: "", carbsG: "" };
    state.notice = { kind: "ok", text: meal.name + " — " + meal.kcal + " ккал." };
    persist();
    haptic("medium");
    render();
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
        applyMealResult(data, data.meal.name + " — " + data.meal.kcal + " ккал.");
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

  function addMealPhoto(file) {
    state.busy = "photo";
    state.notice = null;
    render();
    KM_API.photo(file)
      .then(function (data) {
        applyMealResult(
          data,
          data.meal.name + " — " + data.meal.kcal + " ккал" + (data.note ? ". " + data.note : ".")
        );
      })
      .catch(mealError);
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

  if (tg) {
    tg.ready();
    tg.expand();
    try {
      if (tg.setHeaderColor) tg.setHeaderColor("#0b0b0c");
      if (tg.setBackgroundColor) tg.setBackgroundColor("#0b0b0c");
    } catch (e) {
      /* старый клиент */
    }
    if (tg.BackButton) {
      tg.BackButton.onClick(function () {
        if (state.screen === "home") tg.close();
        else go("home");
      });
      tg.BackButton.hide();
    }
  }

  render();
  loadDay(true);
})();
