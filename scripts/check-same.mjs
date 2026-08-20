/**
 * Повтор вчерашнего приёма по времени дня.
 * Запуск: node scripts/check-same.mjs
 */
import { inferSlots, sameAsYesterday, slotByHour, slotLabel, yesterdayOf } from "../dist/meal-same.js";

let failed = 0;
function check(title, cond, detail) {
  if (cond) return;
  failed++;
  console.error(`FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
}

check("утром завтрак", slotByHour(8) === "breakfast");
check("в полдень обед", slotByHour(12) === "lunch");
check("вечером ужин", slotByHour(20) === "dinner");
check("ночью ужин", slotByHour(1) === "dinner");
check("подпись завтрака", slotLabel("breakfast") === "завтрак");
check("вчерашняя дата", yesterdayOf("2026-08-20") === "2026-08-19");

check("один приём без часа = завтрак в порядке", inferSlots(1).join() === "breakfast");
check("два приёма = завтрак и ужин", inferSlots(2).join() === "breakfast,dinner");
check("три приёма = завтрак, обед, ужин", inferSlots(3).join() === "breakfast,lunch,dinner");

const yesterday = [
  { name: "Овсянка на воде ~250 г", kcal: 170, proteinG: 6, fatG: 4, carbsG: 30 },
  { name: "Куриная грудка ~150 г", kcal: 248, proteinG: 47, fatG: 5, carbsG: 0 },
  { name: "Творог ~150 г", kcal: 182, proteinG: 26, fatG: 8, carbsG: 5 },
];

const morning = sameAsYesterday(yesterday, [], 8);
check("утром предлагает завтрак", morning?.title === "завтрак", morning?.title);
check("утром первая позиция", morning?.meals[0]?.name.startsWith("Овсянка"), morning?.meals[0]?.name);

const noon = sameAsYesterday(yesterday, [], 13);
check("днём предлагает обед", noon?.title === "обед", noon?.title);
check("днём грудка", noon?.meals[0]?.name.startsWith("Куриная"), noon?.meals[0]?.name);

const already = sameAsYesterday(yesterday, [{ name: "Овсянка на воде ~250 г" }], 8);
check("уже записанный завтрак не предлагает", already === null);

const hours = [
  { name: "Гречка", kcal: 200, proteinG: 8, fatG: 3, carbsG: 35, hour: 19 },
];
const byHour = sameAsYesterday(hours, [], 20);
check("час в записи важнее порядка", byHour?.title === "ужин" && byHour.meals[0].name === "Гречка", byHour?.title);

const one = sameAsYesterday([{ name: "Рис", kcal: 230, proteinG: 5, fatG: 1, carbsG: 50 }], [], 20);
check("один вчерашний приём без часа спрашивают и вечером", one?.title === "вчера" && one.meals[0].name === "Рис", one?.title);

if (failed) {
  console.error(`check-same: ${failed} ошибок`);
  process.exit(1);
}
console.log("check-same: вчерашний приём по времени считается верно");
