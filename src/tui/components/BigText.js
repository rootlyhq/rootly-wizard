import { createElement as h } from 'react';
import { Box, Text, useWindowSize } from 'ink';

// Minimal 5-row block font — just the letters we need for headlines. Each
// glyph's rows are equal width so they align when joined.
const FONT = {
  ' ': ['  ', '  ', '  ', '  ', '  '],
  '-': ['   ', '   ', '███', '   ', '   '],
  "'": ['█', '█', ' ', ' ', ' '],
  A: ['▄█▄', '█ █', '███', '█ █', '█ █'],
  C: ['▄██▄', '█   ', '█   ', '█   ', '▀██▀'],
  D: ['██▄ ', '█ █ ', '█ █ ', '█ █ ', '██▀ '],
  E: ['███', '█  ', '██ ', '█  ', '███'],
  I: ['███', ' █ ', ' █ ', ' █ ', '███'],
  N: ['█  █', '██ █', '█ ██', '█  █', '█  █'],
  R: ['██▄', '█ █', '██▀', '█ █', '█ █'],
  T: ['███', ' █ ', ' █ ', ' █ ', ' █ '],
  Y: ['█ █', '█ █', ' █ ', ' █ ', ' █ ']
};
const ROWS = 5;

function build(text) {
  const chars = text.toUpperCase().split('');
  if (chars.some((ch) => !FONT[ch])) return null;
  const raw = Array.from({ length: ROWS }, (_, row) =>
    chars.map((ch) => FONT[ch][row]).join(' ')
  );
  const width = Math.max(...raw.map((line) => line.length));
  return raw.map((line) => line.padEnd(width));
}

export function BigText({ text, color }) {
  const { columns } = useWindowSize();
  const lines = build(text);

  // Fall back to bold text if the block form is unknown or too wide to fit.
  if (!lines || lines[0].length > (columns || 80) - 8) {
    return h(Box, { justifyContent: 'center' }, h(Text, { color, bold: true }, text));
  }

  return h(
    Box,
    { flexDirection: 'column', alignItems: 'center' },
    ...lines.map((line, row) => h(Text, { key: row, color, bold: true }, line))
  );
}
