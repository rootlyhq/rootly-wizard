import { createElement as h } from 'react';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function LoadFailedScreen({ onBack, onExit }) {
  return h(
    AppShell,
    { title: 'Could not load workspace' },
    h(NoticeBox, {
      lines: [
        'The wizard is signed in, but could not read the workspace state.',
        'This may be an OAuth capability gap or a temporary API issue.',
        '',
        'Browser sign-in has limited API access. Try signing in with an API token.'
      ]
    }),
    h(MenuList, {
      options: [
        { label: 'Back to menu', value: 'back' },
        { label: 'Exit wizard', value: 'exit' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') onBack();
        else onExit();
      },
      onCancel: onBack
    })
  );
}
