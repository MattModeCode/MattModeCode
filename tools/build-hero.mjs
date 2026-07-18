#!/usr/bin/env node
// build-hero.mjs — generates assets/hero.svg, the animated hero banner for the
// GitHub profile README.
//
// Run: node tools/build-hero.mjs   (also invoked by .github/workflows/refresh.yml)
//
// Four constraints drive every odd-looking decision below:
//
//  1. GitHub renders README images through <img>, i.e. SVG "secure static mode":
//     no <script>, no external fetches (fonts, stylesheets, images), no JS.
//     CSS @keyframes and SMIL DO still run, so all motion comes from those two.
//  2. <foreignObject> renders BLANK in Safari inside <img>. Native SVG
//     primitives only — no HTML-in-SVG shortcuts for text layout.
//  3. The webfont must be a data: URI or it silently falls back to system mono
//     and the monospace column alignment collapses.
//  4. Everything is authored IN ITS FINAL VISIBLE STATE, and keyframes run
//     *from* the hidden state *to* that final state with fill-mode:both. That
//     way `@media (prefers-reduced-motion:reduce){*{animation:none}}` leaves a
//     complete, fully legible static image instead of a blank rectangle.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..'); // resolve from the script, not the cwd

// ---------------------------------------------------------------- helpers ---

const r2 = (n) => Math.round(n * 100) / 100;

// Escapes XML text content. `"` is included so the same helper is safe to drop
// into an attribute value; `&quot;` renders as a plain quote in text content.
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');

// kids omitted -> self-closing tag; kids given (even '') -> open/close pair.
const el = (name, a = {}, kids) =>
  kids === undefined
    ? `<${name}${attrs(a)}/>`
    : `<${name}${attrs(a)}>${Array.isArray(kids) ? kids.join('') : kids}</${name}>`;

// Deterministic pseudo-noise in [-4, 4]. Keeps the node drift identical across
// runs so the generated SVG is byte-stable when profile.json hasn't changed.
const wobble = (i, k) => {
  const s = Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233) * 43758.5453;
  return r2((s - Math.floor(s)) * 8 - 4);
};

// ------------------------------------------------------------------ input ---

const profile = JSON.parse(readFileSync(join(ROOT, 'profile.json'), 'utf8'));
const b64 = readFileSync(join(HERE, 'jetbrains-mono-subset.b64'), 'utf8').trim();

const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// MashuAI brand palette — exact, do not substitute.
const C = {
  ground: '#0a0a0f',
  body: '#0f0f14',
  text: '#e2e8f0',
  dim: '#94a3b8',
  faint: '#475569',
  mark: '#e1e0e0',
  hair: 'rgba(226,232,240,0.12)',
  hairSoft: 'rgba(226,232,240,0.10)',
};

// ---------------------------------------------------------------- geometry ---

const W = 1200;
const H = 460;
const TERM = { x: 60, y: 54, width: 1080, height: 352, rx: 8 };

const NODES = [
  [700, 130], [820, 90], [760, 220], [900, 180], [1020, 110], [960, 280],
  [1080, 220], [840, 320], [700, 350], [1050, 350], [890, 380], [620, 250],
  [1120, 300], [780, 400],
];

const EDGES = [
  [11, 0], [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6],
  [5, 6], [2, 7], [3, 7], [7, 5], [7, 10], [8, 11], [8, 13], [13, 10],
  [10, 9], [9, 5], [9, 12], [6, 12], [0, 8], [5, 12],
];

// Edges that carry a travelling pulse, with staggered SMIL start times.
const PULSES = [
  { edge: [11, 0], begin: '0s' },
  { edge: [1, 3], begin: '0.9s' },
  { edge: [3, 5], begin: '1.6s' },
  { edge: [7, 10], begin: '2.3s' },
  { edge: [9, 12], begin: '2.9s' },
];

