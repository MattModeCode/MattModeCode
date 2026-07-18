#!/usr/bin/env node
// Renders assets/grid.svg — the last 60 days of contributions, as one row.
//
// Not a year calendar, on purpose. A 365-day grid on this account is ~92% empty
// cells, which reads as ten months of nothing when the truth is the opposite:
// almost all of the work is recent and dense. The year view was answering
// "how consistent has this been forever" when the honest story is velocity, so
// the window shrank to where the data actually lives.
//
// GitHub's own calendar encodes intensity in green. Here a single hue does the
// work through opacity alone, which is the brand's rule: colour carries status,
// never decoration.

import { join } from 'node:path';
import {
  C, ROOT_DIR, el, svgDocument, writeSvg, fetchProfile, fontFace, textWidth, run,
  REDUCED_MOTION, TEXT_BASE,
} from './lib.mjs';

// --- layout -----------------------------------------------------------------
const W = 1200;
const H = 150;
const M = 40; // content margin, shared with render-stats.mjs so the two cards align

const WINDOW = 60; // days shown; one cell each, left to right, oldest to newest

const CELL = 15;
const PITCH = 18; // 15px cell + 3px gap
const RX = 3;
const GX = 60; // 60 cells x 18px pitch = 1080, so the row spans the card
const GY = 44;

const HEAD_Y = 28; // "activity", mirrors the "languages" header on the stats card
const TICK_Y = 78; // date ticks under the row
const CAP_Y = 106; // caption line 1
const CAP2_Y = 126; // caption line 2

const TICK_EVERY = 10; // one dated tick per N cells, anchored on the newest day

// The legend keeps the old, smaller cell so it stays subordinate to the data.
const KEY_CELL = 10;
const KEY_PITCH = 14;

// Opacity ramp. Index 0 is "no contributions" and is deliberately not zero —
// the empty cells still have to draw the shape of the window.
const LEVELS = [0.05, 0.22, 0.42, 0.66, 0.92];

const WIPE_DUR = 0.35;
const COL_STEP = 0.014; // per-column delay -> the sweep reads left to right
const BREATHE_CELLS = 7; // the most recent N days keep moving after the wipe
const BREATHE_AMP = 0.12;
const BREATHE_DUR = 7; // full cycle; a 3.5s transit each way

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-06-12" -> "Jun 12". Leading zero dropped; the tick is read, not sorted. */
const shortDate = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

const clamp = (n) => Math.min(1, Math.max(0, Math.round(n * 100) / 100));

/**
 * Quartile boundaries of the non-zero counts, nearest-rank.
 *
 * Thresholds come from the actual distribution rather than fixed counts, so the
 * ramp still spans its full range whether the busiest day is 3 commits or 300.
 */
function quartiles(counts) {
  const sorted = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (p) => sorted[Math.floor((sorted.length - 1) * p)];
  return [at(0.25), at(0.5), at(0.75)];
}

function levelOf(count, qs) {
  if (count <= 0 || !qs) return 0;
  if (count <= qs[0]) return 1;
  if (count <= qs[1]) return 2;
  if (count <= qs[2]) return 3;
  return 4;
}

