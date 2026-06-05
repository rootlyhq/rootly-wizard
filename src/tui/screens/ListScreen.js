import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { MenuList } from '../components/MenuList.js';
import { palette, glyphs } from '../theme.js';

export function ListScreen({ title, items, onBack, emptyLabel = 'Nothing found.' }) {
  const itemNodes = items?.length
    ? items.map((item, index) =>
        h(
          Box,
          { key: `${index}-${item}` },
          h(Text, { color: palette.accent }, `${glyphs.dot} `),
          h(Text, { color: palette.text }, item)
        )
      )
    : [h(Box, { key: 'empty' }, h(Text, { color: palette.muted }, emptyLabel))];

  return h(
    AppShell,
    { title },
    h(Box, { flexDirection: 'column', marginBottom: 1 }, ...itemNodes),
    h(MenuList, {
      options: [{ label: 'Back', value: 'back' }],
      onSelect: onBack,
      onCancel: onBack
    })
  );
}
