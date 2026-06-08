import { createElement as h, useEffect, useState } from 'react';
import { render, useApp } from 'ink';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { MainMenuScreen } from './screens/MainMenuScreen.js';
import { StatusScreen } from './screens/StatusScreen.js';
import { ListScreen } from './screens/ListScreen.js';
import { OptionScreen } from './screens/OptionScreen.js';
import { LoadingScreen } from './screens/LoadingScreen.js';
import { LoadFailedScreen } from './screens/LoadFailedScreen.js';
import { TextEntryScreen } from './screens/TextEntryScreen.js';
import { ResultScreen } from './screens/ResultScreen.js';
import { MultiSelectScreen } from './screens/MultiSelectScreen.js';
import {
  loadAuthContextForTui,
  loadOnboardingStateInteractive,
  loadTeamsForTui,
  loadSchedulesForTui,
  loadEscalationPoliciesForTui,
  authenticateWithApiTokenForTui,
  authenticateWithBrowserForTui,
  createTeamForTui,
  addTeamMembersForTui,
  addTeamMembersByIdsForTui,
  loadAddableUsersForTui,
  loadDirectoryUsersForTui,
  createScheduleForTui,
  createEscalationPolicyForTui,
  createAlertSourceForTui,
  createTestAlertForTui,
  createTestIncidentForTui,
  deleteTokenForTui,
  runOneShotSetupForTui,
  startWebHandoffForTui,
  openExternalUrlForTui,
  previewMcpForTui,
  applyMcpForTui,
  loadTeamMembersForTui
} from '../tui-legacy-bridge.js';

const ENTER_ALT_SCREEN = '\u001b[?1049h';
const LEAVE_ALT_SCREEN = '\u001b[?1049l';
const HIDE_CURSOR = '\u001b[?25l';
const SHOW_CURSOR = '\u001b[?25h';
const CLEAR_SCREEN = '\u001b[2J';
const CLEAR_SCROLLBACK = '\u001b[3J';
const CURSOR_HOME = '\u001b[H';

const CEO_CAL_URL = 'https://cal.link/jj';

function enterAltScreen() {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`${CLEAR_SCROLLBACK}${ENTER_ALT_SCREEN}${HIDE_CURSOR}${CLEAR_SCREEN}${CURSOR_HOME}`);
}

function leaveAltScreen() {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`${SHOW_CURSOR}${LEAVE_ALT_SCREEN}${CLEAR_SCROLLBACK}`);
}

