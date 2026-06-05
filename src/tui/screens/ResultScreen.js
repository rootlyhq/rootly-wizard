import { createElement as h } from 'react';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function ResultScreen({ title, lines, onContinue, onExit, continueLabel = 'Continue' }) {
  return h(
    AppShell,
    { title },
    h(NoticeBox, { lines }),
    h(MenuList, {
      options: [
        { label: continueLabel, value: 'continue' },
        { label: 'Exit wizard', value: 'exit' }
      ],
      onSelect: (option) => {
        if (option.value === 'continue') onContinue?.();
        else onExit?.();
      },
      onCancel: onContinue
    })
  );
}
