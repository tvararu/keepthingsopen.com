import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

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

  const sigLines = (await readFile("signatures.md", "utf8"))
    .split("\n")
    .sort((a, b) => a.localeCompare(b, 'en', {'sensitivity': 'base'}));
  const sigs = sigLines.map(parseLine).filter(Boolean);

  const named = sigs.filter((s) => s.name !== "Anonymous");
  const anonCount = sigs.length - named.length;
  const grid = sigs.length
    ? `<div class="sig-grid">\n${named.map(renderCard).join("\n")}\n</div>`
    : `<div class="sig-empty">Be the first to sign — see below.</div>`;
  const anon = anonCount > 0 ? renderAnonymousGroup(anonCount) : "";

  const html = await readFile(SOURCE, "utf8");
  const out = html
    .replaceAll(MARKER_SIGS, grid)
    .replaceAll(MARKER_ANON, anon)
    .replaceAll(MARKER_COUNT, String(sigs.length))
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

function parseLine(text) {
  const line = (text.trim().split("\n")[0] || "").trim();
  if (!line.startsWith("- ")) return null;
  const m = line.slice(2).match(/^\*\*(.+?)\*\*(?:, (.+))?$/);
  if (!m) return null;
  let rest = (m[2] || "").trim();
  let contributor = false;
  let verified = false;
  const contributorSuffix = /(?:^|,\s*)contributor$/i;
  const verifiedSuffix = /(?:^|,\s*)verified$/i;
  for (let i = 0; i < 2; i++) {
    if (verifiedSuffix.test(rest)) {
      verified = true;
      rest = rest.replace(verifiedSuffix, "").trim();
    }
    if (contributorSuffix.test(rest)) {
      contributor = true;
      rest = rest.replace(contributorSuffix, "").trim();
    }
  }
  return { name: m[1], rest, contributor, verified };
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
  let badge = "";
  if (s.verified && s.contributor) {
    badge = `<span class="sig-verified" title="Identity manually verified, has contributed to UK public-sector software"><img src="/crown.svg" alt=""></span><span class="govuk-visually-hidden">Identity manually verified, has contributed to UK public-sector software</span>`;
  } else if (s.verified) {
    badge = `<span class="sig-verified" title="Identity manually verified" aria-hidden="true"></span><span class="govuk-visually-hidden">Identity manually verified</span>`;
  } else if (s.contributor) {
    badge = `<img src="/crown.svg" alt="" class="sig-crown" title="Has contributed to UK public-sector software"><span class="govuk-visually-hidden">Has contributed to UK public-sector software</span>`;
  }
  return `<div class="sig"><strong>${escapeHtml(s.name)}</strong>${badge}</div>`;
}

function renderAnonymousGroup(n) {
  const mult = n > 1 ? `<span class="sig-anon-mult">&times; ${n}</span>` : "";
  return `<div class="sig sig--anon"><strong>Anonymous</strong></div>${mult}`;
}
