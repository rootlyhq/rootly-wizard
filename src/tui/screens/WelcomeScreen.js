import { createElement as h, useEffect, useState } from 'react';
import { Box } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { Banner } from '../components/Banner.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function WelcomeScreen({ lines, onContinue, onExit }) {
  // Stage the entrance: banner flashes in, then the copy, then the menu.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 950);
    const t2 = setTimeout(() => setPhase(2), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return h(
    AppShell,
    { context: 'get started' },
    h(Banner, null),
    phase >= 1 ? h(Box, { flexDirection: 'column' }, h(NoticeBox, { lines })) : null,
    phase >= 2
      ? h(MenuList, {
          options: [
            { label: 'Continue', value: 'continue' },
            { label: 'Exit', value: 'exit' }
          ],
          onSelect: (option) => {
            if (option.value === 'continue') onContinue?.();
            else onExit?.();
          },
          onCancel: onExit
        })
      : null
  );
}
