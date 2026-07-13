import { createElement as h } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { palette } from '../theme.js';

// Return the printable length of `text`, ignoring OSC 8 hyperlink wrappers
// (ESC ] 8 ;; URL BEL … ESC ] 8 ;; BEL) and ANSI CSI color sequences. Without
// this, a hyperlink-wrapped word looks ~130 chars long and gets pushed to its
// own line even though its visible content is tiny.
function visibleLength(text) {
  return String(text)
    .replace(/\x1b\]8;;[^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .length;
}

// Greedy word-wrap to `width`, trimming each segment. We pre-wrap rather than
// letting Ink wrap, because Ink keeps the boundary space and the continuation
// line ends up indented one space (visible when the terminal is resized).
function wrapLine(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const out = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (visibleLength(current + ' ' + word) <= width) {
      current += ' ' + word;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

export function NoticeBox({ title, lines = [] }) {
  const { columns } = useWindowSize();
  // Mirror AppShell's content width: card width (min 82 / cols-4) minus the
  // round border (2) and paddingX (2 each side = 4).
  const cardWidth = Math.min(82, Math.max(24, (columns || 80) - 4));
  const wrapWidth = Math.max(18, cardWidth - 6);

  const rendered = [];
  if (title) {
    rendered.push(h(Box, { key: 'title', marginBottom: 1 }, h(Text, { bold: true, color: palette.text }, title)));
  }
  // Lines are plain strings, or objects { text, color, bold } for emphasis.
  lines.forEach((line, index) => {
    const isObject = line && typeof line === 'object';
    const text = isObject ? line.text : line;
    if (String(text ?? '').trim() === '') {
      rendered.push(h(Box, { key: `blank-${index}` }, h(Text, null, ' ')));
      return;
    }
    const color = (isObject && line.color) || palette.text;
    const bold = isObject ? Boolean(line.bold) : false;
    wrapLine(text, wrapWidth).forEach((segment, segIndex) => {
      rendered.push(
        h(Box, { key: `line-${index}-${segIndex}` }, h(Text, { color, bold }, segment))
      );
    });
  });

  return h(Box, { flexDirection: 'column', marginBottom: 1 }, ...rendered);
}
