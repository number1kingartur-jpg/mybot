/**
 * Crawl arturkingfitness.com — extract pages for brand sync.
 * node scripts/crawl-site.mjs
 */
import { writeFileSync } from "fs";

const BASE = "https://arturkingfitness.com";
const seen = new Set();
const queue = ["/"];
const pages = [];

function isPagePath(path) {
  if (!path || path === "/") return true;
  if (path.startsWith("/_next/")) return false;
  if (/\.(woff2?|ttf|eot|ico|png|jpe?g|webp|svg|css|js|json|xml|txt)$/i.test(path)) return false;
  return true;
}

async function fetchPage(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const html = await res.text();
    return { url, html };
  } catch {
    return null;
  }
}

function extractLinks(html) {
  const links = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let href = m[1];
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/")) href = href.split("#")[0];
    else if (href.startsWith(BASE)) href = href.slice(BASE.length).split("#")[0] || "/";
    else continue;
    if (!seen.has(href)) links.push(href);
  }
  return links;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

while (queue.length && pages.length < 50) {
  const path = queue.shift();
  if (!isPagePath(path) || seen.has(path)) continue;
  seen.add(path);

  const page = await fetchPage(path);
  if (!page) continue;

  const text = htmlToText(page.html).slice(0, 12000);
  pages.push({ path, url: page.url, textLen: text.length, text });
  console.log("ok", path, text.length);

  for (const link of extractLinks(page.html)) {
    if (isPagePath(link) && !seen.has(link) && !queue.includes(link)) queue.push(link);
  }
}

writeFileSync("docs/site-corpus.json", JSON.stringify(pages, null, 2));
console.log("pages:", pages.length, "-> docs/site-corpus.json");
