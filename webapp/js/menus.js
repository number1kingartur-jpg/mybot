/* Готовые меню на день — порт src/meals.ts.
   Состав и базовые КБЖУ один в один с ботом. Разница одна: бот масштабирует
   порции к фиксированному калоражу цели (1600/2200/2800), а приложение знает
   личную норму пользователя и пересчитывает под неё — это точнее, и на экране
   прямо написано, от какой цифры считалось.
   Порядок в kbju как в боте: [ккал, белок, углеводы, жиры]. */

window.KM_MENUS = (function () {
  "use strict";

  var BASE_KCAL = 2000;

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

  /* Подсказка считается от фактического множителя, а не от цели: норма может быть
     выше базовых 2000 ккал даже на сушке, и обещать «на 20% меньше» тогда нельзя. */
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

  var MENUS = {
    ru: {
      title: "Русское меню",
      meals: {
        breakfast: {
          items: ["Овсянка 80 г", "Банан 1 шт", "Яйца 2 шт", "Творог 5% 100 г"],
          kbju: [520, 35, 55, 12]
        },
        lunch: {
          items: ["Курица 200 г", "Гречка 150 г", "Овощи на пару 200 г", "Оливковое масло 1 ч.л."],
          kbju: [650, 55, 60, 15]
        },
        snack: {
          items: ["Творог 150 г", "Орехи 30 г", "Яблоко 1 шт"],
          kbju: [380, 25, 20, 22]
        },
        dinner: {
          items: ["Рыба 200 г", "Рис 100 г", "Салат 150 г"],
          kbju: [450, 40, 35, 18]
        }
      }
    },
    th: {
      title: "Тайское меню",
      meals: {
        breakfast: {
          items: ["Khao Tom 300 г", "Яйцо 2 шт", "Pak choi 100 г"],
          kbju: [480, 22, 55, 18]
        },
        lunch: {
          items: ["Pad Kra Pao 300 г", "Рис жасмин 150 г", "Яйцо 1 шт"],
          kbju: [720, 45, 75, 28]
        },
        snack: {
          items: ["Som Tam 200 г", "Gai Satay 100 г"],
          kbju: [350, 28, 15, 20]
        },
        dinner: {
          items: ["Tom Yum 300 г", "Рис 100 г", "Овощи 100 г"],
          kbju: [450, 30, 45, 18]
        }
      }
    }
  };

  /** Целевой калораж: личная норма, если посчитана, иначе фикс цели как в боте. */
  function targetKcal(goal, personalKcal) {
    return personalKcal && personalKcal > 0 ? personalKcal : GOAL_KCAL[goal];
  }

  function meal(menuId, key, goal, personalKcal) {
    var m = MENUS[menuId].meals[key];
    var f = targetKcal(goal, personalKcal) / BASE_KCAL;
    return {
      key: key,
      label: LABELS[key],
      items: m.items,
      kcal: Math.round(m.kbju[0] * f),
      proteinG: Math.round(m.kbju[1] * f),
      carbsG: Math.round(m.kbju[2] * f),
      fatG: Math.round(m.kbju[3] * f)
    };
  }

  function day(menuId, goal, personalKcal) {
    var meals = KEYS.map(function (k) {
      return meal(menuId, k, goal, personalKcal);
    });
    var total = meals.reduce(
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
    return {
      title: MENUS[menuId].title,
      hint: portionHint(goal, targetKcal(goal, personalKcal) / BASE_KCAL),
      basedOn: targetKcal(goal, personalKcal),
      personal: Boolean(personalKcal && personalKcal > 0),
      meals: meals,
      total: total
    };
  }

  return { ids: ["ru", "th"], titles: { ru: "Русское", th: "Тайское" }, day: day };
})();
