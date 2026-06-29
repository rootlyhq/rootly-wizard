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
  if (!items.length) return { start: 0, end: -1 };
  const focus = Math.min(selectedIndex, items.length - 1);
  let start = focus;
  let used = items[focus]?.height || 1;
  while (start > 0) {
    const next = items[start - 1].height;
    if (used + next > maxRows) break;
    start -= 1;
    used += next;
  }
  let end = focus;
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
  // selectedIndex spans the options plus one extra row (CONFIRM) at the end.
  const CONFIRM = options.length;
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

  const toggle = (index) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const maxRows = Math.max(5, rows - 16);
  const { start, end } = computeWindow(items, selectedIndex, maxRows);
  const visibleItems = items.slice(start, end + 1);
  const onConfirm = selectedIndex === CONFIRM;

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
      setSelectedIndex((current) => Math.min(CONFIRM, current + 1));
      return;
    }
    // 'a' toggles the whole list — select everyone or clear.
    if (input === 'a') {
      setSelected((current) =>
        current.size === options.length ? new Set() : new Set(options.map((_, index) => index))
      );
      return;
    }
    // Enter confirms on the Confirm row; otherwise it toggles the current item.
    if (key.return) {
      if (onConfirm) onSubmit([...selected].map((index) => options[index]));
      else toggle(selectedIndex);
      return;
    }
    // Space also toggles the current item (Ink reports space as input === ' ').
    if (input === ' ' || key.space) {
      if (!onConfirm) toggle(selectedIndex);
    }
  });

  const children = [];
  if (title) {
    children.push(h(Box, { key: 'title', marginBottom: 1 }, h(Text, { color: palette.muted }, title)));
  }
  // Spell out the model — it isn't obvious from the checkboxes alone.
  children.push(
    h(
      Box,
      { key: 'howto', marginBottom: 1 },
      h(Text, { color: palette.accent, bold: true }, 'enter'),
      h(Text, { color: palette.muted }, ' or '),
      h(Text, { color: palette.accent, bold: true }, 'space'),
      h(Text, { color: palette.muted }, ' to check · arrow down to ' ),
      h(Text, { color: palette.accent, bold: true }, 'Confirm'),
      h(Text, { color: palette.muted }, ' to finish')
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
  // The Confirm row — navigable like an option; Enter here submits.
  children.push(
    h(
      Box,
      { key: 'confirm', marginTop: 1 },
      h(Text, { color: onConfirm ? palette.brand : palette.border, bold: onConfirm }, onConfirm ? `${glyphs.cursor} ` : '  '),
      h(Text, { color: onConfirm ? palette.text : palette.muted, bold: onConfirm }, `Confirm${count ? ` (${count} selected)` : ' (none selected)'}`)
    )
  );

  return h(Box, { flexDirection: 'column' }, ...children);
}
