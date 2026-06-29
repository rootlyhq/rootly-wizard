import { createElement as h } from 'react';
import { AppShell } from '../components/AppShell.js';
import { MultiSelectList } from '../components/MultiSelectList.js';
import { HINTS } from '../theme.js';

export function MultiSelectScreen({ title, options, onSubmit, onBack, initialSelectedValues = [] }) {
  return h(
    AppShell,
    { title, hints: HINTS.multi },
    h(MultiSelectList, {
      options,
      onSubmit,
      onCancel: onBack,
      initialSelectedValues
    })
  );
}