async function main() {
  const user = await fetchProfile();
  const calendar = user.contributionsCollection.contributionCalendar;
  const restricted = user.contributionsCollection.restrictedContributionsCount;

  // Flatten the week nesting away — the row does not care about week boundaries —
  // and keep the tail. slice handles a short calendar without a special case.
  const days = calendar.weeks.flatMap((w) => w.contributionDays);
  const recent = days.slice(-WINDOW);

  const cols = recent.length;
  const gridRight = GX + (cols - 1) * PITCH + CELL;

  // Every headline number is derived here, from the window that is actually
  // drawn. Nothing about this card is allowed to be a literal.
  const yearTotal = calendar.totalContributions;
  const recentTotal = recent.reduce((sum, d) => sum + d.contributionCount, 0);
  const activeDays = recent.filter((d) => d.contributionCount > 0).length;
  const maxDay = recent.reduce((hi, d) => Math.max(hi, d.contributionCount), 0);

  // Thresholds come from the window, not the year, so the ramp spans the range
  // of what is on screen rather than of days nobody can see.
  const qs = quartiles(recent.map((d) => d.contributionCount));

  const firstBreatheCol = Math.max(0, cols - BREATHE_CELLS);
  let wipeEnd = 0;
  const usedLevels = new Set();
  const breathingLevels = new Set();

  const cells = recent.map((day, col) => {
    const level = levelOf(day.contributionCount, qs);
    const delay = Math.round(col * COL_STEP * 1000) / 1000;
    wipeEnd = Math.max(wipeEnd, delay + WIPE_DUR);
    // Only cells with activity breathe. A pulsing empty square would imply a
    // signal that is not in the data.
    const breathes = col >= firstBreatheCol && level > 0;
    usedLevels.add(level);
    if (breathes) breathingLevels.add(level);
    return { col, level, delay, breathes, day };
  });

  const breatheStart = Math.round(wipeEnd * 100) / 100;

  // Dated ticks, walked back from the newest day so the right edge — the one
  // that means "now" — is always labelled. Month-change marks were the other
  // option but land irregularly and would leave only two or three labels.
  const ticks = [];
  for (let i = cols - 1; i >= 0; i -= TICK_EVERY) {
    ticks.push({ col: i, label: shortDate(recent[i].date) });
  }

  // --- CSS ------------------------------------------------------------------
  // One wipe keyframe per level in use. Every keyframe ends on the level's true
  // opacity, which is also what the rect carries as an attribute — so with
  // motion disabled the grid is already complete.
  const css = [
    fontFace(),
    TEXT_BASE,
    `.lbl{font-size:13px;fill:${C.secondary};letter-spacing:.02em;}`,
    `.tick{font-size:11px;fill:${C.secondary};}`,
    `.cap{font-size:13px;fill:${C.secondary};}`,
    `.key{font-size:11px;fill:${C.secondary};}`,

    ...[...usedLevels].sort().map((l) => {
      const v = LEVELS[l];
      const rules = [
        `.l${l}{animation:w${l} ${WIPE_DUR}s ease-out both;}`,
        `@keyframes w${l}{from{opacity:0;}to{opacity:${v};}}`,
      ];
      if (breathingLevels.has(l)) {
        // Two animations, so the inline animation-delay carries two values.
        // The breathe is a full cycle starting and ending on the cell's resting
        // value: no discontinuity when it takes over from the wipe, and each
        // transit across the range still takes 3.5s.
        rules.push(
          `.l${l}.b{animation:w${l} ${WIPE_DUR}s ease-out both,p${l} ${BREATHE_DUR}s ease-in-out infinite;}`,
          `@keyframes p${l}{0%,100%{opacity:${v};}25%{opacity:${clamp(v + BREATHE_AMP)};}75%{opacity:${clamp(v - BREATHE_AMP)};}}`,
        );
      }
      return rules.join('');
    }),

    `.fade{animation:fade .6s ease-out ${breatheStart.toFixed(2)}s both;}`,
    `@keyframes fade{from{opacity:0;}to{opacity:1;}}`,
    REDUCED_MOTION,
  ].join('');

  // --- legend ---------------------------------------------------------------
  // Right-aligned to the grid's own right edge, so it ties to the thing it
  // explains rather than floating in the gutter.
  const keyW = (LEVELS.length - 1) * KEY_PITCH + KEY_CELL;
  const moreX = gridRight;
  const keyRight = gridRight - textWidth('more', 11) - 8;
  const keyX = keyRight - keyW;
  const keyY = CAP_Y - 9;

  const legend = [
    el('text', { x: keyX - 8, y: CAP_Y, class: 'key', 'text-anchor': 'end' }, 'less'),
    ...LEVELS.map((v, i) =>
      el('rect', {
        x: keyX + i * KEY_PITCH, y: keyY, width: KEY_CELL, height: KEY_CELL,
        rx: 2, fill: C.primary, opacity: v,
      }),
    ),
    el('text', { x: moreX, y: CAP_Y, class: 'key', 'text-anchor': 'end' }, 'more'),
  ];
  // Deliberately NOT .join('')-ed. el() escapes plain-string children and only
  // passes Raw through, so collapsing these to a string here would emit the
  // legend as visible escaped markup instead of as a legend.

  // restrictedContributionsCount is scoped to the whole year, so it can no
  // longer be printed beside a 60-day caption without misattributing it. The
  // count moves to <desc>, where it can be stated with its real scope, and the
  // card keeps only the claim that is true at any window.
  const note = 'private contributions are counted when profile visibility allows';
  const descNote =
    restricted > 0
      ? `The year total includes ${restricted} private contributions; ${note}`
      : note;

  // --- body -----------------------------------------------------------------
  const body = [
    el('rect', { width: W, height: H, rx: 12, fill: C.ground }),

    el('text', { x: M, y: HEAD_Y, class: 'lbl' }, 'activity'),

    ...cells.map((c) =>
      el('rect', {
        x: GX + c.col * PITCH,
        y: GY,
        width: CELL,
        height: CELL,
        rx: RX,
        fill: C.primary,
        // The attribute is the truth; the keyframe only walks up to it.
        opacity: LEVELS[c.level],
        class: c.breathes ? `l${c.level} b` : `l${c.level}`,
        style: c.breathes ? `animation-delay:${c.delay}s,${breatheStart}s` : `animation-delay:${c.delay}s`,
      }),
    ),

    // Centred on the cell rather than aligned to its left edge, so the label
    // reads as a tick belonging to that day.
    ...ticks.map((t) =>
      el(
        'text',
        { x: GX + t.col * PITCH + CELL / 2, y: TICK_Y, class: 'tick', 'text-anchor': 'middle' },
        t.label,
      ),
    ),

    el('g', { class: 'fade' }, [
      el(
        'text',
        { x: M, y: CAP_Y, class: 'cap' },
        `${recentTotal} of ${yearTotal} contributions in the last ${cols} days`,
      ),
      el(
        'text',
        { x: M, y: CAP2_Y, class: 'cap' },
        `${activeDays} active days · ${maxDay} on the busiest`,
      ),
      el('g', {}, legend),
    ]),
  ].join('');

  writeSvg(
    join(ROOT_DIR, 'assets', 'grid.svg'),
    svgDocument({
      viewBox: `0 0 ${W} ${H}`,
      title: `Contribution activity over the last ${cols} days`,
      desc:
        `${recentTotal} of ${yearTotal} contributions in the last ${cols} days, drawn as a single row of ` +
        `${cols} cells from oldest to newest where cell opacity encodes the number of contributions that ` +
        `day. ${activeDays} active days, ${maxDay} on the busiest. ` +
        `Dates run from ${shortDate(recent[0].date)} to ${shortDate(recent[cols - 1].date)}. ${descNote}.`,
      css,
      body,
    }),
  );
}

run(main);
