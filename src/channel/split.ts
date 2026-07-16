/** Разбивка длинного текста поста на 2–3 сообщения (лимит подписи к фото — 1024). */

const PHOTO_CAPTION_MAX = 950;
const MESSAGE_PART_MAX = 1200;
const MAX_PARTS = 3;
const PART_LABEL_RESERVE = 12;

function hardSplit(text: string, maxLen: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf(" ", maxLen);
    if (cut < maxLen * 0.4) cut = maxLen;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function mergeParts(parts: string[], target: number): string[] {
  const merged = [...parts];
  while (merged.length > target) {
    let idx = 0;
    let min = Infinity;
    for (let i = 0; i < merged.length - 1; i++) {
      const size = merged[i].length + merged[i + 1].length + 2;
      if (size < min) {
        min = size;
        idx = i;
      }
    }
    merged.splice(idx, 2, `${merged[idx]}\n\n${merged[idx + 1]}`);
  }
  return merged;
}

function packParagraphs(paras: string[], maxLen: number): string[] {
  const parts: string[] = [];
  let buf = "";
  for (const para of paras) {
    const next = buf ? `${buf}\n\n${para}` : para;
    if (next.length <= maxLen) {
      buf = next;
      continue;
    }
    if (buf) parts.push(buf);
    if (para.length > maxLen) {
      parts.push(...hardSplit(para, maxLen));
      buf = "";
    } else {
      buf = para;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

export function splitPostText(
  body: string,
  opts?: { withPhoto?: boolean; maxParts?: number }
): string[] {
  const maxParts = Math.min(3, Math.max(1, opts?.maxParts ?? MAX_PARTS));
  const maxLen = (opts?.withPhoto ? PHOTO_CAPTION_MAX : MESSAGE_PART_MAX) - PART_LABEL_RESERVE;
  const trimmed = body.trim();
  if (!trimmed) return [""];
  if (trimmed.length <= maxLen) return [trimmed];

  const paras = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  let parts = paras.length > 0 ? packParagraphs(paras, maxLen) : hardSplit(trimmed, maxLen);
  if (parts.length > maxParts) parts = mergeParts(parts, maxParts);

  // После слияния отдельные куски могли вырасти — подрежем жёстко (редко)
  const fixed: string[] = [];
  for (const p of parts) {
    if (p.length <= maxLen) fixed.push(p);
    else fixed.push(...hardSplit(p, maxLen));
  }
  return fixed.length > maxParts ? mergeParts(fixed, maxParts) : fixed;
}

export function labelParts(parts: string[]): string[] {
  if (parts.length <= 1) return parts;
  return parts.map((p, i) => `${p}\n\n(${i + 1}/${parts.length})`);
}

/** Превью для владельца: все части через разделитель. */
export function formatPostPreview(body: string, explicitParts?: string[], withPhoto?: boolean): string {
  const parts = explicitParts?.length
    ? explicitParts
    : splitPostText(body, { withPhoto });
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.map((p, i) => `—— часть ${i + 1}/${parts.length} ——\n${p}`).join("\n\n");
}

export function partCount(body: string, explicitParts?: string[], withPhoto?: boolean): number {
  if (explicitParts?.length) return explicitParts.length;
  return splitPostText(body, { withPhoto }).length;
}
