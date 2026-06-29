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

export function MultiSelectList({ options, onSubmit, onCancel, title, initialSelectedValues = [] }) {
  const { rows, columns } = useWindowSize();
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Pre-check options whose value is already selected (e.g. components already
  // on the page) so submitting preserves them instead of replacing the set.
  const [selected, setSelected] = useState(() => {
    const wanted = new Set(initialSelectedValues);
    const set = new Set();
    options.forEach((option, index) => {
      if (wanted.has(option.value)) set.add(index);
    });
    return set;
  });
  const contentWidth = Math.max(30, Math.min(72, columns - 12));
  const textWidth = Math.max(10, contentWidth - 10);

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
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(options.length - 1, current + 1));
      return;
    }
    if (key.space) {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(selectedIndex)) next.delete(selectedIndex);
        else next.add(selectedIndex);
        return next;
      });
      return;
    }
    // 'a' toggles the whole list — select everyone (full roster) or clear.
    if (input === 'a') {
      setSelected((current) =>
        current.size === options.length ? new Set() : new Set(options.map((_, index) => index))
      );
      return;
    }
    if (key.return) {
      onSubmit([...selected].map((index) => options[index]));
    }
  });

  const children = [];
  if (title) {
    children.push(h(Box, { key: 'title', marginBottom: 1 }, h(Text, { color: palette.muted }, title)));
  }
  // Always-visible instruction — the toggle/confirm model isn't obvious from the
  // checkboxes alone, so spell it out above the list.
  children.push(
    h(
      Box,
      { key: 'howto', marginBottom: 1 },
      h(Text, { color: palette.accent, bold: true }, 'SPACE'),
      h(Text, { color: palette.muted }, ' to check/uncheck · '),
      h(Text, { color: palette.accent, bold: true }, 'ENTER'),
      h(Text, { color: palette.muted }, ' to confirm')
    )
  );
  if (start > 0) {
    children.push(h(Box, { key: 'uphint', marginBottom: 1 }, h(Text, { color: palette.border }, `  ${glyphs.more}${glyphs.more}${glyphs.more} more above`)));
  }
  visibleItems.forEach(({ option, index, lines }) => {
    const active = index === selectedIndex;
    const checked = selected.has(index);
    children.push(
      h(
        Box,
        { key: `${option.label}-${index}`, flexDirection: 'column' },
        ...lines.map((line, lineIndex) =>
          lineIndex === 0
            ? h(
                Box,
                { key: `${index}-0` },
                h(Text, { color: active ? palette.brand : palette.border, bold: active }, active ? `${glyphs.cursor} ` : '  '),
                h(Text, { color: checked ? palette.success : palette.muted }, `${checked ? glyphs.check : glyphs.uncheck} `),
                h(Text, { color: active ? palette.text : palette.muted, bold: active }, line)
              )
            : h(
                Box,
                { key: `${index}-${lineIndex}` },
                h(Text, { color: active ? palette.text : palette.muted, bold: active }, `    ${line}`)
              )
        )
      )
    );
  });
  if (end < items.length - 1) {
    children.push(h(Box, { key: 'downhint', marginTop: 1 }, h(Text, { color: palette.border }, `  ${glyphs.more}${glyphs.more}${glyphs.more} more below`)));
  }
  const count = selected.size;
  children.push(
    h(
      Box,
      { key: 'count', marginTop: 1 },
      h(Text, { color: count ? palette.success : palette.muted }, count ? `${count} selected` : 'none selected yet')
    )
  );

  return h(Box, { flexDirection: 'column' }, ...children);
}
