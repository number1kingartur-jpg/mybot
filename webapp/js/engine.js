/* KINGMODE — расчётное ядро.
   Порт формул из mybot/src: calc/orm.ts, nutrition.ts, calc/periodization.ts,
   calc/templates.ts. Цифры должны совпадать с ботом — при правках менять и там и здесь. */

var KM = (function () {
  "use strict";

  function round2_5(n) {
    return Math.round(n / 2.5) * 2.5;
  }

  /** Слово при числе. Сокращение «дн.» экономит три знака и звучит как справка. */
  function plural(n, one, few, many) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* ── 1RM ────────────────────────────────────────────────────────────────── */
  // Формулы валидны до ~15 повторений: выше Brzycki делит на ноль при 37.

  function calcOneRm(weightKg, reps) {
    var r = Math.max(1, Math.min(reps, 15));
    if (r === 1) return weightKg;
    var epley = weightKg * (1 + r / 30);
    var brzycki = weightKg * (36 / (37 - r));
    var lander = (100 * weightKg) / (101.3 - 2.67123 * r);
    return Math.round(((epley + brzycki + lander) / 3) * 10) / 10;
  }

  var PCT_REPS = [
    [100, 1], [97, 1], [95, 2], [90, 3], [85, 5],
    [80, 6], [75, 8], [70, 10], [65, 12], [60, 15]
  ];

  function pctTable(oneRm) {
    return PCT_REPS.map(function (row) {
      return { pct: row[0], weightKg: round2_5((oneRm * row[0]) / 100), reps: row[1] };
    });
  }

  /* ── Питание ────────────────────────────────────────────────────────────── */

  var ACTIVITY_FACTOR = {
    low: 1.375,  // 1–3 тренировки в неделю, сидячая работа
    mid: 1.55,   // 3–5 тренировок
    high: 1.725  // 6+ тренировок или физическая работа
  };

  var GOAL_CFG = {
    bulk: { kcalMul: 1.12, proteinPerKg: 1.8 },
    cut: { kcalMul: 0.8, proteinPerKg: 2.2 },
    maint: { kcalMul: 1.0, proteinPerKg: 1.8 }
  };

  /** Миффлин – Сан-Жеор + макросы: белок г/кг по цели, жиры 0.9 г/кг, остаток — углеводы. */
  function calcMacros(p) {
    var w = p.weightKg;
    var bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + (p.sex === "m" ? 5 : -161);
    var tdee = bmr * ACTIVITY_FACTOR[p.activity];
    var cfg = GOAL_CFG[p.goal];
    var kcal = Math.round(tdee * cfg.kcalMul);

    var proteinG = Math.round(w * cfg.proteinPerKg);
    var fatG = Math.round(w * 0.9);
    var carbsKcal = kcal - proteinG * 4 - fatG * 9;
    var carbsG = Math.max(0, Math.round(carbsKcal / 4));

    return {
      kcal: kcal,
      proteinG: proteinG,
      fatG: fatG,
      carbsG: carbsG,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee)
    };
  }

  /** Разбивка дневной нормы по приёмам пищи. Доли, а не жёсткие граммы. */
  var MEAL_SPLIT = [
    { name: "Завтрак", share: 0.25 },
    { name: "Обед", share: 0.35 },
    { name: "Перекус", share: 0.15 },
    { name: "Ужин", share: 0.25 }
  ];

  function mealSplit(macros) {
    return MEAL_SPLIT.map(function (m) {
      return {
        name: m.name,
        kcal: Math.round(macros.kcal * m.share),
        proteinG: Math.round(macros.proteinG * m.share),
        fatG: Math.round(macros.fatG * m.share),
        carbsG: Math.round(macros.carbsG * m.share)
      };
    });
  }

  /* ── Тренд веса ─────────────────────────────────────────────────────────── */
  // Формула даёт стартовую точку, дальше рулит реальный тренд.
  // Целевые скорости: набор +0.2…+0.5 кг/нед, сушка −0.3…−0.8, поддержание ±0.25.

  function weightTrendAdvice(entries, goal) {
    var cutoff = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
    var recent = entries
      .filter(function (e) {
        return e.date >= cutoff;
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      });
    if (recent.length < 4) return null;

    var first = recent[0];
    var last = recent[recent.length - 1];
    var days = Math.round(
      (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000
    );
    if (days < 10) return null; // слишком короткий период — тренд ненадёжен

    var rate = Math.round(((last.weightKg - first.weightKg) / days) * 7 * 100) / 100;

    var kcalDelta = 0;
    var verdict;
    if (goal === "bulk") {
      if (rate < 0.15) {
        kcalDelta = 150;
        verdict = "вес почти не растёт, добавь калорий";
      } else if (rate > 0.6) {
        kcalDelta = -150;
        verdict = "вес растёт слишком быстро и берёт лишний жир, убавь";
      } else verdict = "скорость набора в норме, ничего не меняй";
    } else if (goal === "cut") {
      if (rate > -0.2) {
        kcalDelta = -200;
        verdict = "вес не снижается, урежь калории";
      } else if (rate < -1.0) {
        kcalDelta = 150;
        verdict = "похудение идёт слишком быстро и рискует мышцами, добавь";
      } else verdict = "скорость снижения в норме, продолжай";
    } else {
      if (rate > 0.25) {
        kcalDelta = -150;
        verdict = "вес ползёт вверх, слегка убавь";
      } else if (rate < -0.25) {
        kcalDelta = 150;
        verdict = "вес уходит вниз, слегка добавь";
      } else verdict = "вес держится, цель выполняется";
    }

    var sign = rate > 0 ? "+" : "";
    var deltaStr =
      kcalDelta === 0 ? "" : " (" + (kcalDelta > 0 ? "+" : "") + kcalDelta + " ккал/день)";
    return {
      rateKgWeek: rate,
      days: days,
      kcalDelta: kcalDelta,
      // verdict — без цифр, для экранов, где скорость уже показана отдельно
      verdict: verdict.charAt(0).toUpperCase() + verdict.slice(1) + deltaStr + ".",
      text:
        "Тренд веса: " +
        sign +
        rate +
        " кг/нед за " +
        days +
        " " +
        plural(days, "день", "дня", "дней") +
        ". " +
        verdict.charAt(0).toUpperCase() +
        verdict.slice(1) +
        deltaStr +
        "."
    };
  }

  /* ── Программы ──────────────────────────────────────────────────────────── */

  var DUP_PATTERNS = {
    strength: [
      { focus: "Сила", intensity: 85, sets: 5, reps: 3, rpe: 8 },
      { focus: "Мощность", intensity: 70, sets: 5, reps: 5, rpe: 7 },
      { focus: "Объём", intensity: 75, sets: 4, reps: 5, rpe: 7 }
    ],
    hypertrophy: [
      { focus: "Гипертрофия", intensity: 70, sets: 4, reps: 10, rpe: 8 },
      { focus: "Объём", intensity: 65, sets: 5, reps: 12, rpe: 7 },
      { focus: "Насос", intensity: 60, sets: 4, reps: 15, rpe: 8 }
    ],
    strength_hypertrophy: [
      { focus: "Сила", intensity: 82, sets: 4, reps: 4, rpe: 8 },
      { focus: "Гипертрофия", intensity: 72, sets: 4, reps: 8, rpe: 8 },
      { focus: "Объём", intensity: 67, sets: 4, reps: 10, rpe: 7 }
    ]
  };

  function calculatePeriodization(input) {
    var lifts = input.lifts;
    var weeks = input.weeks;
    var model = input.model;
    var goal = input.goal;
    var daysPerWeek = lifts.length;
    var deloadWeek = weeks;
    var peakWeek = weeks - 1;
    var weekPlans = [];

    for (var w = 1; w <= weeks; w++) {
      var isDeload = w === deloadWeek;
      var isPeak = w === peakWeek;
      var progressFactor = isDeload ? 0.6 : isPeak ? 1.0 : 0.7 + (w / weeks) * 0.25;
      var sessions = [];

      for (var d = 1; d <= daysPerWeek; d++) {
        var lift = lifts[d - 1];
        var base = DUP_PATTERNS[goal][(d - 1) % DUP_PATTERNS[goal].length];

        if (model === "linear") {
          var linearIntensity = 70 + (w / weeks) * 20;
          var linearReps =
            goal === "hypertrophy"
              ? Math.max(6, 12 - Math.floor((w / weeks) * 5))
              : Math.max(1, 5 - Math.floor((w / weeks) * 3));
          base = {
            focus:
              goal === "strength"
                ? "Прогрессия"
                : goal === "hypertrophy"
                ? "Гипертрофия"
                : "Сила/масса",
            intensity: Math.round(linearIntensity),
            sets: 4,
            reps: isDeload ? linearReps + 2 : linearReps,
            rpe: isDeload ? 6 : 8
          };
        }

        if (model === "wave") {
          var waveBase = [75, 80, 85][(d - 1) % 3];
          var waveOffset = (w % 3) * 3;
          base = {
            focus: ["Лёгкий", "Средний", "Тяжёлый"][(d - 1) % 3],
            intensity: isDeload
              ? waveBase - 15
              : isPeak
              ? waveBase + waveOffset + 5
              : waveBase + waveOffset,
            sets: isDeload ? 3 : 4,
            reps: isDeload ? 8 : [5, 4, 3][(d - 1) % 3],
            rpe: isDeload ? 6 : [7, 8, 9][(d - 1) % 3]
          };
        }

        var adjustedIntensity = isDeload ? Math.min(base.intensity, 65) : base.intensity;
        var weightKg = round2_5(lift.oneRmKg * (adjustedIntensity / 100) * progressFactor);

        sessions.push({
          day: d,
          focus: lift.name + " · " + base.focus,
          intensity: adjustedIntensity,
          sets: isDeload ? Math.max(2, base.sets - 1) : base.sets,
          reps: base.reps,
          weightKg: weightKg,
          rpe: base.rpe
        });
      }
      weekPlans.push({ week: w, sessions: sessions, deload: isDeload });
    }

    return { weeks: weekPlans, peakWeek: peakWeek, deloadWeek: deloadWeek };
  }

  // 5/3/1 (Jim Wendler). TM = 90% 1RM, 4-недельный цикл, день = отдельное движение.
  var W531 = [
    { label: "Неделя пятёрок", sets: [[65, 5], [75, 5], [85, 5]], top: [85, 5], rpe: 8, deload: false },
    { label: "Неделя троек", sets: [[70, 3], [80, 3], [90, 3]], top: [90, 3], rpe: 9, deload: false },
    { label: "Пиковая неделя", sets: [[75, 5], [85, 3], [95, 1]], top: [95, 1], rpe: 9, deload: false },
    { label: "Разгрузка", sets: [[40, 5], [50, 5], [60, 5]], top: [60, 5], rpe: 5, deload: true }
  ];

  function calc531(input) {
    var lifts = input.lifts;
    var cycles = Math.max(1, Math.round(input.weeks / 4));
    var totalWeeks = cycles * 4;
    var out = [];

    for (var wi = 0; wi < totalWeeks; wi++) {
      var cycleIdx = Math.floor(wi / 4);
      var phase = W531[wi % 4];
      var sessions = [];

      for (var d = 1; d <= lifts.length; d++) {
        var lift = lifts[d - 1];
        // TM растёт ~2.5% за цикл — прогрессия Вендлера
        var tm = lift.oneRmKg * 0.9 * (1 + cycleIdx * 0.025);

        var detail = phase.sets
          .map(function (s, i) {
            var amrap = i === phase.sets.length - 1 && !phase.deload ? "+" : "";
            return round2_5((tm * s[0]) / 100) + "кг × " + s[1] + amrap + " (" + s[0] + "%)";
          })
          .join("\n");

        sessions.push({
          day: d,
          focus: lift.name + " · " + phase.label,
          intensity: phase.top[0],
          sets: phase.sets.length,
          reps: phase.top[1],
          weightKg: round2_5((tm * phase.top[0]) / 100),
          rpe: phase.rpe,
          detail: detail
        });
      }
      out.push({ week: wi + 1, sessions: sessions, deload: phase.deload });
    }

    return { weeks: out, peakWeek: totalWeeks - 1, deloadWeek: totalWeeks };
  }

  // GZCLP — упрощённая недельная адаптация. T1: сила 5×3, T2: объём 3×10, по дням.
  function calcGzclp(input) {
    var lifts = input.lifts;
    var weeks = input.weeks;
    var deloadWeek = weeks;
    var out = [];

    for (var w = 1; w <= weeks; w++) {
      var isDeload = w === deloadWeek;
      var sessions = [];

      for (var d = 1; d <= lifts.length; d++) {
        var lift = lifts[d - 1];
        var isT1Day = d % 2 === 1;

        if (isT1Day) {
          var pct1 = isDeload ? 70 : Math.min(92, 82 + (w - 1) * 2);
          var weight1 = round2_5((lift.oneRmKg * pct1) / 100);
          sessions.push({
            day: d,
            focus: lift.name + " · тяжёлый день (сила)",
            intensity: pct1,
            sets: 5,
            reps: 3,
            weightKg: weight1,
            rpe: isDeload ? 6 : 8,
            detail: weight1 + "кг × 5 подходов по 3" + (isDeload ? "" : "+") + " (" + pct1 + "%)"
          });
        } else {
          var pct2 = isDeload ? 55 : Math.min(75, 62 + (w - 1) * 2);
          var weight2 = round2_5((lift.oneRmKg * pct2) / 100);
          sessions.push({
            day: d,
            focus: lift.name + " · объёмный день",
            intensity: pct2,
            sets: 3,
            reps: 10,
            weightKg: weight2,
            rpe: isDeload ? 6 : 8,
            detail: weight2 + "кг × 3 подхода по 10 (" + pct2 + "%)"
          });
        }
      }
      out.push({ week: w, sessions: sessions, deload: isDeload });
    }

    return { weeks: out, peakWeek: weeks - 1, deloadWeek: deloadWeek };
  }

  function buildProgram(input) {
    if (input.model === "531") return calc531(input);
    if (input.model === "gzclp") return calcGzclp(input);
    return calculatePeriodization(input);
  }

  /**
   * Маршрут дня: четыре пункта, которые надо закрыть.
   * Еда: 40% нормы, иначе один приём если нормы нет.
   * Вес: не считаем запись из анкеты и единственную запись, равную весу в профиле.
   */
  function daysBetween(from, to) {
    var a = new Date(from + "T00:00:00");
    var b = new Date(to + "T00:00:00");
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function weightOpen(input) {
    var last = input.lastWeight;
    if (!last || !last.fromDiary || !last.date) return true;
    if (last.source === "profile") return true;
    if (
      input.weightCount === 1 &&
      input.profileKg &&
      Math.abs(last.weightKg - input.profileKg) < 0.05
    ) {
      return true;
    }
    return daysBetween(last.date, input.today) > 2;
  }

  var KCAL_PER_KG = 7700;

  function estimateExpenditure(meals, weights, formulaTdee) {
    var cutoff = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
    var byDay = {};
    var i;
    for (i = 0; i < meals.length; i++) {
      if (meals[i].date < cutoff) continue;
      byDay[meals[i].date] = (byDay[meals[i].date] || 0) + meals[i].kcal;
    }
    var daysFilled = Object.keys(byDay);
    if (daysFilled.length < 8) return null;
    var w = weights
      .filter(function (e) {
        return e.date >= cutoff;
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      });
    if (w.length < 4) return null;
    var span = Math.round(
      (new Date(w[w.length - 1].date).getTime() - new Date(w[0].date).getTime()) / 86400000
    );
    if (span < 10) return null;
    var sum = 0;
    for (i = 0; i < daysFilled.length; i++) sum += byDay[daysFilled[i]];
    var intakeAvg = sum / daysFilled.length;
    var rate = ((w[w.length - 1].weightKg - w[0].weightKg) / span) * 7;
    var raw = Math.round(intakeAvg - (rate / 7) * KCAL_PER_KG);
    if (raw < 1200 || raw > 5000) return null;
    var tdee = Math.max(formulaTdee - 400, Math.min(formulaTdee + 400, raw));
    return {
      tdee: tdee,
      days: span,
      intakeAvg: Math.round(intakeAvg),
      rateKgWeek: Math.round(rate * 100) / 100
    };
  }

  function applyKcalDelta(base, delta) {
    var kcal = Math.max(1200, Math.round(base.kcal + delta));
    var carbsKcal = kcal - base.proteinG * 4 - base.fatG * 9;
    return {
      kcal: kcal,
      proteinG: base.proteinG,
      fatG: base.fatG,
      carbsG: Math.max(0, Math.round(carbsKcal / 4)),
      bmr: base.bmr,
      tdee: base.tdee
    };
  }

  function adaptiveTarget(profile, meals, weights) {
    var base = calcMacros(profile);
    var exp = estimateExpenditure(meals || [], weights || [], base.tdee);
    if (exp) {
      var cfg = GOAL_CFG[profile.goal] || GOAL_CFG.maint;
      var kcal = Math.max(1200, Math.round(exp.tdee * cfg.kcalMul));
      var carbsKcal = kcal - base.proteinG * 4 - base.fatG * 9;
      var sign = exp.rateKgWeek > 0 ? "+" : "";
      return {
        kcal: kcal,
        proteinG: base.proteinG,
        fatG: base.fatG,
        carbsG: Math.max(0, Math.round(carbsKcal / 4)),
        bmr: base.bmr,
        tdee: exp.tdee,
        formulaKcal: base.kcal,
        kcalDelta: kcal - base.kcal,
        source: "intake",
        note:
          "Норма от фактического расхода " +
          exp.tdee +
          " ккал. Ел в среднем " +
          exp.intakeAvg +
          ", вес " +
          sign +
          exp.rateKgWeek +
          " кг/нед за " +
          exp.days +
          " дней."
      };
    }
    var advice = weightTrendAdvice(weights || [], profile.goal);
    if (advice && advice.kcalDelta) {
      var next = applyKcalDelta(base, advice.kcalDelta);
      next.formulaKcal = base.kcal;
      next.kcalDelta = advice.kcalDelta;
      next.source = "trend";
      next.note = advice.text;
      return next;
    }
    return {
      kcal: base.kcal,
      proteinG: base.proteinG,
      fatG: base.fatG,
      carbsG: base.carbsG,
      bmr: base.bmr,
      tdee: base.tdee,
      formulaKcal: base.kcal,
      kcalDelta: 0,
      source: "formula",
      note: "Норма из формулы. Когда наберутся вес и дневник, цифра станет от факта."
    };
  }

  function dayRoute(input) {
    var target = input.targetKcal || 0;
    var foodOn = target > 0 ? input.eatenKcal >= target * 0.4 : input.eatenCount >= 1;
    var waterOn = input.waterTargetMl > 0 && input.waterMl >= input.waterTargetMl;
    var moveOn = Boolean(input.trainedToday || input.restToday);
    var massOn = !weightOpen(input);
    var done = (foodOn ? 1 : 0) + (waterOn ? 1 : 0) + (moveOn ? 1 : 0) + (massOn ? 1 : 0);
    return {
      foodOn: foodOn,
      waterOn: waterOn,
      moveOn: moveOn,
      weightOn: massOn,
      done: done,
      total: 4,
      closed: done === 4
    };
  }

  return {
    round2_5: round2_5,
    calcOneRm: calcOneRm,
    pctTable: pctTable,
    calcMacros: calcMacros,
    mealSplit: mealSplit,
    weightTrendAdvice: weightTrendAdvice,
    estimateExpenditure: estimateExpenditure,
    applyKcalDelta: applyKcalDelta,
    adaptiveTarget: adaptiveTarget,
    buildProgram: buildProgram,
    dayRoute: dayRoute,
    ACTIVITY_FACTOR: ACTIVITY_FACTOR,
    GOAL_CFG: GOAL_CFG
  };
})();
