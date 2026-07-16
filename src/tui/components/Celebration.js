import { createElement as h, useEffect, useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { palette } from '../theme.js';

// A few rows of confetti that twinkle and drift downward — a bit of fanfare,
// built from glyphs + brand colors rather than emoji.
const GLYPHS = ['✦', '✧', '✶', '*', '•', '·', '+'];
// Brand-forward confetti: Rootly purple + orange, with lighter purple/white
// sparkles. (No off-brand greens/blues.)
const COLORS = [palette.brand, palette.accent, '#9D86F0', '#C9BEF7', '#FFFFFF'];
const ROWS = 3;

// Deterministic per-cell hash (no Math.random), so the field is stable per
// frame and animates purely from the frame counter.
function hash(c, r, salt) {
  let x = (c * 374761393 + r * 668265263 + salt * 2246822519) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

// Play a finite burst of confetti (~3s), then settle on a static final frame
// and stop re-rendering — a perpetual interval would animate (and, under
// React's dev build, grow the performance-entry buffer) forever.
const MAX_FRAMES = 24;

export function Celebration() {
  const { columns } = useWindowSize();
  const [frame, setFrame] = useState(0);

  // Schedule the next frame only until the burst is done, so the last render
  // leaves no pending timer and the component quiesces.
  useEffect(() => {
    if (frame >= MAX_FRAMES) return undefined;
    const timer = setTimeout(() => setFrame((f) => f + 1), 120);
    return () => clearTimeout(timer);
  }, [frame]);

  const width = Math.max(20, Math.min(46, (columns || 80) - 12));
  const rows = [];
  for (let r = 0; r < ROWS; r += 1) {
    const cells = [];
    for (let c = 0; c < width; c += 1) {
      // Seed by (row - frame) so the pattern scrolls down as frames advance.
      const v = hash(c, r - frame, 7);
      if (v % 5 === 0) {
        cells.push(h(Text, { key: c, color: COLORS[(v >>> 5) % COLORS.length] }, GLYPHS[(v >>> 3) % GLYPHS.length]));
      } else {
        cells.push(h(Text, { key: c }, ' '));
      }
    }
    rows.push(h(Box, { key: r }, ...cells));
  }

  return h(Box, { flexDirection: 'column', alignItems: 'center', marginBottom: 1 }, ...rows);
}
