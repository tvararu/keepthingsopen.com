import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SIGS_DIR = "signatures";
const STATIC_DIR = "static";
const SOURCE = "index.html";
const OUT_DIR = "dist";
const OUT = join(OUT_DIR, "index.html");
const MARKER_CARDS = "<!-- SIGNATURES -->";
const MARKER_COUNT = "__SIG_COUNT__";
const MARKER_TURNSTILE = "__TURNSTILE_SITE_KEY__";
const TURNSTILE_PROD = "0x4AAAAAADE1JMgbZ9iIeWgm";

await mkdir(OUT_DIR, { recursive: true });

let staticFiles = [];
try {
  staticFiles = await readdir(STATIC_DIR);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await Promise.all(
  staticFiles.map((f) => copyFile(join(STATIC_DIR, f), join(OUT_DIR, f))),
);

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
  const m = line.slice(2).match(/^\*\*(.+?)\*\*(?:, (.+))?$/);
  if (!m) return null;
  return { name: m[1], rest: (m[2] || "").trim() };
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
  const subtitle = s.rest
    ? `<div class="sig-role">${escapeHtml(s.rest)}</div>`
    : "";
  return `<div class="sig"><strong>${escapeHtml(s.name)}</strong>${subtitle}</div>`;
}
