/**
 * Напоминание «пора есть»: слот пустой — пишем, слот записан — молчим.
 */
import { dayHasSlot, mealPingForHour, mealPingText, shouldSendMealPing } from "../dist/meal-remind.js";

let fails = 0;
function ok(cond, what) {
  if (!cond) {
    console.error(`НЕ ПРОШЛО: ${what}`);
    fails++;
  }
}

ok(mealPingForHour(8)?.kind === "slot" && mealPingForHour(8).slot === "breakfast", "8:00 — завтрак");
ok(mealPingForHour(13)?.slot === "lunch", "13:00 — обед");
ok(mealPingForHour(19)?.slot === "dinner", "19:00 — ужин");
ok(mealPingForHour(20)?.kind === "empty-day", "20:00 — пустой день");
ok(mealPingForHour(11) === null, "11:00 — не пинаем");

ok(dayHasSlot([{ hour: 8 }], "breakfast"), "коктейль в 8 закрыл завтрак");
ok(!dayHasSlot([{ hour: 8 }], "lunch"), "утром обед ещё пуст");

const base = { paused: false, hasNutrition: true, loggedThisWeek: true };
ok(
  shouldSendMealPing({ ...base, mealsToday: [], ping: mealPingForHour(8) }),
  "пустой завтрак — напомнить"
);
ok(
  !shouldSendMealPing({ ...base, mealsToday: [{ hour: 8 }], ping: mealPingForHour(8) }),
  "завтрак записан — молчать"
);
ok(
  shouldSendMealPing({ ...base, mealsToday: [{ hour: 8 }], ping: mealPingForHour(13) }),
  "после завтрака в 13 напомнить про обед"
);
ok(
  !shouldSendMealPing({ ...base, mealsToday: [{ hour: 8 }], ping: mealPingForHour(20) }),
  "если день не пустой, в 20:00 не дублировать"
);
ok(
  !shouldSendMealPing({ ...base, paused: true, mealsToday: [], ping: mealPingForHour(8) }),
  "на паузе не писать"
);

ok(/Пора есть: обед/.test(mealPingText(mealPingForHour(13), 4)), "текст слота про обед");

if (fails) {
  console.error(`check-meal-remind: ${fails} провал(ов)`);
  process.exit(1);
}
console.log("check-meal-remind: слоты еды считаются верно");