function InkWizardApp({ onExit }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState('welcome');
  const [state, setState] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [schedulesData, setSchedulesData] = useState(null);
  const [policiesData, setPoliciesData] = useState(null);
  const [authContext, setAuthContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultScreen, setResultScreen] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [formState, setFormState] = useState({});
  const [mcpPreview, setMcpPreview] = useState(null);
  const [teamMembersData, setTeamMembersData] = useState(null);
  const [addableUsers, setAddableUsers] = useState(null);
  const [directoryUsers, setDirectoryUsers] = useState(null);
  const [authRecovery, setAuthRecovery] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!['menu', 'status', 'inspect', 'teams', 'schedules', 'policies', 'schedule-members', 'add-members-picker', 'one-shot-members'].includes(screen)) return undefined;

    void (async () => {
      // Reuse cached values across navigation so returning to the menu is
      // instant. The keychain check and the workspace sweep only run when their
      // cache is empty; mutations clear the cache (see clearWorkspaceCache),
      // which forces a fresh load on the next visit.
      let nextAuth = authContext;
      if (!nextAuth) {
        setLoading(true);
        nextAuth = await loadAuthContextForTui();
        if (cancelled) return;
        setAuthContext(nextAuth);
      }
      if (!nextAuth?.hasAuth) {
        if (!cancelled) {
          setLoading(false);
          setScreen('auth-method');
        }
        return;
      }

      if (!state) {
        setLoading(true);
        const stateResult = await loadOnboardingStateInteractive();
        if (cancelled) return;
        if (!stateResult.ok) {
          setLoading(false);
          if (stateResult.reason === 'auth-capability') {
            setAuthRecovery(stateResult);
            setScreen('auth-recovery');
          } else {
            setScreen('load-failed');
          }
          return;
        }
        setState(stateResult.state);
      }

      if (screen === 'teams' && !teamsData) {
        setLoading(true);
        const nextTeams = await loadTeamsForTui();
        if (!cancelled) setTeamsData(nextTeams);
      }
      if (screen === 'schedules' && !schedulesData) {
        setLoading(true);
        const nextSchedules = await loadSchedulesForTui();
        if (!cancelled) setSchedulesData(nextSchedules);
      }
      if (screen === 'policies' && !policiesData) {
        setLoading(true);
        const nextPolicies = await loadEscalationPoliciesForTui();
        if (!cancelled) setPoliciesData(nextPolicies);
      }
      if (screen === 'schedule-members' && selectedTeam?.id && !teamMembersData) {
        setLoading(true);
        const nextMembers = await loadTeamMembersForTui(selectedTeam.id);
        if (!cancelled) setTeamMembersData(nextMembers);
      }
      if (screen === 'add-members-picker' && selectedTeam?.id && !addableUsers) {
        setLoading(true);
        const nextAddable = await loadAddableUsersForTui(selectedTeam.id);
        if (!cancelled) setAddableUsers(nextAddable);
      }
      if (screen === 'one-shot-members' && !directoryUsers) {
        setLoading(true);
        const dir = await loadDirectoryUsersForTui();
        if (!cancelled) setDirectoryUsers(dir);
      }
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen]);

  const leave = () => {
    onExit?.();
    exit();
  };

  // Drop the cached workspace snapshot so the next menu/data visit refetches.
  // Called after any action that may have changed the workspace.
  const clearWorkspaceCache = () => {
    setState(null);
    setTeamsData(null);
    setSchedulesData(null);
    setPoliciesData(null);
    setTeamMembersData(null);
    setAddableUsers(null);
  };

  // Run the one-shot chain with the chosen members and render a per-step result.
  const runOneShotWithMembers = async (memberIds) => {
    setLoading(true);
    const result = await runOneShotSetupForTui({ memberIds });
    setLoading(false);

    const stepLabels = {
      team: 'Team',
      members: 'Team members',
      schedule: 'On-call schedule',
      'escalation-policy': 'Escalation policy',
      'alert-source': 'Alert source',
      'test-alert': 'Test alert',
      'test-incident': 'Test incident'
    };
    const statusMark = { ok: '✓', reused: '•', blocked: '⚠', failed: '✗' };
    const data = result.data || {};
    const lines = [result.summary, ''];
    (data.steps || []).forEach((step) => {
      const suffix = step.status === 'reused' ? ' (existing)'
        : step.status === 'blocked' ? ' (not permitted by this sign-in)'
          : step.status === 'failed' ? ` (${step.error})` : '';
      lines.push(`${statusMark[step.status] || '·'} ${stepLabels[step.step] || step.step}${suffix}`);
    });
    if (data.incident?.slackChannelUrl) {
      lines.push('', `Incident channel: ${data.incident.slackChannelUrl}`);
    }
    if (data.note) {
      lines.push('', data.note);
    }
    setResultScreen({ title: 'Quick start', lines, next: 'menu' });
    setScreen('result');
  };

  if (screen === 'welcome') {
    return h(WelcomeScreen, {
      lines: [
        'Get from an empty workspace to incident-ready on-call in minutes.',
        '',
        'A handful of guided steps covers your teams, schedules, escalation, alerting, and integrations. No docs required.'
      ],
      // Head to the menu, whose effect checks the keychain for a stored
      // sign-in: returning users skip auth entirely, and only an unauthed
      // session gets routed on to the sign-in chooser.
      onContinue: () => setScreen('menu'),
      onExit: leave
    });
  }

  if (screen === 'auth-method') {
    const hasAuth = Boolean(authContext?.hasAuth);
    return h(OptionScreen, {
      title: 'Sign in with Rootly',
      lines: hasAuth
        ? [
            authContext?.label || 'A Rootly sign-in is already stored on this machine.',
            'Keep the current sign-in, or sign in with a different API token.'
          ]
        : [
            'Sign in with a Rootly API token.',
            '',
            'A token unlocks the full setup, including Quick start.'
          ],
      options: [
        ...(hasAuth ? [{ label: 'Keep current sign-in', value: 'keep' }] : []),
        { label: 'API token', value: 'token' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'keep') {
          setScreen('menu');
          return;
        }
        if (option.value === 'back') {
          setScreen(hasAuth ? 'menu' : 'welcome');
          return;
        }
        if (option.value === 'token') {
          setScreen('auth-token');
          return;
        }
        // Browser sign-in is currently hidden (it can't write workspace setup),
        // but the path remains here in case it's re-enabled.
        if (option.value === 'browser') {
          setLoading(true);
          const result = await authenticateWithBrowserForTui();
          setLoading(false);
          if (result.ok) {
            setAuthContext(null);
            clearWorkspaceCache();
            setScreen('menu');
            return;
          }
          setResultScreen({
            title: 'Auth failed',
            lines: [result.summary],
            next: 'auth-method'
          });
          setScreen('result');
        }
      },
      onBack: () => {
        setScreen(hasAuth ? 'menu' : 'welcome');
      }
    });
  }

  if (screen === 'auth-token') {
    return h(TextEntryScreen, {
      title: 'API token',
      prompt: 'Paste a Rootly API token.',
      lines: [
        'Create one in Rootly: Organization Settings → API Keys → Generate New API Key.',
        'Use a Global key with write access (teams, schedules, escalation, alerts, incidents),',
        'or a Personal key if your account can manage those.'
      ],
      link: 'Docs: https://docs.rootly.com/api-reference/overview',
      placeholder: 'token',
      hidden: true,
      onSubmit: async (value) => {
        setLoading(true);
        const result = await authenticateWithApiTokenForTui(value);
        setLoading(false);
        if (result.ok) {
          setAuthContext(null);
          clearWorkspaceCache();
          setScreen('menu');
          return;
        }
        setResultScreen({
          title: 'Auth failed',
          lines: [result.summary],
          next: 'auth-token'
        });
        setScreen('result');
      },
      onBack: () => setScreen('auth-method')
    });
  }

  if (screen === 'load-failed') {
    return h(LoadFailedScreen, {
      onBack: () => setScreen('menu'),
      onExit: leave
    });
  }

  if (screen === 'auth-recovery') {
    return h(OptionScreen, {
      title: 'Auth needs attention',
      lines: [
        authRecovery?.label || 'A stored Rootly sign-in was found.',
        authRecovery?.isBrowserSession
          ? 'Browser sign-in completed, but this OAuth session cannot read the workspace setup APIs yet.'
          : 'The stored sign-in could not read this Rootly workspace.',
        authRecovery?.isBrowserSession
          ? 'Sign in with an API token for now, or retry browser sign-in after Rootly grants workspace API access.'
          : 'Sign in again to continue.'
      ],
      options: [
        { label: 'Sign in again', value: 'reauth' },
        { label: 'Exit wizard', value: 'exit' }
      ],
      onSelect: async (option) => {
        if (option.value === 'exit') {
          leave();
          return;
        }
        await deleteTokenForTui();
        setAuthRecovery(null);
        setAuthContext(null);
        setScreen('auth-method');
      },
      onBack: leave
    });
  }

  if (screen === 'result' && resultScreen) {
    return h(ResultScreen, {
      title: resultScreen.title,
      lines: resultScreen.lines,
      onContinue: () => {
        // Results that return to the menu may follow a mutation; refresh the
        // workspace snapshot so coverage reflects the change.
        if (resultScreen.next === 'menu') clearWorkspaceCache();
        setScreen(resultScreen.next);
      },
      onExit: leave,
      continueLabel: resultScreen.next === 'menu' ? 'Continue' : 'Try again'
    });
  }

  if (loading) {
    return h(LoadingScreen, {
      title: screen === 'menu' ? 'Loading Rootly workspace…' : 'Loading Rootly data…',
      detail: authContext?.label || 'Checking your current sign-in and workspace state.'
    });
  }

  if (screen === 'status') {
    return h(StatusScreen, {
      state,
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'general-menu') {
    return h(OptionScreen, {
      title: 'General setup',
      context: 'menu',
      lines: ['Everything beyond the recommended next step.'],
      options: [
        { label: 'Setup: teams, members, schedules, escalation', value: 'setup' },
        { label: 'Integrations: Slack, alert sources, vendors', value: 'integrations' },
        { label: 'Verify: test alerting and incidents', value: 'verify' },
        { label: 'Inspect: status, teams, schedules', value: 'inspect' },
        { label: 'Set up MCP / IDE', value: 'mcp' },
        { label: 'Switch sign-in', value: 'auth' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') {
          setScreen('menu');
          return;
        }
        if (option.value === 'setup') {
          setScreen('setup-menu');
          return;
        }
        if (option.value === 'integrations') {
          setScreen('integrations-menu');
          return;
        }
        if (option.value === 'verify') {
          setScreen('verify-menu');
          return;
        }
        if (option.value === 'inspect') {
          setScreen('inspect');
          return;
        }
        if (option.value === 'mcp') {
          setScreen('mcp-menu');
          return;
        }
        if (option.value === 'auth') {
          setScreen('auth-method');
          return;
        }
        setScreen('menu');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'inspect') {
    return h(OptionScreen, {
      title: 'Inspect',
      lines: ['Browse workspace status and coverage.'],
      options: [
        { label: 'Workspace status', value: 'status' },
        { label: 'Teams', value: 'teams' },
        { label: 'Schedules', value: 'schedules' },
        { label: 'Escalation policies', value: 'policies' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') setScreen('general-menu');
        else setScreen(option.value);
      },
      onBack: () => setScreen('general-menu')
    });
  }

  if (screen === 'setup-menu') {
    return h(OptionScreen, {
      title: 'Setup',
      lines: ['Choose the setup action you want to run.'],
      options: [
        { label: 'Create a team', value: 'create-team' },
        { label: 'Add team members', value: 'add-members-picker' },
        { label: 'Create a schedule', value: 'create-schedule' },
        { label: 'Create an escalation policy', value: 'create-escalation' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') {
          setScreen('general-menu');
          return;
        }
        if (option.value === 'create-team') {
          setScreen('create-team');
          return;
        }
        setFormState({ pendingAction: option.value === 'create-schedule' ? 'create-schedule-name' : option.value });
        setScreen('team-picker');
      },
      onBack: () => setScreen('general-menu')
    });
  }

  if (screen === 'verify-menu') {
    return h(OptionScreen, {
      title: 'Verify',
      lines: ['Choose the verification flow you want to run.'],
      options: [
        { label: 'Send a test alert', value: 'create-test-alert' },
        { label: 'Create a test incident', value: 'create-test-incident' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') {
          setScreen('general-menu');
          return;
        }
        setFormState({ pendingAction: option.value });
        setScreen('team-picker');
      },
      onBack: () => setScreen('general-menu')
    });
  }

  if (screen === 'integrations-menu') {
    return h(OptionScreen, {
      title: 'Integrations',
      lines: ['Choose the integration flow you want to run.'],
      options: [
        { label: 'Connect Slack for incidents', value: 'slack' },
        { label: 'Connect an alert source', value: 'alert-source' },
        { label: 'Connect vendor integration in Rootly web', value: 'vendor' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('general-menu');
          return;
        }
        if (option.value === 'alert-source') {
          setFormState({ pendingAction: 'create-alert-source' });
          setScreen('team-picker');
          return;
        }
        if (option.value === 'slack') {
          setLoading(true);
          const result = await startWebHandoffForTui({ kind: 'Slack', open: true });
          setLoading(false);
          setResultScreen({
            title: result.ok ? 'Slack handoff ready' : 'Slack handoff failed',
            lines: result.ok
              ? [
                  'Slack still uses the Rootly web flow.',
                  result.data?.url ? `Opened: ${result.data.url}` : 'Open the Slack setup page in Rootly.',
                  'Finish connecting Slack in your browser, then choose Continue to refresh your workspace status.'
                ]
              : [result.summary],
            next: 'menu'
          });
          setScreen('result');
          return;
        }
        setScreen('vendor-menu');
      },
      onBack: () => setScreen('general-menu')
    });
  }

  if (screen === 'vendor-menu') {
    return h(OptionScreen, {
      title: 'Vendor integration',
      lines: ['These integrations still connect through Rootly web.'],
      options: [
        { label: 'Datadog', value: 'Datadog' },
        { label: 'Grafana', value: 'Grafana' },
        { label: 'PagerDuty', value: 'PagerDuty' },
        { label: 'Opsgenie', value: 'Opsgenie' },
        { label: 'Sentry', value: 'Sentry' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('integrations-menu');
          return;
        }
        setLoading(true);
        const result = await startWebHandoffForTui({ kind: option.value, open: true });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Vendor handoff ready' : 'Vendor handoff failed',
          lines: result.ok
            ? [
                `Opened ${option.value} in Rootly web.`,
                result.data?.url || '',
                `Finish connecting ${option.value} in your browser, then choose Continue to refresh your workspace status.`
              ]
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('integrations-menu')
    });
  }

  if (screen === 'mcp-menu') {
    return h(OptionScreen, {
      title: 'MCP / IDE setup',
      lines: ['Configure the hosted Rootly MCP server for supported clients.'],
      options: [
        { label: 'Preview Codex config', value: 'preview-codex' },
        { label: 'Apply Codex config', value: 'apply-codex' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('menu');
          return;
        }
        setLoading(true);
        if (option.value === 'preview-codex') {
          const result = await previewMcpForTui({ clients: ['Codex'], auth: 'Use stored token' });
          setLoading(false);
          setMcpPreview(result);
          setScreen('mcp-preview');
          return;
        }
        const result = await applyMcpForTui({ clients: ['Codex'], auth: 'Use stored token' });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'MCP configured' : 'MCP setup blocked',
          lines: result.ok
            ? (result.data?.results || []).map((entry) => `${entry.client}: ${entry.targetPath}`)
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'mcp-preview') {
    return h(ListScreen, {
      title: 'MCP preview',
      items: (mcpPreview?.data?.preview || []).map((entry) => entry.replace(/\n/g, ' ')),
      emptyLabel: 'No preview available.',
      onBack: () => setScreen('mcp-menu')
    });
  }

  if (screen === 'teams') {
    return h(ListScreen, {
      title: 'Teams',
      items: (teamsData?.teams || []).map((team) => `${team.name} · ${team.memberCount || 0} members · ${team.scheduleCount || 0} schedules · ${team.escalationPolicyCount || 0} escalations`),
      emptyLabel: 'No teams found.',
      onBack: () => setScreen('inspect')
    });
  }

  if (screen === 'schedules') {
    return h(ListScreen, {
      title: 'Schedules',
      items: (schedulesData?.schedules || []).map((schedule) => {
        const attrs = schedule.attributes || {};
        const owners = Array.isArray(attrs.owner_group_ids) && attrs.owner_group_ids.length > 0
          ? `${attrs.owner_group_ids.length} teams`
          : 'no teams';
        return `${attrs.name || schedule.id} · ${attrs.all_time_coverage ? '24/7' : 'custom coverage'} · ${owners}`;
      }),
      emptyLabel: 'No schedules found.',
      onBack: () => setScreen('inspect')
    });
  }

  if (screen === 'policies') {
    return h(ListScreen, {
      title: 'Escalation policies',
      items: (policiesData?.policies || []).map((policy) => {
        const attrs = policy.attributes || {};
        const teamCount = Array.isArray(attrs.group_ids) ? attrs.group_ids.length : 0;
        return `${attrs.name || policy.id} · ${teamCount} teams · repeats ${attrs.repeat_count ?? 0}`;
      }),
      emptyLabel: 'No escalation policies found.',
      onBack: () => setScreen('inspect')
    });
  }

  if (screen === 'setup-complete') {
    return h(OptionScreen, {
      title: "You're incident-ready 🎉",
      context: 'all set',
      lines: [
        'Your core Rootly setup is in place — teams, on-call, escalation, and alerting.',
        '',
        'Want to talk through your setup? JJ, our CEO, would love to chat.'
      ],
      options: [
        { label: 'Chat with the CEO', value: 'chat-ceo' },
        { label: 'Back to menu', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('menu');
          return;
        }
        setLoading(true);
        const result = await openExternalUrlForTui(CEO_CAL_URL);
        setLoading(false);
        setResultScreen({
          title: 'Chat with the CEO',
          lines: [
            result.opened
              ? "Opened JJ's calendar in your browser."
              : 'Open this link to book a time with JJ:',
            CEO_CAL_URL
          ],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'one-shot') {
    return h(OptionScreen, {
      title: 'Quick start',
      lines: [
        'Set up everything at once: a team, an on-call schedule, an escalation policy, and an alert source — then fire a test alert and open a test incident so you can see the full flow.',
        '',
        'Next you’ll pick who goes on the team and on call. Already-existing pieces are reused, and a browser sign-in does as much as it can.'
      ],
      options: [
        { label: 'Choose members & run', value: 'run' },
        { label: 'Back to menu', value: 'back' }
      ],
      onSelect: (option) => {
        setScreen(option.value === 'run' ? 'one-shot-members' : 'menu');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'one-shot-members') {
    const options = (directoryUsers?.users || []).map((user) => ({
      label: user.name ? `${user.name}${user.email ? ` — ${user.email}` : ''}` : (user.email || user.id),
      value: user.id
    }));

    // No directory (e.g. an OAuth session that can't read /v1/users): run anyway
    // and let the chain seed the current identity so the rotation isn't empty.
    if (!options.length) {
      return h(OptionScreen, {
        title: 'Quick start',
        lines: [
          directoryUsers?.userLookupUnavailable
            ? 'This sign-in can’t list Rootly users, so members can’t be picked. Quick start will still set up the team and put the current identity on call.'
            : 'No users were found to add. Quick start will set up the team with the current identity on call.'
        ],
        options: [
          { label: 'Run quick start', value: 'run' },
          { label: 'Back to menu', value: 'back' }
        ],
        onSelect: (option) => {
          if (option.value === 'back') setScreen('menu');
          else void runOneShotWithMembers([]);
        },
        onBack: () => setScreen('menu')
      });
    }

    return h(MultiSelectScreen, {
      title: 'Who goes on the team & on call?',
      options,
      onSubmit: (selectedOptions) => {
        void runOneShotWithMembers(selectedOptions.map((option) => option.value));
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'placeholder') {
    return h(OptionScreen, {
      title: 'Nothing to do here',
      lines: [
        'There is no recommended action to run right now.',
        'Use the menu to inspect your workspace, run setup, or connect integrations.'
      ],
      options: [
        { label: 'Back to main menu', value: 'back' }
      ],
      onSelect: () => setScreen('menu'),
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'exit-confirm') {
    return h(OptionScreen, {
      title: 'Exit',
      lines: ['Keep your saved sign-in for next time?'],
      // Default (first / preselected) option keeps the sign-in.
      options: [
        { label: 'Just exit', value: 'keep' },
        { label: 'Delete from keychain', value: 'delete' }
      ],
      onSelect: async (option) => {
        if (option.value === 'delete') {
          setLoading(true);
          await deleteTokenForTui();
          setLoading(false);
        }
        leave();
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'create-team') {
    return h(TextEntryScreen, {
      title: 'Create a team',
      prompt: 'Enter the team name you want to create.',
      placeholder: 'Team name',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await createTeamForTui({ name: value });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Team created' : 'Team setup needs attention',
          lines: result.ok
            ? [`Team: ${result.data?.name || value}`, result.data?.id ? `Team ID: ${result.data.id}` : 'Team created']
            : [result.summary],
          next: result.ok ? 'menu' : 'create-team'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'team-picker') {
    return h(OptionScreen, {
      title: 'Select a team',
      lines: ['Choose the team for the next step.'],
      options: [
        ...((state?.teams?.all || []).map((team) => ({
          label: `${team.name} (${team.memberCount || 0} members, ${team.scheduleCount || 0} schedules, ${team.escalationPolicyCount || 0} escalations)`,
          value: team.id
        }))),
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') {
          setScreen('menu');
          return;
        }
        const team = (state?.teams?.all || []).find((entry) => entry.id === option.value) || null;
        setSelectedTeam(team);
        const next = formState.pendingAction;
        setScreen(next || 'menu');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'add-members-picker') {
    const options = (addableUsers?.addable || []).map((user) => ({
      label: user.name || user.email || user.id,
      value: user.id
    }));

    if (!options.length) {
      const lookupUnavailable = addableUsers?.userLookupUnavailable;
      return h(OptionScreen, {
        title: 'Add team members',
        lines: lookupUnavailable
          ? [
              'This sign-in can’t list Rootly users (the user directory needs an API key).',
              'Invite someone by email instead.'
            ]
          : [
              selectedTeam
                ? `Everyone in this workspace is already on ${selectedTeam.name}, or there are no other users to add.`
                : 'No users available to add.',
              'You can still invite someone by email.'
            ],
        options: [
          { label: 'Invite by email instead', value: 'email' },
          { label: 'Back', value: 'back' }
        ],
        onSelect: (option) => {
          if (option.value === 'email') setScreen('add-team-members');
          else setScreen('general-menu');
        },
        onBack: () => setScreen('general-menu')
      });
    }

    return h(MultiSelectScreen, {
      title: selectedTeam ? `Add members to ${selectedTeam.name}` : 'Add team members',
      options,
      onSubmit: async (selectedOptions) => {
        if (!selectedOptions.length) {
          setScreen('menu');
          return;
        }
        setLoading(true);
        const result = await addTeamMembersByIdsForTui({
          teamId: selectedTeam?.id,
          userIds: selectedOptions.map((option) => option.value)
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Team members added' : 'Team members need attention',
          lines: result.ok
            ? [
                `Team: ${selectedTeam?.name || 'Unknown'}`,
                `Added as members: ${selectedOptions.map((option) => option.label).join(', ')}`
              ]
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('general-menu')
    });
  }

  if (screen === 'add-team-members') {
    return h(TextEntryScreen, {
      title: 'Add team members (by email)',
      prompt: selectedTeam ? `Comma-separated emails for ${selectedTeam.name}` : 'Comma-separated emails',
      placeholder: 'alice@example.com, bob@example.com',
      onSubmit: async (value) => {
        setLoading(true);
        const emails = value.split(',').map((entry) => entry.trim()).filter(Boolean);
        const result = await addTeamMembersForTui({ teamId: selectedTeam?.id, emails });
        setLoading(false);
        const memberNames = (result.data?.matchedUsers || [])
          .map((user) => user.name || user.email)
          .filter(Boolean)
          .join(', ');
        setResultScreen({
          title: result.ok ? 'Team members updated' : 'Team members need attention',
          lines: result.ok
            ? [
                `Team: ${selectedTeam?.name || 'Unknown'}`,
                result.data?.userLookupUnavailable
                  ? 'Could not resolve Rootly users; emails attached as team contacts.'
                  : `Added as members: ${memberNames || 'no new members'}`,
                ...(result.data?.unresolvedEmails?.length
                  ? [`Not in Rootly yet (added as contacts): ${result.data.unresolvedEmails.join(', ')}`]
                  : [])
              ]
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'create-schedule-name') {
    return h(TextEntryScreen, {
      title: 'Create a schedule',
      prompt: selectedTeam ? `Schedule name for ${selectedTeam.name}` : 'Schedule name',
      initialValue: selectedTeam ? `${selectedTeam.name} On-Call` : '',
      onSubmit: (value) => {
        setFormState((current) => ({ ...current, scheduleName: value || `${selectedTeam?.name || 'Team'} On-Call` }));
        setScreen('create-schedule-handoff');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'create-schedule-handoff') {
    return h(TextEntryScreen, {
      title: 'Daily handoff time',
      prompt: 'HH:MM (workspace timezone)',
      initialValue: '09:00',
      onSubmit: (value) => {
        setFormState((current) => ({ ...current, handoffTime: value || '09:00' }));
        setScreen('schedule-members');
      },
      onBack: () => setScreen('create-schedule-name')
    });
  }

  if (screen === 'schedule-members') {
    const memberOptions = (teamMembersData?.members || [])
      .filter((member) => !member.serviceAccount)
      .map((member) => ({
        label: member.name || member.email || member.id,
        value: member.id
      }));

    if (!memberOptions.length) {
      return h(OptionScreen, {
        title: 'On-call rotation',
        lines: [
          selectedTeam ? `${selectedTeam.name} has no members to staff a rotation yet.` : 'This team has no members to staff a rotation yet.',
          'The schedule will be created without a staffed rotation.'
        ],
        options: [
          { label: 'Create schedule anyway', value: 'continue' },
          { label: 'Back', value: 'back' }
        ],
        onSelect: async (option) => {
          if (option.value === 'back') {
            setScreen('create-schedule-handoff');
            return;
          }
          setLoading(true);
          const result = await createScheduleForTui({
            teamId: selectedTeam?.id,
            name: formState.scheduleName,
            handoffTime: formState.handoffTime || '09:00',
            memberIds: []
          });
          setLoading(false);
          setResultScreen({
            title: result.ok ? 'Schedule created' : 'Schedule setup needs attention',
            lines: result.ok
              ? [`Team: ${selectedTeam?.name || 'Unknown'}`, `Schedule: ${formState.scheduleName}`, 'No one is on the initial rotation yet.']
              : [result.summary],
            next: 'menu'
          });
          setScreen('result');
        },
        onBack: () => setScreen('create-schedule-handoff')
      });
    }

    return h(MultiSelectScreen, {
      title: 'Who should be on the on-call rotation?',
      options: memberOptions,
      onSubmit: async (selectedOptions) => {
        setLoading(true);
        const result = await createScheduleForTui({
          teamId: selectedTeam?.id,
          name: formState.scheduleName,
          handoffTime: formState.handoffTime || '09:00',
          memberIds: selectedOptions.map((option) => option.value)
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Schedule created' : 'Schedule setup needs attention',
          lines: result.ok
            ? [
              `Team: ${selectedTeam?.name || 'Unknown'}`,
              `Schedule: ${formState.scheduleName}`,
              `Rotation members: ${selectedOptions.map((option) => option.label).join(', ') || 'none'}`
            ]
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('create-schedule-handoff')
    });
  }

  if (screen === 'create-escalation') {
    return h(TextEntryScreen, {
      title: 'Create an escalation policy',
      prompt: selectedTeam ? `Policy name for ${selectedTeam.name}` : 'Policy name',
      initialValue: selectedTeam ? `${selectedTeam.name} Default Escalation` : '',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await createEscalationPolicyForTui({
          teamId: selectedTeam?.id,
          name: value || `${selectedTeam?.name || 'Team'} Default Escalation`,
          repeatCount: 1
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Escalation policy created' : 'Escalation policy needs attention',
          lines: result.ok
            ? [`Team: ${selectedTeam?.name || 'Unknown'}`, `Policy: ${result.data?.name || value}`]
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'create-alert-source') {
    return h(TextEntryScreen, {
      title: 'Connect an alert source',
      prompt: selectedTeam ? `Alert source name for ${selectedTeam.name}` : 'Alert source name',
      initialValue: selectedTeam ? `${selectedTeam.name} Generic Webhook` : 'Generic webhook',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await createAlertSourceForTui({
          teamId: selectedTeam?.id,
          name: value || 'Generic webhook'
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Alert source created' : 'Alert source needs attention',
          lines: result.ok
            ? [`Source: ${result.data?.name || value}`, result.data?.webhookEndpoint ? `Webhook: ${result.data.webhookEndpoint}` : 'Webhook created']
            : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'create-test-alert') {
    return h(TextEntryScreen, {
      title: 'Send a test alert',
      prompt: selectedTeam ? `Alert summary for ${selectedTeam.name}` : 'Alert summary',
      initialValue: 'Rootly Wizard test alert',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await createTestAlertForTui({
          summary: value || 'Rootly Wizard test alert',
          groupIds: selectedTeam?.id ? [selectedTeam.id] : []
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Test alert sent' : 'Test alert needs attention',
          lines: result.ok ? [`Alert: ${result.data?.summary || value}`] : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'create-test-incident') {
    return h(TextEntryScreen, {
      title: 'Create a test incident',
      prompt: selectedTeam ? `Incident title for ${selectedTeam.name}` : 'Incident title',
      initialValue: 'Rootly Wizard test incident',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await createTestIncidentForTui({
          title: value || 'Rootly Wizard test incident',
          groupIds: selectedTeam?.id ? [selectedTeam.id] : []
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Test incident created' : 'Test incident needs attention',
          lines: result.ok ? [`Incident: ${result.data?.title || value}`] : [result.summary],
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  return h(MainMenuScreen, {
    state,
    onBack: (option) => {
      if (!option) {
        leave();
        return;
      }
      if (option.value === 'back') {
        leave();
        return;
      }
      if (option.value === 'exit') {
        leave();
        return;
      }
      if (option.value === 'status') {
        setScreen('status');
        return;
      }
      if (option.value === 'auth') {
        setScreen('auth-method');
        return;
      }
      if (option.value === 'inspect') {
        setScreen('inspect');
        return;
      }
      if (option.value === 'quickstart') {
        setScreen('one-shot');
        return;
      }
      if (option.value === 'create-team') {
        setScreen('create-team');
        return;
      }
      if (option.value === 'setup') {
        setScreen('setup-menu');
        return;
      }
      if (option.value === 'general') {
        setScreen('general-menu');
        return;
      }
      if (option.value === 'recommended') {
        const nextAction = state?.onboarding?.nextBestAction;
        if (nextAction === 'create-team') {
          setScreen('create-team');
          return;
        }
        if (nextAction === 'invite-team-members') {
          setFormState({ pendingAction: 'add-members-picker' });
          setScreen('team-picker');
          return;
        }
        if (nextAction === 'create-schedule') {
          setFormState({ pendingAction: 'create-schedule-name' });
          setScreen('team-picker');
          return;
        }
        if (nextAction === 'create-escalation-policy') {
          setFormState({ pendingAction: 'create-escalation' });
          setScreen('team-picker');
          return;
        }
        if (nextAction === 'hook-up-monitor') {
          setFormState({ pendingAction: 'create-alert-source' });
          setScreen('team-picker');
          return;
        }
        setScreen('setup-complete');
        return;
      }
      if (option.value === 'integrations') {
        setScreen('integrations-menu');
        return;
      }
      if (option.value === 'verify') {
        setScreen('verify-menu');
        return;
      }
      if (option.value === 'mcp') {
        setScreen('mcp-menu');
        return;
      }
      setScreen('placeholder');
    },
    onExit: () => setScreen('exit-confirm')
  });
}

export async function startInteractiveWizard() {
  let closed = false;
  enterAltScreen();
  const app = render(h(InkWizardApp, { onExit: () => { closed = true; } }), {
    stdout: process.stdout,
    stdin: process.stdin,
    exitOnCtrlC: true
  });
  try {
    await app.waitUntilExit();
    return { closed };
  } finally {
    leaveAltScreen();
  }
}
