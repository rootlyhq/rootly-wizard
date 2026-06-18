import { createElement as h, useEffect, useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { palette, shimmerRamp } from '../theme.js';

// The Rootly sprout, rasterized from assets/rootly-logo-glyph.png and pattern-
// matched to Unicode half-blocks (▀ ▄ █) with a denoise pass to drop 1px tip
// specks. Rendered at 19x8 — half the earlier 38x15 — to keep the banner compact
// while still showing all six leaflets. Regenerate with
// `node scripts/generate-logo-art.mjs 19 8`.
const LOGO = [
  '        ▄█▄',
  '    ▄▄  ███  ▄▄',
  '    ▀██  ▀  ██▀',
  ' ▄▄▄▄    ▄    ▄▄▄▄',
  '  ▀▀▀   ███   ▀▀▀',
  '▄▄▄▄▄▄▄  ▀  ▄▄▄▄▄▄▄',
  '▀▀▀▀▀▀▀██▄██▀▀▀▀▀▀▀',
  '        ███'
];
const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));
// Pad every line to the same width: rendered in a centered column, unequal-length
// lines would each be centered on their own width and drift horizontally.
const LOGO_LINES = LOGO.map((line) => line.padEnd(LOGO_WIDTH));

// Small single-line tagline under the sprout (the app name already lives in the
// top-left header, so the hero says what the wizard does instead of repeating it).
const TAGLINE = 'Your guided Rootly setup';

// Bright-to-brand trail behind the reveal crest (white → brand purple, via
// the P200/P300/P500 brand tints).
const CREST = ['#FFFFFF', '#E0DAFB', '#C9BEF7', '#9D86F0', palette.brand];
const REVEAL_STEP = 1;

// Glimmer band swept diagonally across the sprout: a bright crest tapering back
// to brand purple. Centered on the band's middle index.
const GLIMMER = ['#9D86F0', '#C9BEF7', '#E0DAFB', '#FFFFFF', '#E0DAFB', '#C9BEF7', '#9D86F0'];
const GLIMMER_CENTER = (GLIMMER.length - 1) / 2;
// Diagonal span of the sprout plus a gap, so the glimmer sweeps then rests.
const GLIMMER_PERIOD = LOGO_WIDTH + LOGO.length + 16;

// Bloom-in on startup: the sprout grows outward from its base, brightest at the
// expanding edge and settling to brand purple behind it — then the resting
// glimmer takes over. Rows count ~2x columns (cells are taller than wide) so the
// bloom front stays visually round.
const BLOOM_ORIGIN_ROW = LOGO.length - 1;
const BLOOM_ORIGIN_COL = (LOGO_WIDTH - 1) / 2;
const bloomDistance = (row, col) => Math.hypot((BLOOM_ORIGIN_ROW - row) * 2, col - BLOOM_ORIGIN_COL);
const BLOOM_MAX = Math.max(
  ...LOGO_LINES.flatMap((line, row) =>
    [...line].map((ch, col) => (ch === ' ' ? 0 : bloomDistance(row, col)))
  )
);
const BLOOM_SPEED = 1.2; // distance units revealed per frame
const BLOOM_FRAMES = Math.ceil((BLOOM_MAX + CREST.length) / BLOOM_SPEED);

export function Banner() {
  const { columns } = useWindowSize();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 70);
    return () => clearInterval(timer);
  }, []);

  // Glimmer front sweeps along the diagonal (col + row); cells near it brighten.
  const glimmerFront = frame % GLIMMER_PERIOD;
  const glimmerColor = (row, col) => {
    const idx = (col + row) - glimmerFront + GLIMMER_CENTER;
    return idx >= 0 && idx < GLIMMER.length ? GLIMMER[idx] : palette.brand;
  };

  // Startup bloom: reveal cells outward from the base (bright at the growing
  // edge, settling to brand). Once it finishes, fall straight through to the
  // resting glimmer — so the eventual shape is exactly what we have today.
  const bloomFront = frame * BLOOM_SPEED;
  const bloomDone = frame > BLOOM_FRAMES;
  const cellColor = (row, col) => {
    if (bloomDone) return glimmerColor(row, col);
    const edge = bloomFront - bloomDistance(row, col);
    if (edge < 0) return null; // not yet bloomed — render blank
    return CREST[Math.min(Math.floor(edge), CREST.length - 1)];
  };

  // Equal-width lines, each in its own Box, so the centered column lays the
  // sprout out as one solid block (no per-line horizontal drift). Each ink cell
  // is its own Text so the glimmer can light it up as the band passes.
  const sprout = h(
    Box,
    // Breathing room above the sprout and between it and the tagline.
    { flexDirection: 'column', alignItems: 'center', marginTop: 1, marginBottom: 1 },
    ...LOGO_LINES.map((line, row) =>
      h(
        Box,
        { key: `logo-${row}` },
        ...[...line].map((char, col) => {
          if (char === ' ') return h(Text, { key: `l-${col}` }, ' ');
          const color = cellColor(row, col);
          return color === null
            ? h(Text, { key: `l-${col}` }, ' ')
            : h(Text, { key: `l-${col}`, color }, char);
        })
      )
    )
  );

  // Sprout too wide for this terminal: just the small wordmark with a sparkle.
  if ((columns || 80) < LOGO_WIDTH + 4) {
    return h(
      Box,
      { marginBottom: 1 },
      h(Text, { color: palette.brand, bold: true }, '✦ Rootly Wizard')
    );
  }

  const ramp = shimmerRamp;
  // The tagline writes on after the sprout has finished blooming.
  const reveal = (frame - BLOOM_FRAMES) * REVEAL_STEP;
  const settled = reveal > TAGLINE.length + CREST.length;

  const colorFor = (col) => {
    if (settled) {
      // Faint resting shimmer once fully revealed (slow, low-contrast).
      const idx = (((col - Math.floor(frame / 3)) % ramp.length) + ramp.length) % ramp.length;
      return ramp[idx];
    }
    const dist = reveal - col;
    return dist >= 0 && dist < CREST.length ? CREST[dist] : palette.brand;
  };

  return h(
    Box,
    { flexDirection: 'column', alignItems: 'center', marginBottom: 1 },
    sprout,
    h(
      Box,
      null,
      ...TAGLINE.split('').map((char, col) => {
        if (char === ' ' || (!settled && col > reveal)) {
          return h(Text, { key: `c-${col}` }, ' ');
        }
        return h(Text, { key: `c-${col}`, bold: true, color: colorFor(col) }, char);
      })
    )
  );
}
