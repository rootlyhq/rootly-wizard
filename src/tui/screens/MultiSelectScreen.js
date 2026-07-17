import { createElement as h } from 'react';
import { Box } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MultiSelectList } from '../components/MultiSelectList.js';
import { HINTS } from '../theme.js';

export function MultiSelectScreen({ title, lines, options, onSubmit, onBack, initialSelectedValues = [] }) {
  return h(
    AppShell,
    { title, hints: HINTS.multi },
    lines?.length ? h(NoticeBox, { lines }) : null,
    h(
      Box,
      { marginTop: lines?.length ? 1 : 0 },
      h(MultiSelectList, {
        options,
        onSubmit,
        onCancel: onBack,
        initialSelectedValues
      })
    )
  );
}
