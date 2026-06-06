import { createElement as h } from 'react';
import { Box, Text } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { MenuList } from '../components/MenuList.js';
import { palette, glyphs } from '../theme.js';

function recommendedLabel(nextAction) {
  switch (nextAction) {
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

function CoverageRow({ label, filled, total }) {
  const segments = 12;
  const ratio = total > 0 ? filled / total : 0;
  const on = Math.round(ratio * segments);
  const fillColor = ratio >= 1 ? palette.success : ratio > 0 ? palette.warning : palette.border;
  return h(
    Box,
    null,
    h(Text, { color: palette.muted }, `${label.padEnd(12)} `),
    h(Text, { color: fillColor }, glyphs.barOn.repeat(on)),
    h(Text, { color: palette.border }, glyphs.barOff.repeat(segments - on)),
    h(Text, { color: fillColor }, `  ${filled}/${total}`)
  );
}

export function MainMenuScreen({ state, onBack, onExit }) {
  const nextAction = state?.onboarding?.nextBestAction;
  const recommended = recommendedLabel(nextAction);
  const complete = nextAction === 'run-guided-setup';
  const workspaceName = state?.teams?.workspace?.name || state?.teams?.workspace?.slug || 'Connected workspace';
  const totalTeams = state?.teams?.total ?? 0;
  const onCall = state?.teams?.teamsWithSchedules ?? 0;
  const escalation = state?.teams?.teamsWithEscalationPolicies ?? 0;

  return h(
    AppShell,
    { title: workspaceName, context: 'menu' },
    h(
      Box,
      { flexDirection: 'column', marginBottom: 1 },
      h(Box, null, h(Text, { color: palette.muted }, `${totalTeams} ${totalTeams === 1 ? 'team' : 'teams'}`)),
      h(CoverageRow, { label: 'On-call', filled: onCall, total: totalTeams }),
      h(CoverageRow, { label: 'Escalation', filled: escalation, total: totalTeams })
    ),
    h(
      Box,
      { marginBottom: 1 },
      h(Text, { color: complete ? palette.success : palette.brand }, complete ? '✓ ' : `${glyphs.star} `),
      h(Text, { color: palette.muted }, 'Recommended  '),
      h(Text, { color: complete ? palette.success : palette.text, bold: true }, recommended)
    ),
    h(MenuList, {
      title: 'What would you like to do?',
      options: [
        { label: 'Quick start — full setup + test incident', value: 'quickstart', group: 'setup' },
        { label: 'Recommended setup', value: 'recommended', group: 'setup' },
        { label: 'General setup', value: 'general', group: 'setup' },
        { label: 'Exit', value: 'exit', group: 'session' }
      ],
      onSelect: (option) => {
        if (option.value === 'exit') onExit(option);
        else onBack(option);
      },
      onCancel: onBack
    })
  );
}
