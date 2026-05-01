import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const SIGS_DIR = "signatures";
const STATIC_DIR = "static";
const SOURCE = "index.html";
const OUT_DIR = "dist";
const OUT = join(OUT_DIR, "index.html");
const OG_SVG = join(STATIC_DIR, "og.svg");
const OG_PNG = join(OUT_DIR, "og.png");
const MARKER_CARDS = "<!-- SIGNATURES -->";
const MARKER_COUNT = "__SIG_COUNT__";
const MARKER_TURNSTILE = "__TURNSTILE_SITE_KEY__";
const MARKER_OG_NSIGS = "{{N_SIGS}}";
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

const nSigsLabel = `${sigs.length} ${sigs.length === 1 ? "signatory" : "signatories"}`;
const svgTemplate = await readFile(OG_SVG, "utf8");
const svg = svgTemplate.replace(MARKER_OG_NSIGS, nSigsLabel);
const pngBuffer = new Resvg(svg).render().asPng();
await writeFile(OG_PNG, pngBuffer);

console.log(`Built ${OUT} with ${sigs.length} signature(s); rendered ${OG_PNG}.`);

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
