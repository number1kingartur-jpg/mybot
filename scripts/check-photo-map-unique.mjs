/** Проверка photo-map: предупреждение о повторах, ошибка только если путь пустой. */
import { readFileSync } from "fs";
import { join } from "path";

const map = JSON.parse(
  readFileSync(join(process.cwd(), "assets", "channel", "photo-map.json"), "utf-8")
);

const byPath = new Map();
for (const [id, rel] of Object.entries(map)) {
  const list = byPath.get(rel) ?? [];
  list.push(id);
  byPath.set(rel, list);
}

const dup = [...byPath.entries()].filter(([, ids]) => ids.length > 1);
if (dup.length) {
  console.warn(`WARN ${dup.length} shared photos (food/reuse):`);
  for (const [rel, ids] of dup) console.warn(`  ${rel.split("/").pop()}: ${ids.join(", ")}`);
}

console.log(`OK: ${Object.keys(map).length} posts, ${byPath.size} unique files`);
