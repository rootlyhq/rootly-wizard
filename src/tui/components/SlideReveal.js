import { createElement as h, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { palette } from '../theme.js';

// Each line slides in from a right indent and settles into place, fading from
// dim to full as it lands. Staggered per line. Any keypress finishes it.
const RAMP = ['#3C3C46', '#56565F', '#727280', '#9A9AA5', '#C4C4CC', palette.text];
const INDENT = 6;
const STAGGER = 3;

export function SlideReveal({ lines = [], onDone }) {
  let order = 0;
  const meta = lines.map((line) => {
    if (line.trim() === '') return { blank: true, start: 0 };
    const start = order * STAGGER;
    order += 1;
    return { blank: false, start };
  });
  const lastStart = meta.reduce((max, m) => (m.blank ? max : Math.max(max, m.start)), 0);
  const end = lastStart + Math.max(INDENT, RAMP.length - 1) + 1;

  const [tick, setTick] = useState(0);

  useInput(() => setTick(end));

  useEffect(() => {
    if (tick >= end) {
      const settle = setTimeout(() => onDone?.(), 150);
      return () => clearTimeout(settle);
    }
    const next = setTimeout(() => setTick((current) => current + 1), 45);
    return () => clearTimeout(next);
  }, [tick, end, onDone]);

  return h(
    Box,
    { flexDirection: 'column' },
    ...lines.map((line, index) => {
      const m = meta[index];
      if (m.blank) {
        return h(Box, { key: index }, h(Text, null, ' '));
      }
      const progress = tick - m.start;
      if (progress < 0) {
        return h(Box, { key: index }, h(Text, null, ' '));
      }
      const indent = Math.max(0, INDENT - progress);
      const color = RAMP[Math.min(progress, RAMP.length - 1)];
      return h(Box, { key: index }, h(Text, { color }, `${' '.repeat(indent)}${line}`));
    })
  );
}