// The MashuAI M: four equal-weight strokes in a 256 box (two verticals meeting
// two diagonals at a centre valley). Rendered at 44px via scale(0.172).
const MARK = [
  [58, 190, 58, 78],
  [58, 78, 128, 146],
  [128, 146, 198, 78],
  [198, 78, 198, 190],
];
const MARK_DELAYS = [0.35, 0.5, 0.65, 0.8];

const len = (ax, ay, bx, by) => r2(Math.hypot(bx - ax, by - ay));

// ------------------------------------------------------------------- copy ---

const { school } = profile;
// Drop the "incoming" qualifier once term has actually started. ISO date
// strings compare correctly as plain strings, so no Date maths is needed.
const today = new Date().toISOString().slice(0, 10);
const schoolLine = [
  today >= school.startsISO ? null : school.prefix,
  school.program,
  '@',
  school.institution,
  school.gradYear,
]
  .filter(Boolean)
  .join(' ');

const headline = `${profile.name} · ${profile.location}`;

// Monospace advance width is 0.6em, so a 16px command occupies 9.6px/char.
// That constant drives both the typing clip width and its step count.
const CHAR16 = 9.6;
const cmd = profile.command;
const cmdWidth = r2(cmd.length * CHAR16);

// -------------------------------------------------------------------- css ---
// Authored with zero `&`, `<` or `>` characters so it needs no CDATA wrapper
// and stays valid whether the file is parsed as XML (the <img> case) or ever
// gets pasted inline into HTML.

const css = [];

css.push(
  `@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:400;font-style:normal;}`,
  `text{font-family:${FONT};}`,
);

// Draw-in: shared timing on the class, per-element keyframes for the exact
// path length. Per-element @keyframes (rather than one rule reading a CSS
// custom property) keeps this working on every renderer without relying on
// var() substitution inside keyframes.
css.push(`.edge{animation-duration:.9s;animation-timing-function:ease-out;animation-fill-mode:both}`);
EDGES.forEach(([a, b], i) => {
  const L = len(...NODES[a], ...NODES[b]);
  css.push(`#e${i}{animation-name:de${i};animation-delay:${r2(0.5 + i * 0.045)}s}`);
  css.push(`@keyframes de${i}{from{stroke-dashoffset:${L}}to{stroke-dashoffset:0}}`);
});

// Node fade lives on the wrapping <g> so it cannot clobber the circle's
// authored opacity:0.95. Drift rides the same <g> on a different property.
css.push(`@keyframes nfade{from{opacity:0}to{opacity:1}}`);
NODES.forEach((_, i) => {
  const dur = 18 + (i % 5) * 2;
  const delay = r2(-(i * 2.37));
  css.push(
    `#n${i}{animation:nfade .4s ease-out ${r2(0.4 + i * 0.05)}s both,` +
      `dr${i} ${dur}s linear ${delay}s infinite alternate}`,
  );
  const stops = [25, 50, 75, 100]
    .map((pct, k) => `${pct}%{transform:translate(${wobble(i, k)}px,${wobble(i, k + 4)}px)}`)
    .join('');
  css.push(`@keyframes dr${i}{0%{transform:translate(0,0)}${stops}}`);
});

// Mark strokes draw in the reading order of the glyph.
css.push(`.mk{animation-duration:.45s;animation-timing-function:ease-out;animation-fill-mode:both}`);
MARK.forEach((seg, i) => {
  css.push(`#m${i}{animation-name:dm${i};animation-delay:${MARK_DELAYS[i]}s}`);
  css.push(`@keyframes dm${i}{from{stroke-dashoffset:${len(...seg)}}to{stroke-dashoffset:0}}`);
});

// Typewriter: a clip rect whose width steps one character at a time.
css.push(`#typerect{animation:type .75s steps(${cmd.length}) .95s both}`);
css.push(`@keyframes type{from{width:0}to{width:${cmdWidth}}}`);

