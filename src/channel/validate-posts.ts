import type { ChannelPost } from "./posts";

const MIN_CHARS = 450;

function bodyText(post: ChannelPost): string {
  if (post.parts?.length) return post.parts.join("\n\n");
  return post.body;
}

/**
 * Финальная очередь: уникальные id, без копипасты-тел, минимальная длина.
 * Падает при сборке — дубли не попадут в канал.
 */
export function finalizeChannelPosts(raw: ChannelPost[]): ChannelPost[] {
  const seenIds = new Set<string>();
  const bodyStarts = new Map<string, string>();
  const out: ChannelPost[] = [];

  for (const post of raw) {
    if (seenIds.has(post.id)) {
      throw new Error(`channel: duplicate post id "${post.id}" — убери из очереди`);
    }
    seenIds.add(post.id);

    const text = bodyText(post);
    const len = text.length;
    if (len < MIN_CHARS) {
      throw new Error(`channel: post "${post.id}" too short (${len} < ${MIN_CHARS})`);
    }

    const sig = text.slice(0, 180).replace(/\s+/g, " ").trim();
    const prev = bodyStarts.get(sig);
    if (prev) {
      throw new Error(`channel: posts "${prev}" and "${post.id}" start the same — дубль темы`);
    }
    bodyStarts.set(sig, post.id);

    out.push(post);
  }

  return out;
}
