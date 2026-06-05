import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { palette } from '../theme.js';

export function NoticeBox({ title, lines = [] }) {
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    title ? h(Box, { marginBottom: 1 }, h(Text, { bold: true, color: palette.text }, title)) : null,
    ...lines.map((line, index) =>
      String(line).trim() === ''
        ? h(Box, { key: `blank-${index}` }, h(Text, null, ' '))
        : h(Box, { key: `line-${index}` }, h(Text, { color: palette.text }, line))
    )
  );
}
