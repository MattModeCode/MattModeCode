// Shared helpers for the profile SVG renderers.
//
// Both renderers emit standalone .svg files that GitHub serves through its image
// proxy and the README embeds via <img>. That embedding mode is the source of
// every constraint in here:
//   - no <script> (never executed for <img>-embedded SVG)
//   - no <foreignObject> (renders blank in Safari)
//   - no external references (fonts/CSS/images are fetched from nowhere)
// So: native SVG primitives, CSS @keyframes for motion, and the webfont inlined
// as a data: URI.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export const TOOLS_DIR = import.meta.dirname;
export const ROOT_DIR = join(TOOLS_DIR, '..');

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

// MashuAI palette. Monochrome by contract: a single-hue opacity ramp on PRIMARY
// carries all data encoding, because in this brand colour means status, never
// decoration.
export const C = {
  ground: '#0a0a0f',
  surface: '#0f0f14',
  primary: '#e2e8f0',
  secondary: '#94a3b8', // ~7.9:1 on ground — the only safe colour for small text
  dim: '#475569', // ~2.9:1 on ground — FAILS AA, decorative strokes only, never text
  hairline: 'rgba(226,232,240,0.12)',
};

export const FONT_STACK = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// JetBrains Mono advance width is 0.6em at every size. Lets us predict text
// extents and keep things from colliding without measuring.
export const ADVANCE = 0.6;
export const textWidth = (str, size) => str.length * size * ADVANCE;

/**
 * The inline @font-face rule. An <img>-embedded SVG cannot fetch a font, so the
 * subset woff2 (see subset-font.sh) rides along as base64. Regular only — the
 * brand takes emphasis from colour and size, not weight, so a second face would
 * be dead bytes.
 */
export function fontFace() {
  const path = join(TOOLS_DIR, 'jetbrains-mono-subset.b64');
  let b64;
  try {
    b64 = readFileSync(path, 'utf8').trim();
  } catch (err) {
    throw new Error(`could not read the font subset at ${path}\n  run tools/subset-font.sh to regenerate it\n  (${err.message})`);
  }
  if (!b64) throw new Error(`the font subset at ${path} is empty — run tools/subset-font.sh`);
  return `@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:400;}`;
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

/** Markup that is already safe to emit verbatim. */
export class Raw {
  constructor(value) {
    this.value = String(value);
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new Raw(value);

export const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch],
  );

// Keeps float noise (415.30000000000007) out of attribute values.
const fmtAttr = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));

/**
 * Element builder. Escaping is the default and opting out is explicit: a string
 * child is escaped, a Raw child (i.e. anything el() returned) passes through.
 * That ordering makes "forgot to escape" the unlikely mistake rather than the
 * easy one.
 *
 * Attributes that are null/undefined/false are dropped, so callers can inline
 * conditionals without building attribute objects by hand.
 */
export function el(tag, attrs = {}, children) {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ` ${k}="${esc(fmtAttr(v))}"`)
    .join('');

  if (children === undefined || children === null) return raw(`<${tag}${a}/>`);

  const inner = (Array.isArray(children) ? children : [children])
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (c instanceof Raw ? c.value : esc(c)))
    .join('');

  return raw(`<${tag}${a}>${inner}</${tag}>`);
}

/**
 * Assemble a complete SVG document.
 *
 * <title> and <desc> come first so assistive tech reads them before any shape,
 * and role="img" collapses the shape soup into a single labelled graphic.
 */
export function svgDocument({ viewBox, title, desc, css, body }) {
  // The CSS lives in a plain <style> with no CDATA wrapper, which is only valid
  // while it contains no XML-special characters. Base64 never does and neither
  // does our generated CSS, but assert rather than trust — a stray '&' would
  // make the whole file unparseable as XML and render as a broken image.
  if (/[<&]/.test(css)) {
    throw new Error('generated CSS contains < or &, which would break XML parsing of the SVG');
  }

  const [, , w, h] = viewBox.split(/\s+/);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(viewBox)}" width="${esc(w)}" height="${esc(h)}" ` +
    `role="img" aria-labelledby="t d">` +
    el('title', { id: 't' }, title) +
    el('desc', { id: 'd' }, desc) +
    el('style', {}, raw(css)) +
    body +
    `</svg>`
  );
}

/**
 * Disable-motion escape hatch. Every element in these files is authored in its
 * final visible state and every keyframe runs hidden -> visible with
 * fill-mode:both, so switching animation off yields the complete image rather
 * than a blank one. The `animation:none` shorthand also resets the per-element
 * inline animation-delay, and !important outranks it.
 */
export const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce){*{animation:none !important;}}';

/** font-family on the element selector, so no text can be authored without the fallback stack. */
export const TEXT_BASE = `text{font-family:${FONT_STACK};font-weight:400;}`;

export function writeSvg(outPath, markup) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markup, 'utf8');
  console.log(`${basename(outPath)}: ${Buffer.byteLength(markup, 'utf8')} bytes`);
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export const LOGIN = 'MattModeCode';

// One query serves both renderers; each uses the slice it needs. Private repos
// are included on purpose — the token is the owner's, and the point of the card
// is to represent all the work, not just the public half.
const QUERY = `query {
  user(login: "${LOGIN}") {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
      restrictedContributionsCount
      totalCommitContributions
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      nodes {
        name
        isPrivate
        languages(first: 10) { edges { size node { name } } }
        releases { totalCount }
      }
    }
  }
}`;

export async function fetchProfile() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is not set — this script reads the GitHub GraphQL API and cannot run without it.\n' +
        '  local:  GITHUB_TOKEN=$(gh auth token) node tools/render-stats.mjs\n' +
        '  CI:     pass secrets.GITHUB_TOKEN in .github/workflows/refresh.yml',
    );
  }

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'User-Agent': 'MattModeCode-profile',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`GitHub GraphQL returned HTTP ${res.status} ${res.statusText}\n  ${detail}`);
  }

  const payload = await res.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL errors:\n  ${payload.errors.map((e) => e.message).join('\n  ')}`);
  }
  if (!payload.data?.user) {
    throw new Error(`GitHub GraphQL returned no user for login "${LOGIN}"`);
  }
  return payload.data.user;
}

/** Sum language bytes across every repo, including private ones. */
export function languageTotals(repos) {
  const totals = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      totals.set(node.name, (totals.get(node.name) ?? 0) + size);
    }
  }
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Run a renderer, and make any failure loud and legible rather than a stack trace. */
export async function run(main) {
  try {
    await main();
  } catch (err) {
    console.error(`\nerror: ${err.message}\n`);
    process.exit(1);
  }
}
