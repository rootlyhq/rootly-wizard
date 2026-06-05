import { createElement as h } from 'react';
import { AppShell } from '../components/AppShell.js';
import { KeyValueList } from '../components/KeyValueList.js';
import { NoticeBox } from '../components/NoticeBox.js';
import { MenuList } from '../components/MenuList.js';
import { palette, glyphs, HINTS } from '../theme.js';

function alertingLabel(value) {
  switch (value) {
    case 'done':
      return 'ready';
    case 'in-progress':
      return 'in progress';
    default:
      return 'needed';
  }
}

function humanizeAction(action) {
  switch (action) {
    case 'run-guided-setup':
      return 'Core setup complete';
    case 'create-team':
      return 'Create a team';
    case 'invite-team-members':
      return 'Add team members';
    case 'create-schedule':
      return 'Create a schedule';
    case 'create-escalation-policy':
      return 'Create an escalation policy';
    case 'hook-up-monitor':
      return 'Connect an alert source';
    default:
      return 'Continue setup';
  }
}

export function StatusScreen({ state, onBack }) {
  const teams = state?.teams;
  const readiness = state?.onboarding?.readiness;
  const alerting = alertingLabel(readiness?.alertingSetup);

  return h(
    AppShell,
    { title: 'Workspace status', context: 'status', hints: HINTS.back },
    h(KeyValueList, {
      rows: [
        { label: 'Workspace', value: teams?.workspace?.name || teams?.workspace?.slug || 'Connected Rootly account' },
        { label: 'Teams', value: String(teams?.total ?? 0) },
        { label: 'With members', value: `${teams?.teamsWithMembers ?? 0}/${teams?.total ?? 0}` },
        { label: 'With on-call', value: `${teams?.teamsWithSchedules ?? 0}/${teams?.total ?? 0}` },
        { label: 'With escalation', value: `${teams?.teamsWithEscalationPolicies ?? 0}/${teams?.total ?? 0}` },
        {
          label: 'Alerting',
          value: alerting,
          color: alerting === 'ready' ? palette.success : alerting === 'in progress' ? palette.warning : palette.danger
        }
      ]
    }),
    h(NoticeBox, {
      title: `${glyphs.star} Next best action`,
      lines: [humanizeAction(state?.onboarding?.nextBestAction)]
    }),
    h(MenuList, {
      options: [{ label: 'Back to menu', value: 'back' }],
      onSelect: onBack,
      onCancel: onBack
    })
  );
}
