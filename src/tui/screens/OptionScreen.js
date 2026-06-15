import { createElement as h } from 'react';
import { Box } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function OptionScreen({ title, lines, options, onSelect, onBack, context, hints, header }) {
  return h(
    AppShell,
    { title, context, hints },
    header || null,
    lines?.length ? h(NoticeBox, { lines }) : null,
    // Breathing room between the copy and the options.
    h(
      Box,
      { marginTop: 1 },
      h(MenuList, {
        options,
        onSelect,
        onCancel: onBack
      })
    )
  );
}
