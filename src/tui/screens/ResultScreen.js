import { createElement as h } from 'react';
import { Box } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function ResultScreen({ title, lines, onContinue, continueLabel = 'Continue', actions = [] }) {
  // Optional `actions` render as extra menu options above Continue; their
  // onSelect runs in place (no navigation) so the user can re-trigger them.
  // No Exit option here — Exit lives only on the main menu.
  return h(
    AppShell,
    { title },
    h(NoticeBox, { lines }),
    h(
      Box,
      { marginTop: 1 },
      h(MenuList, {
        options: [
          ...actions.map((action, index) => ({ label: action.label, value: `action-${index}` })),
          { label: continueLabel, value: 'continue' }
        ],
        onSelect: (option) => {
          if (option.value === 'continue') {
            onContinue?.();
            return;
          }
          const index = Number(option.value.slice('action-'.length));
          actions[index]?.onSelect?.();
        },
        onCancel: onContinue
      })
    )
  );
}
