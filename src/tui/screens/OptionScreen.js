import { createElement as h } from 'react';
import { AppShell } from '../components/AppShell.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';

export function OptionScreen({ title, lines, options, onSelect, onBack, context, hints }) {
  return h(
    AppShell,
    { title, context, hints },
    lines?.length ? h(NoticeBox, { lines }) : null,
    h(MenuList, {
      options,
      onSelect,
      onCancel: onBack
    })
  );
}
