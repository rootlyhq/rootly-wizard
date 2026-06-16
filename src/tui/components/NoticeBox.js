import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { palette } from '../theme.js';

export function NoticeBox({ title, lines = [] }) {
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    title ? h(Box, { marginBottom: 1 }, h(Text, { bold: true, color: palette.text }, title)) : null,
    // Lines are plain strings, or objects { text, color, bold } for emphasis.
    ...lines.map((line, index) => {
      const isObject = line && typeof line === 'object';
      const text = isObject ? line.text : line;
      if (String(text ?? '').trim() === '') {
        return h(Box, { key: `blank-${index}` }, h(Text, null, ' '));
      }
      return h(
        Box,
        { key: `line-${index}` },
        h(Text, { color: (isObject && line.color) || palette.text, bold: isObject ? Boolean(line.bold) : false }, text)
      );
    })
  );
}
