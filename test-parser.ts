import { parseWorkout, parseGroups } from "./src/parser";

const cases = [
  "присед 100 5х5",
  "жим лежа 3x8x60",
  "становая 140кг",
  "становая 140",
  "подтягивания 4х10",
  "жим 1 подход на 20 кг и 4 подхода на 30 раз 10 кг",
  "жим лёжа 1 подход 20 кг и 4 подхода по 10 раз 30 кг",
  "присед 60х8, 80х5, 100х3",
  "жим 100х5",
  "присед 5х5 100\nжим лежа 3х8 60\nтяга 4х10 50",
  "махи гирей 24 кг 3 подхода по 15",
  "просто текст без цифр",
];

for (const c of cases) {
  console.log("―".repeat(50));
  console.log("ВХОД:", JSON.stringify(c));
  console.log(JSON.stringify(parseWorkout(c), null, 1));
}

console.log("═".repeat(50));
console.log("groups only: '1х20х20 + 4х10х30' →", JSON.stringify(parseGroups("1х20х20 + 4х10х30")));
console.log("groups only: '4×5×120' →", JSON.stringify(parseGroups("4×5×120")));
console.log("groups only: '3 8 100' →", JSON.stringify(parseGroups("3 8 100")));
