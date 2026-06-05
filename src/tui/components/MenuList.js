import { createElement as h, useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { palette, glyphs } from '../theme.js';

function wrapText(text, width) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function computeWindow(items, selectedIndex, maxRows) {
  let start = selectedIndex;
  let used = items[selectedIndex]?.height || 1;
  while (start > 0) {
    const next = items[start - 1].height;
    if (used + next > maxRows) break;
    start -= 1;
    used += next;
  }
  let end = selectedIndex;
  while (end < items.length - 1) {
    const next = items[end + 1].height;
    if (used + next > maxRows) break;
    end += 1;
    used += next;
  }
  return { start, end };
}

export function MenuList({ options, onSelect, onCancel, title, tint }) {
  const { rows, columns } = useWindowSize();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [typedDigits, setTypedDigits] = useState('');
  const contentWidth = Math.max(30, Math.min(72, columns - 12));
  const textWidth = Math.max(10, contentWidth - 6);

  const items = useMemo(
    () =>
      options.map((option, index) => {
        const lines = wrapText(option.label, textWidth);
        return { option, index, lines, height: lines.length };
      }),
    [options, textWidth]
  );

  const maxRows = Math.max(5, rows - 14);
  const { start, end } = computeWindow(items, selectedIndex, maxRows);
  const visibleItems = items.slice(start, end + 1);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onCancel?.();
      return;
    }
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
      setTypedDigits('');
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(options.length - 1, current + 1));
      setTypedDigits('');
      return;
    }
    if (key.return) {
      if (typedDigits) {
        const parsed = Number.parseInt(typedDigits, 10) - 1;
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed < options.length) {
          onSelect(options[parsed]);
          return;
        }
      }
      onSelect(options[selectedIndex]);
      return;
    }
    if (key.backspace || key.delete) {
      setTypedDigits((current) => current.slice(0, -1));
      return;
    }
    if (/^\d$/.test(input)) {
      const next = `${typedDigits}${input}`.slice(0, 2);
      setTypedDigits(next);
      const parsed = Number.parseInt(next, 10) - 1;
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed < options.length) {
        setSelectedIndex(parsed);
      }
    }
  });

  const children = [];
  if (title) {
    children.push(
      h(Box, { key: 'title', marginBottom: 1 }, h(Text, { color: palette.muted }, title))
    );
  }
  if (start > 0) {
    children.push(h(Box, { key: 'uphint', marginBottom: 1 }, h(Text, { color: palette.border }, `  ${glyphs.more}${glyphs.more}${glyphs.more} more above`)));
  }
  visibleItems.forEach(({ option, index, lines }) => {
    const active = index === selectedIndex;
    const numLabel = `${index + 1}`;
    const indent = ' '.repeat(2 + numLabel.length + 2);
    const cursorColor = tint || (active ? palette.brand : palette.border);
    const numColor = tint || (active ? palette.brand : palette.muted);
    const labelColor = tint || (active ? palette.text : palette.muted);
    const bold = tint ? false : active;
    children.push(
      h(
        Box,
        { key: `${option.label}-${index}`, flexDirection: 'column' },
        ...lines.map((line, lineIndex) =>
          lineIndex === 0
            ? h(
                Box,
                { key: `${index}-0` },
                h(Text, { color: cursorColor, bold }, active ? `${glyphs.cursor} ` : '  '),
                h(Text, { color: numColor }, `${numLabel}  `),
                h(Text, { color: labelColor, bold }, line)
              )
            : h(
                Box,
                { key: `${index}-${lineIndex}` },
                h(Text, { color: labelColor, bold }, `${indent}${line}`)
              )
        )
      )
    );
  });
  if (end < items.length - 1) {
    children.push(h(Box, { key: 'downhint', marginTop: 1 }, h(Text, { color: palette.border }, `  ${glyphs.more}${glyphs.more}${glyphs.more} more below`)));
  }
  if (typedDigits) {
    children.push(h(Box, { key: 'typed', marginTop: 1 }, h(Text, { color: palette.muted }, `jump → ${typedDigits}`)));
  }

  return h(Box, { flexDirection: 'column' }, ...children);
}