// Output rows. Only `translate` is animated — no transform-box/transform-origin
// dependency, which is unreliable on SVG across renderers.
css.push(`.ln{animation:rise .12s ease-out both}`);
css.push(`@keyframes rise{from{opacity:0;transform:translate(0,2px)}to{opacity:1;transform:translate(0,0)}}`);
for (let i = 0; i < 6; i += 1) css.push(`#o${i}{animation-delay:${r2(1.85 + i * 0.11)}s}`);

// Cursor: fades in once the output has landed, then blinks. The blink is later
// in the list so it wins on opacity from 2.66s onward.
css.push(`#cursor{animation:cfade .18s ease-out 2.48s both,blink 1.06s steps(1) 2.66s infinite alternate}`);
css.push(`@keyframes cfade{from{opacity:0}to{opacity:1}}`);
css.push(`@keyframes blink{from{opacity:1}to{opacity:0}}`);

// Reduced motion: kill every CSS animation (leaving the authored final state)
// and hide the SMIL pulses, which CSS cannot stop.
css.push(`@media (prefers-reduced-motion: reduce){*{animation:none !important;}.pulse{display:none;}}`);

// -------------------------------------------------------------------- defs ---

const defs = [
  // Clips the mesh to the terminal window.
  el('clipPath', { id: 'termclip' }, el('rect', { ...TERM })),
  // Horizontal fade so the mesh is invisible behind the text column and
  // strongest on the right. White + stop-opacity works under both luminance
  // and alpha mask models; a black-to-white ramp only works under luminance.
  el('linearGradient', { id: 'meshfade', gradientUnits: 'userSpaceOnUse', x1: 620, y1: 0, x2: 780, y2: 0 }, [
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0' }),
    el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '1' }),
  ]),
  el('mask', { id: 'meshmask' }, el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#meshfade)' })),
  // Typewriter clip. width is authored at its final value; CSS animates it up.
  el('clipPath', { id: 'type' }, el('rect', { id: 'typerect', x: 176, y: 122, width: cmdWidth, height: 26 })),
  // Unpainted motion paths for the pulses.
  ...PULSES.map(({ edge: [a, b] }, i) =>
    el('path', {
      id: `pp${i}`,
      d: `M ${NODES[a][0]} ${NODES[a][1]} L ${NODES[b][0]} ${NODES[b][1]}`,
      fill: 'none',
      stroke: 'none',
    }),
  ),
];

// -------------------------------------------------------------------- mesh ---

const meshEdges = EDGES.map(([a, b], i) => {
  const [ax, ay] = NODES[a];
  const [bx, by] = NODES[b];
  const L = len(ax, ay, bx, by);
  return el('line', {
    id: `e${i}`,
    class: 'edge',
    x1: ax, y1: ay, x2: bx, y2: by,
    stroke: C.text,
    'stroke-width': 1,
    opacity: 0.72,
    'stroke-dasharray': L,
    'stroke-dashoffset': 0, // final state; keyframes start it at L
  });
});

const meshNodes = NODES.map(([cx, cy], i) =>
  el('g', { id: `n${i}` }, el('circle', { cx, cy, r: 2.5, fill: C.text, opacity: 0.95 })),
);

// Pulses are authored at opacity 0: a travelling dot is pure motion and has no
// meaningful resting position, so it must not appear in a static render.
const meshPulses = el(
  'g',
  { class: 'pulse' },
  PULSES.map(({ begin }, i) =>
    el('circle', { r: 1.6, fill: C.text, opacity: 0 }, [
      el('animateMotion', { dur: '3.2s', repeatCount: 'indefinite', begin }, el('mpath', {
        href: `#pp${i}`,
        'xlink:href': `#pp${i}`, // legacy renderers still want the xlink form
      })),
      el('animate', {
        attributeName: 'opacity',
        values: '0;1;1;0',
        keyTimes: '0;0.15;0.85;1',
        dur: '3.2s',
        repeatCount: 'indefinite',
        begin,
      }),
    ]),
  ),
);

