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

  // Help block convention: the first `line` renders as a muted heading; the
  // rest render as accent-bulleted steps in readable text. Keep each line short
  // so it doesn't wrap inside the card.
  const [helpHeading, ...helpSteps] = lines;

  return h(
    AppShell,
    { title, hints: HINTS.entry },
    h(
      Box,
      { flexDirection: 'column' },
      // The ask — readable, right above the field.
      prompt ? h(Box, { marginBottom: 1 }, h(Text, { color: palette.text }, prompt)) : null,
      // The input field.
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
      ),
      // Supporting help, below the field.
      lines.length
        ? h(
            Box,
            { flexDirection: 'column', marginTop: 1 },
            helpHeading ? h(Text, { key: 'help-h', color: palette.muted }, helpHeading) : null,
            ...helpSteps.map((line, index) =>
              h(
                Box,
                { key: `help-${index}` },
                h(Text, { color: palette.accent }, `  ${glyphs.dot} `),
                h(Text, { color: palette.text }, line)
              )
            )
          )
        : null,
      link ? h(Box, { marginTop: 1 }, h(Text, { color: palette.accent }, link)) : null
    )
  );
}
