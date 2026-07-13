import { createElement as h, useState, useEffect } from 'react';
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
  hidden = false,
  allowEmpty = false,
  // Optional secondary action bound to a modifier keystroke (Ctrl+R by default).
  // When provided, the hint appears under the field so the affordance is
  // discoverable — the whole screen otherwise consumes every printable key.
  onSecondary,
  secondaryHint = null
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  // Blinking caret so a prefilled value reads as an editable field, not text.
  const [caretOn, setCaretOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setCaretOn((on) => !on), 530);
    return () => clearInterval(id);
  }, []);
  const { columns } = useWindowSize();
  // Fixed-width field so the box doesn't grow or jitter as you type, and long
  // values (API tokens) scroll on one line instead of wrapping inside the box.
  const fieldWidth = Math.max(32, Math.min(64, (columns || 80) - 14));

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onBack?.();
      return;
    }
    if (key.ctrl && input === 'r' && onSecondary) {
      onSecondary();
      return;
    }
    if (key.escape) {
      onBack?.();
      return;
    }
    if (key.return) {
      const trimmed = value.trim();
      if (!trimmed && !allowEmpty) {
        setError('Please enter a value before continuing.');
        return;
      }
      onSubmit?.(trimmed);
      return;
    }
    if (key.backspace || key.delete) {
      if (error) setError('');
      setValue((current) => current.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      if (error) setError('');
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
          // Typed value (truncate-start so long values show their tail), then a
          // blinking block caret at the insertion point, then ghosted
          // placeholder text when the field is still empty.
          isEmpty ? null : h(Text, { color: palette.text, wrap: 'truncate-start' }, display),
          h(Text, { color: palette.brand, bold: true }, caretOn ? '█' : ' '),
          isEmpty ? h(Text, { color: palette.muted }, placeholder || '') : null
        )
      ),
      // Validation error, right under the field.
      error ? h(Box, { marginTop: 1 }, h(Text, { color: palette.danger }, `✗ ${error}`)) : null,
      // Supporting help, below the field.
      lines.length
        ? h(
            Box,
            { flexDirection: 'column', marginTop: 1 },
            helpHeading
              ? h(Box, { key: 'help-h', marginBottom: 1 }, h(Text, { color: palette.text }, helpHeading))
              : null,
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
      link ? h(Box, { marginTop: 1 }, h(Text, { color: palette.accent }, link)) : null,
      secondaryHint ? h(Box, { marginTop: 1 }, h(Text, { color: palette.muted }, secondaryHint)) : null
    )
  );
}