const mesh = el(
  'g',
  { 'clip-path': 'url(#termclip)' },
  el('g', { mask: 'url(#meshmask)', opacity: 0.6 }, [...meshEdges, ...meshNodes, meshPulses]),
);

// ------------------------------------------------------------------ chrome ---

const chrome = [
  el('line', { x1: 60, y1: 88, x2: 1140, y2: 88, stroke: C.hairSoft, 'stroke-width': 1 }),
  // Monochrome window dots — no traffic-light colours; the brand keeps colour
  // for meaning, not decoration.
  ...[[86, 0.9], [106, 0.65], [126, 0.45]].map(([cx, o]) =>
    el('circle', { cx, cy: 71, r: 5, fill: C.faint, opacity: o }),
  ),
  el(
    'text',
    { x: 600, y: 76, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 13, fill: C.dim, opacity: 0.7 },
    esc(profile.prompt),
  ),
];

const mark = el(
  'g',
  { transform: 'translate(92,112) scale(0.172)', fill: 'none', stroke: C.mark, 'stroke-width': 23, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  MARK.map((seg, i) =>
    el('path', {
      id: `m${i}`,
      class: 'mk',
      d: `M ${seg[0]} ${seg[1]} L ${seg[2]} ${seg[3]}`,
      'stroke-dasharray': len(...seg),
      'stroke-dashoffset': 0,
    }),
  ),
);

// -------------------------------------------------------------------- text ---

const txt = (x, y, size, fill, content, extra = {}) =>
  el('text', { x, y, 'font-family': FONT, 'font-size': size, fill, ...extra }, esc(content));

const commandLine = [
  txt(156, 141, 16, C.faint, '$'),
  el('g', { 'clip-path': 'url(#type)' }, txt(176, 141, 16, C.text, cmd)),
];

// Six output rows, each wrapped so the fade/translate cannot fight the text's
// own paint attributes.
const row = (i, kids) => el('g', { id: `o${i}`, class: 'ln' }, kids);

const output = [
  row(0, txt(156, 196, 15, C.text, headline)),
  row(1, txt(156, 222, 14, C.dim, schoolLine)),
  ...profile.lines.map((l, i) =>
    row(2 + i, [
      txt(156, 264 + i * 26, 14, C.dim, l.label),
      txt(250, 264 + i * 26, 14, C.text, l.value),
    ]),
  ),
];

const cursor = el('rect', { id: 'cursor', x: 156, y: 356, width: 9, height: 18, fill: C.text });

// --------------------------------------------------------------------- svg ---

const svg = el(
  'svg',
  {
    xmlns: 'http://www.w3.org/2000/svg',
    'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    role: 'img',
    'aria-labelledby': 'ttl dsc',
  },
  [
    el('title', { id: 'ttl' }, esc(`${profile.name} — ${schoolLine}, ${profile.lines[0].value}`)),
    el(
      'desc',
      { id: 'dsc' },
      esc(
        `A dark terminal window titled "${profile.prompt}" running the command "${cmd}". ` +
          `It prints: ${headline}; ${schoolLine}; ` +
          profile.lines.map((l) => `${l.label}, ${l.value}`).join('; ') +
          '. A slowly drifting network of nodes and connecting lines fills the right side of the window.',
      ),
    ),
    el('defs', {}, defs),
    el('style', {}, css.join('\n')),
    // Order matters: ground, then the terminal body, then the mesh painted on
    // top of it (clipped + masked), then chrome and text above everything.
    el('rect', { x: 0, y: 0, width: W, height: H, rx: 12, fill: C.ground }),
    el('rect', { ...TERM, fill: C.body, 'fill-opacity': 0.93, stroke: C.hair, 'stroke-width': 1 }),
    mesh,
    ...chrome,
    mark,
    ...commandLine,
    ...output,
    cursor,
  ],
);

// ------------------------------------------------------------------- write ---

const out = join(ROOT, 'assets', 'hero.svg');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${svg}\n`, 'utf8');
console.log(`hero.svg: ${Buffer.byteLength(svg) + 1} bytes`);
