#!/usr/bin/env node
// Renders assets/stats.svg — the language mix and four headline counters.
//
// Deliberately absent: stars, followers, and any rank/grade badge. They measure
// audience rather than work, and the brand does not do trophy chrome. The space
// they would occupy is left as whitespace on purpose.

import { join } from 'node:path';
import {
  C, ROOT_DIR, ADVANCE, el, svgDocument, writeSvg, fetchProfile, languageTotals,
  fontFace, run, REDUCED_MOTION, TEXT_BASE,
} from './lib.mjs';

// --- layout -----------------------------------------------------------------
const W = 1200;
const H = 340;
const M = 40; // content margin, shared with render-grid.mjs so the two cards align

const HEAD_Y = 30; // "languages" baseline
const ROW0 = 58; // centre of the first bar
const ROW_GAP = 38;
const BAR_H = 10;
const TRACK_X = 250;
const TRACK_W = 750; // track spans 250 -> 1000
const PCT_X = 1020;

const DIV_Y = 280; // hairline between the bars and the counter row
const NUM_Y = 310; // counter number baseline
const LBL_Y = 328; // counter label baseline
const CELL_X = [40, 320, 600, 880];

const LANG_SIZE = 14;
const TOP_N = 6;

// Rank -> opacity on the primary hue. One hue, six steps: the ramp alone encodes
// rank, so no language ever gets an arbitrary "its" colour.
const RANK_OPACITY = [1.0, 0.82, 0.66, 0.52, 0.4, 0.3];

// Bars sweep out first, counters land after the last one settles.
const BAR_DUR = 0.9;
const BAR_DELAY0 = 0.15;
const BAR_STAGGER = 0.09;
const COUNTER_START = BAR_DELAY0 + (TOP_N - 1) * BAR_STAGGER + BAR_DUR; // 1.5s

// Longest label that fits between the margin and the track, in glyphs.
const LABEL_MAX = Math.floor((TRACK_X - M - 10) / (LANG_SIZE * ADVANCE));

const nf = new Intl.NumberFormat('en-CA');

/** Trim to what fits. '..' rather than an ellipsis: the font subset has no U+2026. */
const clip = (name) => (name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 2)}..` : name);

async function main() {
  const user = await fetchProfile();
  const repos = user.repositories.nodes;

  const all = languageTotals(repos);
  const top = all.slice(0, TOP_N);
  // Two denominators, on purpose — the label and the bar answer different
  // questions and sharing a denominator would make one of them lie.
  //
  // Label: share of every language's bytes, including the ones off the bottom
  // of the list. It is the number someone gets if they go and check, so it is
  // the only one worth printing.
  const grandTotal = all.reduce((sum, [, bytes]) => sum + bytes, 0);
  // Width: share of the largest language, so the top bar fills the track and
  // the rest are read against it. Widths encoding share-of-total would leave
  // the track mostly empty and spend the chart's whole area saying nothing.
  const maxBytes = top.length > 0 ? top[0][1] : 0;

  const bars = top.map(([name, bytes], i) => {
    const centre = ROW0 + i * ROW_GAP;
    const share = grandTotal > 0 ? bytes / grandTotal : 0;
    // One rounded number feeds both the rect attribute and its keyframe, so the
    // animated and the static (reduced-motion) end states cannot drift apart.
    const width = Math.round((maxBytes > 0 ? bytes / maxBytes : 0) * TRACK_W * 100) / 100;
    return { name, i, centre, share, width, opacity: RANK_OPACITY[i] ?? 0.3 };
  });

  const counters = [
    [user.contributionsCollection.contributionCalendar.totalContributions, 'contributions'],
    [user.repositories.totalCount, 'repositories'],
    [repos.reduce((sum, r) => sum + r.releases.totalCount, 0), 'releases'],
    [all.length, 'languages'],
  ];

  // --- CSS ------------------------------------------------------------------
  const css = [
    fontFace(),
    TEXT_BASE,
    `.lbl{font-size:13px;fill:${C.secondary};letter-spacing:.02em;}`,
    `.lang{font-size:${LANG_SIZE}px;fill:${C.primary};}`,
    `.pct{font-size:13px;fill:${C.secondary};}`,
    `.num{font-size:26px;fill:${C.primary};}`,
    `.cap{font-size:12px;fill:${C.secondary};letter-spacing:.02em;}`,
    // Each bar gets its own keyframe because each has its own target width.
    ...bars.map(
      (b) =>
        `.bar${b.i}{animation:grow${b.i} ${BAR_DUR}s cubic-bezier(.2,.7,.3,1) ${(BAR_DELAY0 + b.i * BAR_STAGGER).toFixed(2)}s both;}` +
        `@keyframes grow${b.i}{from{width:0;}to{width:${b.width}px;}}`,
    ),
    `.rise{animation:rise .5s ease-out both;}`,
    `@keyframes rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}`,
    `.fade{animation:fade .5s ease-out ${COUNTER_START.toFixed(2)}s both;}`,
    `@keyframes fade{from{opacity:0;}to{opacity:1;}}`,
    REDUCED_MOTION,
  ].join('');

  // --- body -----------------------------------------------------------------
  const body = [
    el('rect', { width: W, height: H, rx: 12, fill: C.ground }),
    el('text', { x: M, y: HEAD_Y, class: 'lbl' }, 'languages'),

    ...bars.flatMap((b) => [
      // Track. Authored at full width and never animated, so it reads as the
      // container the fill grows into.
      el('rect', {
        x: TRACK_X, y: b.centre - BAR_H / 2, width: TRACK_W, height: BAR_H,
        rx: 3, fill: C.primary, 'fill-opacity': 0.06,
      }),
      // Fill. width= is the final value; the keyframe only walks up to it.
      el('rect', {
        x: TRACK_X, y: b.centre - BAR_H / 2, width: b.width, height: BAR_H,
        rx: 3, fill: C.primary, 'fill-opacity': b.opacity, class: `bar${b.i}`,
      }),
      el('text', { x: M, y: b.centre + 5, class: 'lang' }, clip(b.name)),
      el('text', { x: PCT_X, y: b.centre + 4.5, class: 'pct' }, `${(b.share * 100).toFixed(1)}%`),
    ]),

    el('line', {
      x1: M, y1: DIV_Y, x2: W - M, y2: DIV_Y,
      stroke: C.hairline, 'stroke-width': 1, class: 'fade',
    }),

    ...counters.flatMap(([value, label], i) => {
      const style = `animation-delay:${(COUNTER_START + i * 0.08).toFixed(2)}s`;
      return [
        el('text', { x: CELL_X[i], y: NUM_Y, class: 'num rise', style }, nf.format(value)),
        el('text', { x: CELL_X[i], y: LBL_Y, class: 'cap rise', style }, label),
      ];
    }),
  ].join('');

  const summary = top.map(([name], i) => `${name} ${(bars[i].share * 100).toFixed(1)}%`).join(', ');

  writeSvg(
    join(ROOT_DIR, 'assets', 'stats.svg'),
    svgDocument({
      viewBox: `0 0 ${W} ${H}`,
      title: 'Language mix and activity totals',
      desc:
        `Top ${top.length} of ${all.length} languages by bytes across all repositories including private ones, ` +
        `each shown as a percentage of the bytes in every language: ${summary}. ` +
        `Bar length is relative to the largest language rather than to the total. ` +
        counters.map(([v, l]) => `${nf.format(v)} ${l}`).join(', ') + '.',
      css,
      body,
    }),
  );
}

run(main);
