import { createElement as h, useEffect, useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { palette, shimmerRamp } from '../theme.js';

// "Rootly Wizard" on one line in a rounded block font.
const GLYPHS = {
  R: ['█▀▀▄', '█  █', '█▀▀▄', '█▀▄ ', '█  █'],
  W: ['█   █', '█   █', '█ █ █', '██ ██', '█   █'],
  o: ['    ', '▄▀▀▄', '█  █', '█  █', '▀▄▄▀'],
  t: ['  █ ', ' ███', '  █ ', '  █ ', '  ▀▄'],
  l: ['█', '█', '█', '█', '█'],
  y: ['    ', '█  █', '█  █', '▀▄▄█', '▄▄▄▀'],
  i: ['█', ' ', '█', '█', '█'],
  z: ['    ', '████', '  ▄▀', '▄▀  ', '████'],
  a: ['    ', '▄▀▀▄', ' ▄▄█', '█  █', '▀▄▄▀'],
  d: ['   █', '   █', '▄▀▀█', '█  █', '▀▄▄▀'],
  r: ['   ', '█▀▀', '█  ', '█  ', '█  '],
};
const ROWS = 5;

function buildWord(word) {
  const raw = Array.from({ length: ROWS }, (_, row) =>
    word.split('').map((letter) => GLYPHS[letter][row]).join(' ')
  );
  const width = Math.max(...raw.map((line) => line.length));
  return raw.map((line) => line.padEnd(width));
}

const ROOTLY = buildWord('Rootly');
const WIZARD = buildWord('Wizard');
const RAW = ROOTLY.map((line, row) => `${line}   ${WIZARD[row]}`);
const WIDTH = Math.max(...RAW.map((line) => line.length));
const WORDMARK = RAW.map((line) => line.padEnd(WIDTH));

// Bright-to-brand trail behind the reveal crest.
const CREST = ['#FFFFFF', '#FFF4CF', '#FFE9A8', '#FFD45E', palette.brand];
const REVEAL_STEP = 3;

export function Banner() {
  const { columns } = useWindowSize();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 38);
    return () => clearInterval(timer);
  }, []);

  // Compact fallback when the block wordmark would not fit.
  if ((columns || 80) < WIDTH + 12) {
    return h(Box, { marginBottom: 1 }, h(Text, { color: palette.brand, bold: true }, '✦ Rootly Wizard'));
  }

  const ramp = shimmerRamp;
  const reveal = frame * REVEAL_STEP;
  const settled = reveal > WIDTH + CREST.length;

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
    ...WORDMARK.map((line, row) =>
      h(
        Box,
        { key: `row-${row}` },
        ...line.split('').map((char, col) => {
          if (char === ' ' || (!settled && col > reveal)) {
            return h(Text, { key: `c-${col}` }, ' ');
          }
          return h(Text, { key: `c-${col}`, color: colorFor(col) }, char);
        })
      )
    )
  );
}
