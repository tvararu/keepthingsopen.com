import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const SIGS_DIR = "signatures";
const STATIC_DIR = "static";
const SOURCE = "index.html";
const OUT_DIR = "dist";
const OUT = join(OUT_DIR, "index.html");
const OG_SVG = join(STATIC_DIR, "og.svg");
const OG_PNG = join(OUT_DIR, "og.png");
const MARKER_SIGS = "<!-- SIGNATURES -->";
const MARKER_ANON = "<!-- ANON -->";
const MARKER_COUNT = "__SIG_COUNT__";
const MARKER_TURNSTILE = "__TURNSTILE_SITE_KEY__";
const MARKER_OG_NSIGS = "{{N_SIGS}}";
const TURNSTILE_PROD = "0x4AAAAAADE1JMgbZ9iIeWgm";

async function build() {
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

  const named = sigs.filter((s) => s.name !== "Anonymous");
  const anonCount = sigs.length - named.length;
  const grid = sigs.length
    ? `<div class="sig-grid">\n${named.map(renderCard).join("\n")}\n</div>`
    : `<div class="sig-empty">Be the first to sign — see below.</div>`;
  const anon = anonCount > 0 ? renderAnonymousGroup(anonCount) : "";

  const html = await readFile(SOURCE, "utf8");
  const out = html
    .replace(MARKER_SIGS, grid)
    .replace(MARKER_ANON, anon)
    .replace(MARKER_COUNT, String(sigs.length))
    .replaceAll(MARKER_TURNSTILE, process.env.TURNSTILE_SITE_KEY || TURNSTILE_PROD);
  await writeFile(OUT, out);

  const nSigsLabel = `${sigs.length} ${sigs.length === 1 ? "signatory" : "signatories"}`;
  const svgTemplate = await readFile(OG_SVG, "utf8");
  const svg = svgTemplate.replace(MARKER_OG_NSIGS, nSigsLabel);
  const pngBuffer = new Resvg(svg).render().asPng();
  await writeFile(OG_PNG, pngBuffer);

  console.log(`Built ${OUT} with ${sigs.length} signature(s); rendered ${OG_PNG}.`);
}

await build();

if (process.argv.includes("--watch")) {
  const watchTargets = [
    { path: SOURCE, recursive: false },
    { path: "scripts", recursive: false },
    { path: SIGS_DIR, recursive: true },
    { path: STATIC_DIR, recursive: true },
  ];

  let pending = false;
  let running = false;
  const trigger = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await build();
    } catch (e) {
      console.error("Build failed:", e.message);
    }
    running = false;
    if (pending) {
      pending = false;
      trigger();
    }
  };

  let timer = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(trigger, 80);
  };

  for (const { path, recursive } of watchTargets) {
    try {
      watch(path, { recursive }, debounced);
    } catch (e) {
      console.warn(`Cannot watch ${path}: ${e.message}`);
    }
  }
  console.log("Watching for changes. Press Ctrl-C to exit.");
}

function parseLine(text) {
  const line = (text.trim().split("\n")[0] || "").trim();
  if (!line.startsWith("- ")) return null;
  const m = line.slice(2).match(/^\*\*(.+?)\*\*(?:, (.+))?$/);
  if (!m) return null;
  let rest = (m[2] || "").trim();
  let gov = false;
  const govSuffix = /(?:^|,\s*)gov$/i;
  if (govSuffix.test(rest)) {
    gov = true;
    rest = rest.replace(govSuffix, "").trim();
  }
  return { name: m[1], rest, gov };
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
  const crown = s.gov
    ? `<img src="/crown.svg" alt="" class="sig-crown" title="Has contributed to UK public-sector software"><span class="govuk-visually-hidden">Has contributed to UK public-sector software</span>`
    : "";
  return `<div class="sig"><strong>${escapeHtml(s.name)}</strong>${crown}</div>`;
}

function renderAnonymousGroup(n) {
  const mult = n > 1 ? `<span class="sig-anon-mult">&times; ${n}</span>` : "";
  return `<div class="sig sig--anon"><strong>Anonymous</strong></div>${mult}`;
}
