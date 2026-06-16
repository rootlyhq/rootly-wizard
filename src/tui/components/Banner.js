import { createElement as h, useEffect, useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { palette, shimmerRamp } from '../theme.js';

// The Rootly sprout, rendered from assets/rootly-logo-glyph.png with chafa's
// braille symbols (2x4 dots per cell). Braille packs ~4x the detail of half-
// blocks, so the leaves read as smooth rounded shapes instead of chunky bars in
// a compact footprint. Regenerate with:
//   chafa --symbols braille --size 26x13 --fg-only assets/rootly-logo-glyph-purple.png
const LOGO = [
  '⠀⠀⠀⠀⠀⠀⠀⣴⣧',
  '⠀⠀⠀⣦⣦⣄⠀⠿⠿⠀⣠⣴⣴',
  '⠀⠀⢀⠈⠛⠟⠀⢀⡀⠀⠻⠛⠁⡀',
  '⠀⠹⢿⣿⡆⠀⠀⣾⣿⠀⠀⠰⣿⡿⠟',
  '⣀⣀⣀⣀⣀⠀⠀⠙⠋⠀⢀⣀⣀⣀⣀⣀',
  '⠛⠛⠛⠛⠛⠿⣷⣦⣴⣾⠿⠛⠛⠛⠛⠛',
  '⠀⠀⠀⠀⠀⠀⠘⣿⣿⠃'
];
const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));
// Pad every line to the same width: rendered in a centered column, unequal-length
// lines would each be centered on their own width and drift horizontally.
const LOGO_LINES = LOGO.map((line) => line.padEnd(LOGO_WIDTH));

// Small single-line wordmark (normal terminal text), shimmered to brand purple.
const WORDMARK = 'Rootly Wizard';

// Bright-to-brand trail behind the reveal crest (white → brand purple, via
// the P200/P300/P500 brand tints).
const CREST = ['#FFFFFF', '#E0DAFB', '#C9BEF7', '#9D86F0', palette.brand];
const REVEAL_STEP = 1;

export function Banner() {
  const { columns } = useWindowSize();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 70);
    return () => clearInterval(timer);
  }, []);

  // Equal-width lines, each in its own Box, so the centered column lays the
  // sprout out as one solid block (no per-line horizontal drift).
  const sprout = h(
    Box,
    { flexDirection: 'column', alignItems: 'center', marginBottom: 1 },
    ...LOGO_LINES.map((line, row) =>
      h(Box, { key: `logo-${row}` }, h(Text, { color: palette.brand }, line))
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
  const reveal = frame * REVEAL_STEP;
  const settled = reveal > WORDMARK.length + CREST.length;

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
      ...WORDMARK.split('').map((char, col) => {
        if (char === ' ' || (!settled && col > reveal)) {
          return h(Text, { key: `c-${col}` }, ' ');
        }
        return h(Text, { key: `c-${col}`, bold: true, color: colorFor(col) }, char);
      })
    )
  );
}
