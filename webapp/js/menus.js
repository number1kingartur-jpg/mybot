/* Готовые меню на день — порт src/meals.ts.
   Состав и замены один в один с ботом, паритет держит scripts/check-menus.mjs.

   Позиция меню — это ссылка на продукт справочника плюс вес, а не строка текста.
   Из этого следует всё остальное: у позиции есть картинка (слаг считается из
   названия), КБЖУ берётся из справочника и складывается в приём и в день, а к
   каждой позиции лежат три замены такой же калорийности. Раньше состав был
   текстом, а КБЖУ приёма — отдельным числом рядом, и числа с составом не
   сходились: у русского завтрака стояло 520 ккал при составе на ~660. */

window.KM_MENUS = (function () {
  "use strict";

  var GOAL_KCAL = { cut: 1600, maint: 2200, bulk: 2800 };

  var KEYS = ["breakfast", "lunch", "snack", "dinner"];

  var LABELS = {
    breakfast: "Завтрак",
    lunch: "Обед",
    snack: "Перекус",
    dinner: "Ужин"
  };

  var GOAL_TIP = {
    cut: "Резать проще всего крупы и масло, овощи и белок оставляй.",
    maint: "Состав держи как есть, следи за стабильностью веса.",
    bulk: "Добавляй объём рисом, гречкой и белком в обед и ужин."
  };

  /* Продукты меню: n = [ккал, белок, жиры, углеводы] на 100 г, def — обычная
     порция из справочника (от неё считаются границы замены), piece — вес одной
     меры, ml — показывать в миллилитрах (для напитков считаем 1 мл = 1 г).
     Числа обязаны совпадать со справочником бота, это проверяет сборка. */
  var FOOD = {
    "Овсянка на молоке": { n: [105, 3.5, 3.5, 15], def: 250 },
    "Гречка отварная": { n: [132, 4.5, 1.6, 25], def: 180 },
    "Рис отварной": { n: [130, 2.7, 0.3, 28], def: 180 },
    "Паста отварная": { n: [131, 5, 1.1, 25], def: 180 },
    "Картофель отварной": { n: [85, 2, 0.4, 17], def: 200 },
    Хлеб: { n: [265, 9, 3, 49], def: 60, piece: 30 },
    Банан: { n: [89, 1.1, 0.3, 23], def: 120, piece: 120 },
    Яблоко: { n: [52, 0.3, 0.2, 14], def: 180, piece: 180 },
    Мёд: { n: [320, 0.3, 0, 80], def: 20, piece: 7, unit: "ч.л." },
    Шоколад: { n: [550, 6, 32, 58], def: 30 },
    Яйца: { n: [155, 13, 11, 1], def: 110, piece: 55 },
    Омлет: { n: [185, 11, 14, 3], def: 150 },
    "Яичница на масле": { n: [200, 12, 16, 1], def: 120 },
    Творог: { n: [121, 17, 5, 3], def: 150 },
    "Сырники жареные": { n: [220, 14, 10, 20], def: 120, piece: 60 },
    Йогурт: { n: [95, 10, 3, 8], def: 150 },
    Кефир: { n: [50, 3, 2, 4], def: 200, ml: true },
    "Молоко таиландское": { n: [64, 3.2, 3.7, 4.8], def: 200, ml: true },
    "Молоко российское": { n: [60, 3, 3.2, 4.7], def: 200, ml: true },
    Сыр: { n: [350, 25, 28, 1], def: 40 },
    Протеин: { n: [400, 80, 5, 8], def: 30, piece: 30, unit: "порция" },
    Курица: { n: [190, 29, 7, 0], def: 150 },
    "Курица отварная": { n: [165, 31, 3.6, 0], def: 150 },
    "Курица запечённая": { n: [235, 26, 14, 0], def: 150 },
    "Шашлык куриный": { n: [200, 25, 10, 2], def: 200 },
    Индейка: { n: [135, 30, 1, 0], def: 150 },
    Говядина: { n: [250, 26, 15, 0], def: 150 },
    "Рыба на пару": { n: [120, 22, 2, 0], def: 150 },
    Лосось: { n: [208, 20, 13, 0], def: 150 },
    Тунец: { n: [132, 28, 1, 0], def: 120 },
    Креветки: { n: [99, 24, 0.3, 0.2], def: 120 },
    Овощи: { n: [40, 2, 0.3, 7], def: 150 },
    "Овощи тушёные": { n: [90, 2, 6, 7], def: 180 },
    Салат: { n: [35, 1.5, 0.5, 5], def: 120 },
    Суп: { n: [60, 4, 2, 7], def: 350 },
    Орехи: { n: [580, 21, 50, 20], def: 30 },
    "Арахисовая паста": { n: [600, 25, 50, 20], def: 30, piece: 16, unit: "ст.л." },
    Авокадо: { n: [160, 2, 15, 9], def: 80 },
    "Масло растительное": { n: [884, 0, 100, 0], def: 10, piece: 5, unit: "ч.л." },
    "Масло сливочное": { n: [750, 0.8, 82, 0.8], def: 10, piece: 7, unit: "ч.л." },
    Сметана: { n: [200, 2.5, 20, 3.4], def: 30, piece: 25, unit: "ст.л." },
    Сок: { n: [45, 0.5, 0.1, 11], def: 250, ml: true },
    "Кофе чёрный": { n: [2, 0.1, 0, 0.3], def: 200, ml: true },
    "Пад Тай": { n: [180, 8, 7, 22], def: 300 },
    "Том Ям": { n: [60, 5, 2, 6], def: 350 },
    "Сом Там": { n: [55, 2, 1, 10], def: 200 },
    Сате: { n: [200, 18, 10, 5], def: 150 },
    Суши: { n: [150, 6, 3, 24], def: 200 }
  };

  /* Меню: у каждой позиции продукт, вес базовой порции и три замены.
     Вес замены не задаётся руками — он считается под калорийность позиции. */
  var MENUS = {
    ru: {
      title: "Русское меню",
      meals: {
        breakfast: [
          { food: "Овсянка на молоке", g: 250, alt: ["Гречка отварная", "Хлеб", "Сырники жареные"] },
          { food: "Банан", g: 120, alt: ["Яблоко", "Сок", "Мёд"] },
          { food: "Яйца", g: 110, alt: ["Омлет", "Яичница на масле", "Сыр"] },
          { food: "Творог", g: 100, alt: ["Йогурт", "Кефир", "Протеин"] }
        ],
        lunch: [
          { food: "Курица", g: 180, alt: ["Индейка", "Говядина", "Рыба на пару"] },
          { food: "Гречка отварная", g: 200, alt: ["Рис отварной", "Паста отварная", "Картофель отварной"] },
          { food: "Овощи", g: 200, alt: ["Салат", "Овощи тушёные", "Суп"] },
          { food: "Масло растительное", g: 5, alt: ["Масло сливочное", "Сметана", "Авокадо"] }
        ],
        snack: [
          { food: "Творог", g: 150, alt: ["Йогурт", "Кефир", "Сыр"] },
          { food: "Орехи", g: 30, alt: ["Арахисовая паста", "Авокадо", "Шоколад"] },
          { food: "Яблоко", g: 180, alt: ["Банан", "Сок", "Молоко российское"] }
        ],
        dinner: [
          { food: "Рыба на пару", g: 200, alt: ["Лосось", "Тунец", "Креветки"] },
          { food: "Рис отварной", g: 150, alt: ["Гречка отварная", "Картофель отварной", "Паста отварная"] },
          { food: "Салат", g: 150, alt: ["Овощи", "Овощи тушёные", "Суп"] }
        ]
      }
    },
    th: {
      title: "Тайское меню",
      meals: {
        breakfast: [
          { food: "Омлет", g: 150, alt: ["Яйца", "Яичница на масле", "Творог"] },
          { food: "Рис отварной", g: 150, alt: ["Хлеб", "Овсянка на молоке", "Гречка отварная"] },
          { food: "Сок", g: 200, alt: ["Кофе чёрный", "Молоко таиландское", "Кефир"] }
        ],
        lunch: [
          { food: "Пад Тай", g: 300, alt: ["Том Ям", "Суши", "Паста отварная"] },
          { food: "Курица запечённая", g: 120, alt: ["Креветки", "Индейка", "Шашлык куриный"] }
        ],
        snack: [
          { food: "Сом Там", g: 200, alt: ["Салат", "Овощи", "Яблоко"] },
          { food: "Сате", g: 120, alt: ["Шашлык куриный", "Креветки", "Курица отварная"] }
        ],
        dinner: [
          { food: "Том Ям", g: 350, alt: ["Суп", "Пад Тай", "Сом Там"] },
          { food: "Рис отварной", g: 150, alt: ["Гречка отварная", "Картофель отварной", "Хлеб"] },
          { food: "Креветки", g: 120, alt: ["Рыба на пару", "Тунец", "Курица отварная"] }
        ]
      }
    }
  };

  var TRANSLIT = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e",
    ю: "yu", я: "ya"
  };

  /** Имя файла картинки: та же формула, что в справочнике бота. */
  function slugOf(name) {
    return String(name)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split("")
      .map(function (ch) {
        return TRANSLIT[ch] === undefined ? ch : TRANSLIT[ch];
      })
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function nutr(food, g) {
    var k = g / 100;
    return {
      kcal: Math.round(food.n[0] * k),
      proteinG: Math.round(food.n[1] * k),
      fatG: Math.round(food.n[2] * k),
      carbsG: Math.round(food.n[3] * k)
    };
  }

  /** Вес до понятной величины: штуки и ложки целые, граммы кратны 5 или 10. */
  function roundG(food, g) {
    if (food.piece) return Math.max(1, Math.round(g / food.piece)) * food.piece;
    var step = g < 50 ? 5 : 10;
    return Math.max(step, Math.round(g / step) * step);
  }

  /**
   * Вес замены под калорийность позиции.
   *
   * Границы от обычной порции продукта: без них замена кофе на 90 ккал завтрака
   * дала бы четыре с половиной литра. Упёрлись в границу — калорийность честно
   * разойдётся, и это видно в строке замены.
   */
  function swapG(food, kcal) {
    var raw = (kcal / food.n[0]) * 100;
    var g = Math.min(Math.max(raw, food.def * 0.4), food.def * 2.5);
    return roundG(food, g);
  }

  function amountText(food, g) {
    if (food.piece) return g / food.piece + " " + (food.unit || "шт");
    return g + (food.ml ? " мл" : " г");
  }

  function option(name, g, current) {
    var food = FOOD[name];
    var n = nutr(food, g);
    return {
      food: name,
      slug: slugOf(name),
      g: g,
      amount: amountText(food, g),
      kcal: n.kcal,
      proteinG: n.proteinG,
      fatG: n.fatG,
      carbsG: n.carbsG,
      current: Boolean(current)
    };
  }

  /** Позиция приёма: выбранный продукт плюс он же и три замены в списке выбора. */
  function item(def, id, factor, swaps) {
    var baseG = roundG(FOOD[def.food], def.g * factor);
    var target = nutr(FOOD[def.food], baseG).kcal;
    var picked = swaps && swaps[id] && def.alt.indexOf(swaps[id]) !== -1 ? swaps[id] : def.food;

    var options = [option(def.food, baseG, picked === def.food)].concat(
      def.alt.map(function (name) {
        return option(name, swapG(FOOD[name], target), picked === name);
      })
    );
    var chosen = options.filter(function (o) {
      return o.current;
    })[0];

    return {
      id: id,
      base: def.food,
      swapped: picked !== def.food,
      food: chosen.food,
      slug: chosen.slug,
      amount: chosen.amount,
      g: chosen.g,
      kcal: chosen.kcal,
      proteinG: chosen.proteinG,
      fatG: chosen.fatG,
      carbsG: chosen.carbsG,
      options: options
    };
  }

  function sum(list) {
    return list.reduce(
      function (t, x) {
        return {
          kcal: t.kcal + x.kcal,
          proteinG: t.proteinG + x.proteinG,
          fatG: t.fatG + x.fatG,
          carbsG: t.carbsG + x.carbsG
        };
      },
      { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
    );
  }

  /** Калорийность меню в базовых порциях: от неё считается множитель под норму. */
  function baseKcal(menuId) {
    var total = 0;
    KEYS.forEach(function (key) {
      MENUS[menuId].meals[key].forEach(function (def) {
        total += nutr(FOOD[def.food], def.g).kcal;
      });
    });
    return total;
  }

  function targetKcal(goal, personalKcal) {
    return personalKcal && personalKcal > 0 ? personalKcal : GOAL_KCAL[goal];
  }

  /* Подсказка считается от фактического множителя, а не от цели: норма может быть
     выше базового меню даже на сушке, и обещать «на 20% меньше» тогда нельзя. */
  function portionHint(goal, factor) {
    var pct = Math.round(Math.abs(factor - 1) * 100);
    var size =
      factor < 0.95
        ? "Порции на ~" + pct + "% меньше базовых."
        : factor > 1.05
        ? "Порции на ~" + pct + "% больше базовых."
        : "Порции базовые.";
    return size + " " + GOAL_TIP[goal];
  }

  function meal(menuId, key, factor, swaps) {
    var items = MENUS[menuId].meals[key].map(function (def, i) {
      return item(def, menuId + ":" + key + ":" + i, factor, swaps);
    });
    var t = sum(items);
    return {
      key: key,
      label: LABELS[key],
      items: items,
      kcal: t.kcal,
      proteinG: t.proteinG,
      fatG: t.fatG,
      carbsG: t.carbsG
    };
  }

  /**
   * День меню под цель и норму.
   *
   * swaps — выбранные замены вида { "ru:breakfast:0": "Гречка отварная" }.
   * Итог дня складывается из позиций, поэтому после замены цифры меняются сами.
   */
  function day(menuId, goal, personalKcal, swaps) {
    var target = targetKcal(goal, personalKcal);
    var factor = target / baseKcal(menuId);
    var meals = KEYS.map(function (key) {
      return meal(menuId, key, factor, swaps);
    });
    return {
      title: MENUS[menuId].title,
      hint: portionHint(goal, factor),
      basedOn: target,
      personal: Boolean(personalKcal && personalKcal > 0),
      meals: meals,
      total: sum(meals)
    };
  }

  return {
    ids: ["ru", "th"],
    titles: { ru: "Русское", th: "Тайское" },
    day: day,
    slugOf: slugOf,
    /* Для проверки паритета с ботом. */
    menus: MENUS,
    foods: FOOD
  };
})();
