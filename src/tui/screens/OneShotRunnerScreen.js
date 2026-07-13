import { createElement as h, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { MenuList } from '../components/MenuList.js';
import { palette, HINTS } from '../theme.js';
import { friendlyError } from '../../format.js';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Label while a step is in flight vs. once it has settled.
const RUNNING_LABEL = {
  team: 'Setting up team',
  members: 'Adding team members',
  schedule: 'Creating on-call schedule',
  'escalation-policy': 'Creating escalation policy',
  'alert-source': 'Adding alert source',
  'test-alert': 'Firing test alert',
  'test-incident': 'Opening test incident'
};
const DONE_LABEL = {
  team: 'Team',
  members: 'Team members',
  schedule: 'On-call schedule',
  'escalation-policy': 'Escalation policy',
  'alert-source': 'Alert source',
  'test-alert': 'Test alert',
  'test-incident': 'Test incident'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function applyEvent(prev, evt) {
  if (evt.status === 'running') {
    if (prev.some((s) => s.step === evt.step)) {
      return prev.map((s) => (s.step === evt.step ? { ...s, status: 'running' } : s));
    }
    return [...prev, { step: evt.step, status: 'running' }];
  }
  return prev.map((s) => (s.step === evt.step ? { ...s, status: evt.status, error: evt.error } : s));
}

// U+FE0E forces text (monochrome, single-width) presentation so the marks don't
// render as wide emoji that swallow the following space.
const TEXT_PRESENTATION = '︎';

function ProgressRow({ entry, frame }) {
  const { step, status } = entry;
  const mark = status === 'running'
    ? SPINNER[frame % SPINNER.length]
    : status === 'ok' || status === 'reused' ? `✓${TEXT_PRESENTATION}`
      : status === 'blocked' ? `⚠${TEXT_PRESENTATION}` : `✗${TEXT_PRESENTATION}`;
  const color = status === 'running' ? palette.brand
    : status === 'ok' || status === 'reused' ? palette.success
      : status === 'blocked' ? palette.warning : palette.danger;
  const label = status === 'running' ? (RUNNING_LABEL[step] || step) : (DONE_LABEL[step] || step);
  const suffix = status === 'reused' ? ' (existing)'
    : status === 'blocked' ? ' — not permitted by this sign-in'
      : status === 'failed' ? ` — ${friendlyError(entry.error)}` : '';
  return h(
    Box,
    null,
    // Margin (a layout gap) rather than a string space, so the gap survives
    // regardless of how wide the terminal renders the mark glyph.
    h(Box, { marginRight: 1 }, h(Text, { color }, mark)),
    h(Text, { color: palette.text }, label),
    suffix ? h(Text, { color: palette.muted }, suffix) : null
  );
}

function SummaryRow({ label, value }) {
  return h(
    Box,
    null,
    h(Text, { color: palette.muted }, `${label}`.padEnd(14)),
    h(Text, { color: palette.text }, value)
  );
}

export function OneShotRunnerScreen({ memberIds = [], usersById = {}, runner, onContinue, onMenu, onRetry, onExit, onOpenTestPage }) {
  const [steps, setSteps] = useState([]);
  const [frame, setFrame] = useState(0);
  const [result, setResult] = useState(null);
  const done = Boolean(result);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await runner({ memberIds }, async (evt) => {
        if (cancelled) return;
        setSteps((prev) => applyEvent(prev, evt));
        // Pace the reveal so each step is visible as it lands.
        await delay(evt.status === 'running' ? 240 : 460);
      });
      if (!cancelled) setResult(res);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (done) return undefined;
    const timer = setInterval(() => setFrame((f) => f + 1), 80);
    return () => clearInterval(timer);
  }, [done]);

  // While building: title + the live step list.
  if (!done) {
    return h(
      AppShell,
      { title: 'Setting up Rootly', context: 'working', hints: HINTS.none },
      h(
        Box,
        { flexDirection: 'column' },
        steps.length
          ? steps.map((entry) => h(ProgressRow, { key: entry.step, entry, frame }))
          : h(Text, { color: palette.muted }, `${SPINNER[frame % SPINNER.length]} Starting…`)
      )
    );
  }

  // Done: detailed summary of what was created + next actions.
  const data = result.data || {};
  const nameFor = (id) => usersById[id]?.name || usersById[id]?.email || `User ${id}`;
  const onCall = (data.rotation || []).map(nameFor).join(', ');

  const rows = [
    data.team && {
      label: 'Team',
      value: `${data.team.name || `team ${data.team.id}`}${data.team.reused ? ' (existing)' : ''}`
    },
    onCall && { label: 'On call', value: onCall },
    data.schedule && {
      label: 'Schedule',
      value: `${data.schedule.name} · ${data.schedule.handoffTime} daily handoff`
    },
    data.escalationPolicy && { label: 'Escalation', value: data.escalationPolicy.name },
    data.alertSource && { label: 'Alert source', value: data.alertSource.name },
    data.alert && { label: 'Test alert', value: data.alert.summary },
    data.incident && { label: 'Test incident', value: data.incident.title }
  ].filter(Boolean);

  const options = result.ok
    ? [
        // The alert step is blocked for OAuth sessions (no alert-write). The
        // manual page modal is Rootly's UI equivalent — routes through the
        // on-call escalation and rings the on-call phone. Also useful on a
        // successful run to verify paging end-to-end.
        ...(data.testPageUrl && onOpenTestPage ? [{ label: 'Send a test page (rings on-call)', value: 'test-page' }] : []),
        { label: 'Continue', value: 'continue' },
        { label: 'Back to menu', value: 'menu' }
      ]
    : [
        { label: 'Try again', value: 'retry' },
        { label: 'Back to menu', value: 'menu' }
      ];

  return h(
    AppShell,
    { title: result.ok ? 'Setup complete' : 'Setup needs attention', context: result.ok ? 'all set' : 'attention', hints: HINTS.nav },
    h(
      Box,
      { flexDirection: 'column' },
      h(Box, { marginBottom: 1 }, h(Text, { color: result.ok ? palette.success : palette.warning, bold: true }, result.summary)),
      // Keep the finished checklist on screen so you can review what was created
      // before continuing.
      h(Box, { flexDirection: 'column', marginBottom: 1 }, ...steps.map((entry) => h(ProgressRow, { key: entry.step, entry, frame }))),
      h(Box, { flexDirection: 'column' }, ...rows.map((row) => h(SummaryRow, { key: row.label, label: row.label, value: row.value }))),
      data.incident?.slackChannelUrl
        ? h(Box, { marginTop: 1 }, h(Text, { color: palette.accent }, `Incident channel: ${data.incident.slackChannelUrl}`))
        : null,
      rows.length
        ? h(Box, { marginTop: 1 }, h(Text, { color: palette.muted }, 'Verify any of this in the Rootly web app.'))
        : null,
      data.note ? h(Box, { marginTop: 1 }, h(Text, { color: palette.muted }, data.note)) : null,
      h(
        Box,
        { marginTop: 1 },
        h(MenuList, {
          options,
          onSelect: (option) => {
            if (option.value === 'continue') onContinue?.();
            else if (option.value === 'retry') onRetry?.();
            else if (option.value === 'test-page') onOpenTestPage?.();
            else onMenu?.();
          },
          onCancel: onMenu
        })
      )
    )
  );
}
