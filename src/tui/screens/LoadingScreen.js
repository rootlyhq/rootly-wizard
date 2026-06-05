import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { palette, glyphs, HINTS } from '../theme.js';

export function LoadingScreen({ title = 'Loading your Rootly workspace', detail = 'Reading your current setup.' }) {
  return h(
    AppShell,
    { hints: HINTS.none },
    h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        null,
        h(Text, { color: palette.brand }, `${glyphs.logo} `),
        h(Text, { bold: true, color: palette.text }, title)
      ),
      h(Box, { marginTop: 1 }, h(Text, { color: palette.muted }, detail))
    )
  );
}
