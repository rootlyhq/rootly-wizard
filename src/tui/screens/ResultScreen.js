import { createElement as h } from 'react';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function ResultScreen({ title, lines, onContinue, continueLabel = 'Continue' }) {
  // No Exit option here — Exit lives only on the main menu.
  return h(
    AppShell,
    { title },
    h(NoticeBox, { lines }),
    h(MenuList, {
      options: [
        { label: continueLabel, value: 'continue' }
      ],
      onSelect: () => onContinue?.(),
      onCancel: onContinue
    })
  );
}
