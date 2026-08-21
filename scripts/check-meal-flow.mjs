/**
 * Аудит ветки питания: жалобы Артура, которые раньше проходили сборку.
 *
 * 1. Обрубок «и ещё N» считался как 600 вместо 1200.
 * 2. В рис с курицей дописывали овсянку и вешали кнопку коктейля.
 * 3. Полный шейкер обязан остаться «Коктейль» со всеми позициями.
 * 4. Из двух позиций крестик снимает последнюю.
 * 5. Напоминание не орёт, если слот уже записан.
 *
 * Запуск: node scripts/check-meal-flow.mjs
 */
import { isPureShake, isShakeMeal, macrosFromItems, macrosFromText } from "../dist/foods.js";
import { defaultShakeMeal } from "../dist/meal-shake.js";
import { editMeal, isCompleteShake, mealFromHistory, mergeShakeFromUsual } from "../dist/meal.js";
import { mealPingForHour, shouldSendMealPing } from "../dist/meal-remind.js";
import { splitOffer } from "../dist/meal-same.js";

let fails = 0;
function ok(cond, what) {
  if (!cond) {
    console.error(`НЕ ПРОШЛО: ${what}`);
    fails++;
  }
}

const usual = macrosFromItems([
  { name: "белок яичный жидкий", grams: 250 },
  { name: "молоко таиландское", grams: 100 },
  { name: "банан", grams: 360 },
  { name: "овсяные хлопья сухие", grams: 96 },
  { name: "арахисовая паста", grams: 16 },
  { name: "протеин", grams: 60 },
  { name: "креатин", grams: 3 },
]);

ok(usual && usual.name === "Коктейль", `полный шейкер в названии: ${usual?.name}`);
ok(usual.parts.length >= 6, `полный шейкер позиций: ${usual.parts.length}`);
ok(isPureShake(usual.parts), "полный шейкер: все позиции из шейкера");
ok(isCompleteShake(usual.parts), "полный шейкер: овсянка и протеин на месте");
ok(usual.kcal > 1100, `полный шейкер ккал: ${usual.kcal}`);

const stub = macrosFromItems([
  { name: "белок яичный жидкий", grams: 258 },
  { name: "молоко таиландское", grams: 103 },
  { name: "банан", grams: 360 },
  { name: "арахисовая паста", grams: 16 },
]);
ok(isPureShake(stub.parts) && !isCompleteShake(stub.parts), "четыре позиции: шейкер, но не полный");
ok(stub.kcal < 700, `обрубок ккал: ${stub.kcal}`);
const filled = mergeShakeFromUsual(stub, usual.parts);
ok(isCompleteShake(filled.parts), "допись из вчерашнего вернула овсянку и протеин");
ok(filled.kcal > 1000, `после дописи не 600: ${filled.kcal}`);

const truncated = mealFromHistory({
  name: "Белок яичный жидкий ~258 г, молоко таиландское ~103 г, банан ~360 г, арахисовая паста ~16 г и ещё 3",
  kcal: 1217,
  proteinG: 100,
  fatG: 21,
  carbsG: 155,
});
ok(!truncated.parts?.length, "хвост «и ещё 3» без состава не разбираем в четыре слова");
ok(truncated.kcal === 1217, `цифры записи не режем до 600: ${truncated.kcal}`);

const withParts = mealFromHistory({
  name: "Коктейль",
  kcal: usual.kcal,
  proteinG: usual.proteinG,
  fatG: usual.fatG,
  carbsG: usual.carbsG,
  parts: usual.parts,
});
ok(withParts.parts.length === usual.parts.length, "сохранённый состав коктейля не теряется");

const plate = macrosFromItems([
  { name: "рис отварной", grams: 220 },
  { name: "куриная грудка", grams: 130 },
]);
ok(plate && plate.kcal >= 480 && plate.kcal <= 520, `рис+курица ~501: ${plate.kcal}`);
ok(!isShakeMeal(plate.parts), "рис с курицей не коктейль");
ok(!isPureShake(plate.parts), "рис с курицей не чистый шейкер");
const platePlusShake = mergeShakeFromUsual(plate, usual.parts);
ok(platePlusShake.parts.length === plate.parts.length, "в тарелку овсянку не дописываем");
ok(!/овсян/i.test(platePlusShake.parts.map((p) => p.name).join(" ")), "овсянки на тарелке нет");

const plateWithScoop = macrosFromItems([
  { name: "рис отварной", grams: 150 },
  { name: "куриная грудка", grams: 150 },
  { name: "молоко таиландское", grams: 200 },
  { name: "протеин", grams: 30 },
]);
ok(isShakeMeal(plateWithScoop.parts), "скуп на тарелке формально похож на шейкер");
ok(!isPureShake(plateWithScoop.parts), "рис и курица ломают чистый шейкер");
const noOatsOnPlate = mergeShakeFromUsual(plateWithScoop, usual.parts);
ok(
  !noOatsOnPlate.parts.some((p) => /овсян/i.test(p.name)),
  "овсянку к рису с курицей и скупом не дописываем"
);

const lunch = splitOffer([
  {
    name: plate.name,
    kcal: plate.kcal,
    proteinG: plate.proteinG,
    fatG: plate.fatG,
    carbsG: plate.carbsG,
    parts: plate.parts,
  },
], "lunch");
ok(lunch.length === 2, `рис и курица отдельные галочки: ${lunch.length}`);
ok(lunch.every((u) => u.items.length === 1), "каждая галочка обеда — одна позиция");

const two = macrosFromItems([
  { name: "яблоко", grams: 180 },
  { name: "салат", grams: 180 },
]);
const dropLast = editMeal(two, { drop: 1 });
ok(dropLast && dropLast.parts.length === 1, "из двух позиций последнюю снимаем");
ok(editMeal(dropLast, { drop: 0 }) === null, "единственную позицию снимать нельзя");

ok(
  !shouldSendMealPing({
    paused: false,
    hasNutrition: true,
    loggedThisWeek: true,
    mealsToday: [{ hour: 13 }],
    ping: mealPingForHour(13),
  }),
  "обед записан — в 13:00 молчим"
);
ok(
  shouldSendMealPing({
    paused: false,
    hasNutrition: true,
    loggedThisWeek: true,
    mealsToday: [{ hour: 8 }],
    ping: mealPingForHour(13),
  }),
  "после завтрака обед ещё напомнить"
);

const textShake = macrosFromText(
  "250мл жидкого белка,100 молока 3 банана 8 сталовых ложек овсянки 1 ложка арахисовой пасты 2 скупа протеина и пол ложки креатина"
);
ok(textShake && textShake.name === "Коктейль", `текст полного шейкера: ${textShake?.name}`);
ok(textShake.parts.length >= 6, "текст не прячет овсянку в «и ещё»");

const def = defaultShakeMeal();
ok(def && def.name === "Коктейль" && def.kcal > 1100, `эталон коктейля без истории: ${def?.kcal}`);
ok(def.parts.length >= 6, "эталон не пустой");

if (fails) {
  console.error(`check-meal-flow: ${fails} провал(ов)`);
  process.exit(1);
}
console.log("check-meal-flow: ветка питания держит жалобы Артура");
