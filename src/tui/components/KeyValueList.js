import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { palette, glyphs } from '../theme.js';

export function KeyValueList({ title, rows }) {
  const labelWidth = Math.max(8, ...rows.map((row) => String(row.label).length));

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    title ? h(Box, { marginBottom: 1 }, h(Text, { bold: true, color: palette.text }, title)) : null,
    ...rows.map((row, index) =>
      h(
        Box,
        { key: `${row.label}-${index}` },
        h(Text, { color: palette.accent }, `${glyphs.dot} `),
        h(Text, { color: palette.muted }, `${String(row.label).padEnd(labelWidth + 2)}`),
        h(Text, { color: row.color || palette.text, bold: Boolean(row.color) }, String(row.value))
      )
    )
  );
}
