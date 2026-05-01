import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SIGS_DIR = "signatures";
const SOURCE = "index.html";
const OUT_DIR = "dist";
const OUT = join(OUT_DIR, "index.html");
const MARKER_CARDS = "<!-- SIGNATURES -->";
const MARKER_COUNT = "__SIG_COUNT__";
const MARKER_TURNSTILE = "__TURNSTILE_SITE_KEY__";
const TURNSTILE_PROD = "0x4AAAAAADE1JMgbZ9iIeWgm";

await mkdir(OUT_DIR, { recursive: true });

let files = [];
try {
  files = (await readdir(SIGS_DIR)).filter((f) => f.endsWith(".md")).sort();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

const sigs = (
  await Promise.all(
    files.map(async (f) =>
      parseLine(await readFile(join(SIGS_DIR, f), "utf8")),
    ),
  )
).filter(Boolean);

const html = await readFile(SOURCE, "utf8");
const cards = sigs.length
  ? sigs.map(renderCard).join("\n")
  : `<div class="sig-empty">Be the first to sign — see below.</div>`;

const out = html
  .replace(MARKER_CARDS, cards)
  .replace(MARKER_COUNT, String(sigs.length))
  .replaceAll(MARKER_TURNSTILE, process.env.TURNSTILE_SITE_KEY || TURNSTILE_PROD);

await writeFile(OUT, out);

console.log(`Built ${OUT} with ${sigs.length} signature(s).`);

function parseLine(text) {
  const line = (text.trim().split("\n")[0] || "").trim();
  if (!line.startsWith("- ")) return null;
  let body = line.slice(2);
  let url = null;
  const linkMatch = body.match(/^\[(.+)\]\((https?:\/\/.+)\)$/);
  if (linkMatch) {
    body = linkMatch[1];
    url = linkMatch[2];
  }
  const m = body.match(/^\*\*(.+?)\*\*(?:, (.+))?$/);
  if (!m) return null;
  return { name: m[1], rest: (m[2] || "").trim(), url };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCard(s) {
  const nameHtml = `<strong>${escapeHtml(s.name)}</strong>`;
  const named = s.url
    ? `<a class="govuk-link" href="${escapeHtml(s.url)}" rel="noopener">${nameHtml}</a>`
    : nameHtml;
  const subtitle = s.rest
    ? `<div class="sig-role">${escapeHtml(s.rest)}</div>`
    : "";
  return `<div class="sig">${named}${subtitle}</div>`;
}
