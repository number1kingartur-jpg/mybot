/** Проверка очереди канала при сборке. */
import { CHANNEL_POSTS } from "../dist/channel/posts.js";

const footer = "Что сделать на этой неделе";
const dupEnds = new Map();

for (const p of CHANNEL_POSTS) {
  const text = p.parts?.join("\n\n") ?? p.body;
  if (text.includes(footer)) {
    console.error(`FAIL: post ${p.id} has old generic footer`);
    process.exit(1);
  }
  const end = text.slice(-100);
  const list = dupEnds.get(end) ?? [];
  list.push(p.id);
  dupEnds.set(end, list);
}

const dup = [...dupEnds.entries()].filter(([, ids]) => ids.length > 1);
if (dup.length) {
  console.error("FAIL: identical endings:", dup.map(([, ids]) => ids.join("=")).join("; "));
  process.exit(1);
}

const lens = CHANNEL_POSTS.map((p) => (p.parts?.join("") ?? p.body).length);
console.log(`OK: ${CHANNEL_POSTS.length} posts, unique endings, min ${Math.min(...lens)} chars`);
