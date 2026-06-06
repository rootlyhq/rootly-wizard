import { createElement as h, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { palette, glyphs, HINTS } from '../theme.js';

export function TextEntryScreen({
  title,
  prompt,
  lines = [],
  link = null,
  initialValue = '',
  placeholder = '',
  onSubmit,
  onBack,
  hidden = false
}) {
  const [value, setValue] = useState(initialValue);
  const { columns } = useWindowSize();
  // Fixed-width field so the box doesn't grow or jitter as you type, and long
  // values (API tokens) scroll on one line instead of wrapping inside the box.
  const fieldWidth = Math.max(32, Math.min(64, (columns || 80) - 14));

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
      lines.length
        ? h(
            Box,
            { flexDirection: 'column', marginBottom: 1 },
            ...lines.map((line, index) => h(Text, { key: `inst-${index}`, color: palette.muted }, line))
          )
        : null,
      link ? h(Box, { marginBottom: 1 }, h(Text, { color: palette.accent }, link)) : null,
      h(
        Box,
        { borderStyle: 'round', borderColor: palette.brand, paddingX: 1, width: fieldWidth + 4 },
        h(Text, { color: palette.brand }, `${glyphs.cursor} `),
        h(
          Box,
          { width: fieldWidth },
          h(
            Text,
            { color: isEmpty ? palette.muted : palette.text, wrap: 'truncate-start' },
            isEmpty ? (placeholder || ' ') : display
          )
        )
      )
    )
  );
}
