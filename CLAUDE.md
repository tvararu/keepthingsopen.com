# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page open letter site addressed to NHS England technical leadership, asking them to reaffirm "make new source code open" as a default. The page is a manifesto + a list of signatories + a sign-this form. It's hosted on Cloudflare Workers Static Assets.

## Commands

Always use mise tasks instead of direct wrangler/node commands:

```sh
mise build       # Render dist/index.html from index.html + signatures.md
mise dev         # Run a local Worker dev server (serves on http://localhost:8787)
mise deploy      # Manual production deploy (CF Workers Builds also auto-deploys on push to main)
```

Local-dev env (Turnstile test secret) lives in `mise.toml`'s `[env]` block; no `.dev.vars` to provision. Production secrets live in the Cloudflare dashboard as encrypted Worker secrets, not in code.

Static-only preview: `mise build && (cd dist && python3 -m http.server 8765)` bypasses the Worker entirely, useful for visual spot-checks. `mise dev` lets Wrangler run the configured build command and watch the source inputs listed in `wrangler.jsonc`'s `build.watch_dir`; don't add a second background build watcher beside it.

**There is no test suite.** No linter config either — this is deliberate. End-to-end verification is by curl/browser against `mise dev`. The only npm dependency is `@resvg/resvg-js`, used by the build to rasterise the OpenGraph card.

## Architecture

The site has three moving parts and a deliberate template/output split:

### 1. The Worker (`src/index.js`) — `POST /sign`

The Worker has one job: handle `POST /sign`. It accepts a JSON form submission, validates fields and a Cloudflare Turnstile token, and uses the native `send_email` binding to fan one email per moderator (verified destination addresses listed in `wrangler.jsonc`'s `allowed_destination_addresses`). The signer's email is the `Reply-To`. Submissions are NOT committed anywhere; the moderator reads the email and adds the signature file by hand.

Everything else falls through to `env.ASSETS.fetch(request)`. **The Worker does not render, parse, or template static assets.** When extending the site, keep this posture: a thin form endpoint and nothing else.

### 2. The build script (`scripts/build.mjs`) — ESM

This is where signature rendering happens. It:

1. Reads `signatures.md`, sorts the lines case-insensitively, and treats each valid line as one signature.
2. Parses each signature line as `- **Name**, role, org`. Lines that don't match are silently skipped.
3. Renders to `<div class="sig">…</div>` cards via `renderCard`, with `escapeHtml` applied to every dynamic field.
4. Reads source `index.html`, splices the cards into the `<!-- SIGNATURES -->` marker and the count into the `__SIG_COUNT__` marker (both defined as named constants at the top of the script).
5. Writes the result to `dist/index.html`.
6. Reads `static/og.svg`, replaces the `{{N_SIGS}}` marker with the formatted count (e.g. `4 signatories`), rasterises to PNG via `@resvg/resvg-js`, and writes `dist/og.png`. Fonts come from the system font stack (the SVG names Roboto; the renderer falls back to a similar sans).

If you change the markdown line format that the form emits, change `parseLine` to match — the build-time parser and the runtime form-builder share a grammar but no code.

### 3. `index.html` — source template

A single file containing inline `<style>` and `<script>`. **This is deliberate** — there are no separate CSS or JS files, no bundler, no module system. Keep it that way unless there's a specific reason to change.

The HTML uses [GOV.UK Frontend v5](https://design-system.service.gov.uk/) loaded from jsDelivr CDN for its components and CSS. **GDS Transport (the GOV.UK font) is intentionally not loaded** — the CSS variable `--kto-sans` overrides it with a system font stack, both for licence reasons (GDS Transport is restricted) and to keep this from looking like an official gov.uk page.

The branding is also distinct on purpose: custom black topbar + square-frame wordmark instead of `govuk-header` (which would render the Crown). The phase banner reads "Open letter" so the page is read as commentary, not impersonation.

### 4. The signing flow

Visitors fill in the form (Name, Email, Evidence, optional Role and Organisation). Submissions go via `POST /sign` to the Worker, which emails the moderators (via Cloudflare's native `send_email` binding). **Submissions are not committed anywhere** — public git history must not contain rejected/pending entries. The moderator reads the email, decides, and if approved appends a line to `signatures.md` using the markdown grammar (`- **Name**, role, org`). The Worker's email body suggests the line to add.

The on-page form is **progressively enhanced**:

- With JS on: the form posts JSON to `/sign`, renders inline GOV.UK error styling on validation failure, swaps in a confirmation panel on success. Cloudflare Turnstile gates submission.
- With JS off: the Submit button is hidden via CSS (`.no-js .kto-js-only { display: none }`), and only a **Sign by email** `mailto:` button is visible — the inline JS still keeps its `href` refreshed from the form fields. The `mailto:` path bypasses Turnstile and the evidence-field requirement by design; the moderator handles whatever lands.

When extending the form, preserve the no-JS path. Anything that requires JS to be functional is a regression of the site's progressive-enhancement contract.

## Conventions

### Commits

Use Conventional Commits. Title is "what", body is "why":

- Check `git log -n 5` first to match existing style
- Subject ≤50 chars (including prefix): `feat: Add thing`
- Capitalize after prefix: `feat: Add thing` not `feat: add thing`
- Blank line, then 1–3 sentence description of *why*, no bullet points
- Always `git add` and `git commit` as separate commands

### Pull requests

- Short essay (a few paragraphs) describing why the changes are needed
- Don't hard-wrap PR body — GitHub reflows markdown in the browser

### Code style

- **Almost never write comments.** Well-named identifiers do the job. Only add a comment when the *why* is non-obvious — a hidden constraint, a workaround, behavior that would surprise a reader. Don't narrate what the code does.
- Inline JS in `index.html` uses `var` and IIFE wrapping. Keep it that way to match the prototype style.
- The build script is ESM and only depends on `node:fs/promises` plus `@resvg/resvg-js` (for the OpenGraph rasteriser).

### Branding constraints

- **No Crown logo.** Don't add `govuk-header`, the GOV.UK Crown SVG, or anything that resembles official gov.uk branding.
- **No GDS Transport or NHS Frutiger.** System fonts only. The Google Fonts request chain has been deliberately removed — don't add it back.
- Colour customisation away from GDS defaults (e.g. swapping the green primary button for NHS-blue) is a known later concern.

### Files and directories

- `signatures.md` — source of truth for signatures, one markdown line per signature. The build sorts lines case-insensitively before rendering; `parseLine` skips invalid lines silently.
- `static/*` — checked-in source assets (the OpenGraph SVG template `og.svg`, etc.). Copied verbatim into `dist/` by the build. `dist/og.png` is rasterised at build time from `static/og.svg` with the `{{N_SIGS}}` marker filled in; it is not checked in.
- `dist/` — generated by the build, gitignored, served by Wrangler. Don't edit by hand.
- `tmp/` — scratch directory for downloads/intermediate artifacts (gitignored except `tmp/.keep`). Use this rather than `/tmp` for project-scoped scratch files.
- `mise.toml` — tools (bun, wrangler), tasks (`build` / `dev` / `deploy`), and local-dev env vars. Replaces `.dev.vars`.
- `.claude/worktrees/` — gitignored; created by the Worktree tooling.
