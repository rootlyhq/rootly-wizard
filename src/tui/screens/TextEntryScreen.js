import { createElement as h, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { palette, glyphs, HINTS } from '../theme.js';

export function TextEntryScreen({
  title,
  prompt,
  initialValue = '',
  placeholder = '',
  onSubmit,
  onBack,
  hidden = false
}) {
  const [value, setValue] = useState(initialValue);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onBack?.();
      return;
    }
    if (key.escape) {
      onBack?.();
      return;
    }
    if (key.return) {
      onSubmit?.(value.trim());
      return;
    }
    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setValue((current) => current + input);
    }
  });

  const display = hidden ? '•'.repeat(value.length) : value;
  const isEmpty = display.length === 0;

  return h(
    AppShell,
    { title, hints: HINTS.entry },
    h(
      Box,
      { flexDirection: 'column' },
      prompt ? h(Box, { marginBottom: 1 }, h(Text, { color: palette.muted }, prompt)) : null,
      h(
        Box,
        { borderStyle: 'round', borderColor: palette.brand, paddingX: 1 },
        h(Text, { color: palette.brand }, `${glyphs.cursor} `),
        h(Text, { color: isEmpty ? palette.muted : palette.text }, isEmpty ? (placeholder || ' ') : display)
      )
    )
  );
}
