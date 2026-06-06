import { createElement as h, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { palette, HINTS } from '../theme.js';

// Braille spinner — smooth, single-cell, reads as motion in any terminal font.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function LoadingScreen({ title = 'Loading your Rootly workspace', detail = 'Reading your current setup.' }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
    return () => clearInterval(timer);
  }, []);

  return h(
    AppShell,
    { hints: HINTS.none },
    h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        null,
        h(Text, { color: palette.brand, bold: true }, `${SPINNER[frame]} `),
        h(Text, { bold: true, color: palette.text }, title)
      ),
      h(Box, { marginTop: 1 }, h(Text, { color: palette.muted }, detail))
    )
  );
}
