import { createElement as h } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { palette, glyphs, HINTS } from '../theme.js';

function KeyHints({ items, keyColor = palette.brand }) {
  if (!items?.length) {
    return h(Text, { color: palette.border }, ' ');
  }
  const parts = [];
  items.forEach((item, index) => {
    if (index > 0) {
      parts.push(h(Text, { key: `sep-${index}`, color: palette.border }, '    '));
    }
    parts.push(h(Text, { key: `key-${index}`, color: keyColor }, item.key));
    parts.push(h(Text, { key: `lbl-${index}`, color: palette.muted }, ` ${item.label}`));
  });
  return h(Box, null, ...parts);
}

export function AppShell({ title, context = 'rootly.com', hints = HINTS.nav, keyColor = palette.brand, children }) {
  const { columns } = useWindowSize();
  const cols = columns || 80;
  // Fit the terminal: shrink on narrow screens, cap on wide ones.
  const width = Math.min(82, Math.max(24, cols - 4));
  const ruleWidth = Math.max(4, Math.min(title ? title.length : 0, width - 8));

  return h(
    Box,
    // Full-width column, centered — so on a wide/enlarged terminal everything
    // stays centered rather than pinned to the left.
    { flexDirection: 'column', alignItems: 'center', width: cols, paddingTop: 1 },
    // Brand header
    h(
      Box,
      { width, justifyContent: 'space-between', marginBottom: 1 },
      h(
        Box,
        null,
        h(Text, { color: keyColor, bold: true }, `${glyphs.logo} `),
        h(Text, { bold: true, color: palette.text }, 'Rootly Wizard')
      ),
      h(Text, { color: palette.accent, bold: true }, context)
    ),
    // Content card
    h(
      Box,
      {
        width,
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: palette.border,
        paddingX: 2,
        paddingY: 1
      },
      title
        ? h(
            Box,
            { flexDirection: 'column', marginBottom: 1 },
            h(Text, { bold: true, color: palette.text }, title),
            h(Text, { color: palette.brand }, '─'.repeat(ruleWidth))
          )
        : null,
      ...(Array.isArray(children) ? children : [children]).filter(Boolean)
    ),
    // Footer hints
    h(Box, { width, marginTop: 1, justifyContent: 'center' }, h(KeyHints, { items: hints, keyColor }))
  );
}
