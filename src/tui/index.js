import { createElement as h, useEffect, useState } from 'react';
import { render, useApp, Box } from 'ink';
import { palette } from './theme.js';
import { friendlyError, formatPhone, hyperlink } from '../format.js';
import { BigText } from './components/BigText.js';
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
import { OneShotRunnerScreen } from './screens/OneShotRunnerScreen.js';
import { Celebration } from './components/Celebration.js';
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
  createStatusPageForTui,
  loadStatusPageComponentsForTui,
  loadStatusPagesForTui,
  publishStatusPageForTui,
  updateStatusPageForTui,
  createTestAlertForTui,
  createTestIncidentForTui,
  deleteTokenForTui,
  runOneShotSetupForTui,
  startPhoneVerificationForTui,
  confirmPhoneVerificationForTui,
  loadCurrentUserPhoneForTui,
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
const SALES_DEMO_URL = 'https://rootly.com/demo?utm_term=rootly&utm_campaign=Rootly_Brand_Search_USA&utm_source=google&utm_medium=ppc&utm_content=featuresad&gad_source=1&gad_campaignid=22513408256&gbraid=0AAAAACV5CgFej7JQ4Q1NvqRnqhOLGHiP8';
const APP_BASE_URL = (process.env.ROOTLY_APP_URL?.trim().replace(/\/$/, '')) || 'https://rootly.com';
const SIGNUP_URL = `${APP_BASE_URL}/users/sign_up`;
const STATUS_PAGES_URL = `${APP_BASE_URL}/account/status-pages`;

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
  const [spComponents, setSpComponents] = useState(null);
  const [spExisting, setSpExisting] = useState(null);
  const [userPhone, setUserPhone] = useState(null);
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

  // Detect existing status pages at the start of the guided flow.
  useEffect(() => {
    if (screen !== 'sp-start' || spExisting !== null) return undefined;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const data = await loadStatusPagesForTui();
      if (!cancelled) {
        setSpExisting(data || { pages: [] });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, spExisting]);

  // "Set up your public status page" jumps straight to the seeded public page
  // (no picker, no create-vs-customize branch). If none exists, fall to create.
  useEffect(() => {
    if (screen !== 'sp-start' || spExisting === null || !formState.sp?.directPublic) return undefined;
    const publicPage = (spExisting.pages || []).find((p) => p.public);
    if (publicPage) {
      setFormState((prev) => ({ ...prev, sp: { ...(prev.sp || {}), existingPage: publicPage } }));
      setScreen('sp-edit-menu'); // jump straight into editing the public page
    } else {
      setScreen('sp-name');
    }
    return undefined;
  }, [screen, spExisting]);

  // Load services/functionalities to offer as status-page components.
  useEffect(() => {
    if ((screen !== 'sp-components' && screen !== 'sp-edit-components') || spComponents !== null) return undefined;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const data = await loadStatusPageComponentsForTui();
      if (!cancelled) {
        setSpComponents(data || { components: [] });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, spComponents]);

  // Load the signed-in user's existing phone (for the pre-flight screen) so we
  // can show it instead of offering to add one.
  useEffect(() => {
    if (screen !== 'one-shot-prereqs' || userPhone !== null) return undefined;
    let cancelled = false;
    void (async () => {
      const info = await loadCurrentUserPhoneForTui();
      if (!cancelled) setUserPhone(info || { hasPhone: false, phone: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, userPhone]);

  // Landing on a menu ends any in-progress flow: clear the picked team and the
  // pending-action form so a later flow can't act on a stale team selection.
  useEffect(() => {
    if (screen === 'menu' || screen === 'general-menu') {
      setSelectedTeam(null);
      setFormState({});
    }
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

  // Loading takes precedence over the current screen, so a loader shows even
  // while we're still "on" the auth-token / data screens.
  if (loading) {
    if (screen === 'auth-token') {
      return h(LoadingScreen, {
        title: 'Signing you in…',
        detail: 'Verifying your token with Rootly.'
      });
    }
    return h(LoadingScreen, {
      title: screen === 'menu' ? 'Loading Rootly workspace…' : 'Loading Rootly data…',
      detail: authContext?.label || 'Checking your current sign-in and workspace state.'
    });
  }

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
            '',
            'Keep it, or sign in another way.'
          ]
        : [
            'Choose how to sign in to Rootly.',
            '',
            'Browser sign-in uses OAuth. An API token works for the full setup and automation.'
          ],
      options: [
        ...(hasAuth ? [{ label: 'Keep current sign-in', value: 'keep' }] : []),
        { label: 'Browser sign-in', value: 'browser' },
        { label: 'API token', value: 'token' },
        ...(hasAuth ? [] : [{ label: 'Create a Rootly account', value: 'signup' }]),
        { label: 'Exit', value: 'exit' }
      ],
      onSelect: async (option) => {
        if (option.value === 'keep') {
          setScreen('menu');
          return;
        }
        if (option.value === 'exit') {
          // Exit, with the option to keep or delete the stored sign-in.
          setScreen('exit-confirm');
          return;
        }
        if (option.value === 'signup') {
          // No headless signup API — hand off to the web (it's bot-protected and
          // needs email confirmation). They come back and sign in after.
          setLoading(true);
          const opened = await openExternalUrlForTui(SIGNUP_URL);
          setLoading(false);
          setResultScreen({
            title: 'Create a Rootly account',
            lines: [
              opened?.opened
                ? 'Opened the Rootly sign-up page in your browser.'
                : 'Open this link to create your Rootly account:',
              '',
              SIGNUP_URL,
              '',
              'Once your account is set up, come back and sign in with an API token.'
            ],
            next: 'auth-method'
          });
          setScreen('result');
          return;
        }
        if (option.value === 'token') {
          setScreen('auth-token');
          return;
        }
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
          setResultScreen({ title: 'Sign-in failed', lines: [friendlyError(result.summary)], next: 'auth-method' });
          setScreen('result');
        }
      },
      onBack: () => setScreen(hasAuth ? 'menu' : 'welcome')
    });
  }

  if (screen === 'auth-token') {
    const hasAuth = Boolean(authContext?.hasAuth);
    return h(TextEntryScreen, {
      title: 'Authorize with a Rootly API token',
      prompt: hasAuth
        ? 'Paste a token to replace your stored one.'
        : 'Paste your Rootly API token below.',
      lines: [
        'Need a token? Create one in Rootly:',
        'Organization Settings → API Keys → New API Key',
        'Use a Global key with write access'
      ],
      link: 'Docs: https://docs.rootly.com/api-reference/overview',
      placeholder: 'token',
      hidden: true,
      onSubmit: async (value) => {
        setLoading(true);
        const result = await authenticateWithApiTokenForTui(value);
        if (result.ok) {
          setAuthContext(null);
          clearWorkspaceCache();
          // False timeout so the sign-in loader is visible instead of flashing by.
          await new Promise((resolve) => setTimeout(resolve, 2300));
          setLoading(false);
          setScreen('menu');
          return;
        }
        setLoading(false);
        setResultScreen({
          title: 'Auth failed',
          lines: [friendlyError(result.summary)],
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
        '',
        authRecovery?.isBrowserSession
          ? 'Browser sign-in completed, but this OAuth session cannot read the workspace setup APIs yet.'
          : 'The stored sign-in could not read this Rootly workspace.',
        '',
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
      continueLabel: resultScreen.continueLabel || (resultScreen.next === 'menu' ? 'Continue' : 'Try again')
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
        { label: 'Create a status page', value: 'create-status-page' },
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
        if (option.value === 'create-status-page') {
          // Launch the guided public status-page flow (detects existing pages first).
          setSpExisting(null);
          setFormState({ sp: { isPublic: true, returnTo: 'general-menu' } });
          setScreen('sp-start');
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
                  '',
                  result.data?.url ? hyperlink(result.data.url, '↗ Open Slack setup') : 'Open the Slack setup page in Rootly.',
                  '',
                  'Finish connecting Slack in your browser, then choose Continue to refresh your workspace status.'
                ]
              : [friendlyError(result.summary)],
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
                ...(result.data?.url ? ['', hyperlink(result.data.url, `↗ Open ${option.value} setup`)] : []),
                '',
                `Finish connecting ${option.value} in your browser, then choose Continue to refresh your workspace status.`
              ]
            : [friendlyError(result.summary)],
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
            : [friendlyError(result.summary)],
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
      context: 'all set',
      header: h(
        Box,
        { flexDirection: 'column', alignItems: 'center', marginBottom: 1 },
        h(Celebration),
        h(BigText, { text: 'INCIDENT-READY', color: palette.brand })
      ),
      lines: [
        'Your core Rootly setup is in place — teams, on-call, escalation, and alerting.',
        '',
        'Your account comes with a public status page — set it up to keep customers informed.'
      ],
      options: [
        { label: 'Set up your public status page', value: 'status-page' },
        { label: 'Continue configuring the platform', value: 'configure' },
        { label: 'Talk to our founder JJ (seriously)', value: 'chat-ceo' },
        { label: 'Book a demo with sales', value: 'book-demo' },
        { label: 'Back to menu', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'status-page') {
          // Go straight to the seeded public page (no picker, no create branch).
          setSpExisting(null);
          setFormState({ sp: { isPublic: true, directPublic: true, returnTo: 'menu' } });
          setScreen('sp-start');
          return;
        }
        if (option.value === 'configure') {
          setScreen('general-menu');
          return;
        }
        if (option.value === 'back') {
          setScreen('menu');
          return;
        }
        const handoff = option.value === 'book-demo'
          ? {
              url: SALES_DEMO_URL,
              title: 'Book a demo with sales',
              opened: 'Opened the Rootly demo booking page in your browser.',
              fallback: 'Open this link to book a demo with sales:'
            }
          : {
              url: CEO_CAL_URL,
              title: 'Talk to our founder JJ',
              opened: "Opened JJ's calendar in your browser.",
              fallback: 'Open this link to book a time with JJ:'
            };
        setLoading(true);
        const result = await openExternalUrlForTui(handoff.url);
        setLoading(false);
        setResultScreen({
          title: handoff.title,
          lines: [
            result.opened ? handoff.opened : handoff.fallback,
            '',
            handoff.url
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
        'Set up everything at once: a team, an on-call schedule, an escalation policy, and an alert source, then fire a test alert and open a test incident so you can see the full flow.',
        '',
        'Next you’ll pick who goes on the team and on call. Anything that already exists is reused.'
      ],
      options: [
        { label: 'Continue', value: 'continue' },
        { label: 'Back to menu', value: 'back' }
      ],
      onSelect: (option) => {
        setScreen(option.value === 'continue' ? 'one-shot-prereqs' : 'menu');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'one-shot-prereqs') {
    // Wait for the phone lookup before rendering, so the screen doesn't flash
    // the "no phone" layout and then flip to "phone on file" when it resolves.
    if (userPhone === null) {
      return h(LoadingScreen, {
        title: 'Getting things ready…',
        detail: 'Checking how you’ll be notified.'
      });
    }

    const openHandoff = async (kind, title, where) => {
      setLoading(true);
      const result = await startWebHandoffForTui({ kind, open: true });
      setLoading(false);
      const url = result?.data?.url;
      setResultScreen({
        title,
        lines: result?.data?.opened
          ? [`Opened ${where} in your browser.`, '', 'We’ll be here when you’re done.', ...(url ? ['', url] : [])]
          : ['Open this link to finish, then continue here:', ...(url ? ['', url] : [])],
        next: 'one-shot-prereqs'
      });
      setScreen('result');
    };

    const hasPhone = Boolean(userPhone?.hasPhone);
    const lines = hasPhone
      ? [
          'A test alert pages whoever is on call.',
          '',
          { text: `✓ Phone on file — ${formatPhone(userPhone?.phone) || 'added'}`, color: palette.success, bold: true },
          '',
          'Connect Slack too if you like, then continue.'
        ]
      : [
          'A test alert and incident only reach you if you have somewhere to be notified.',
          '',
          'Connect Slack and/or add a phone number, then continue. You can also skip and do this later.'
        ];

    return h(OptionScreen, {
      title: 'Before we set up',
      lines,
      // With a phone on file, Continue is the default (first). Without one, lead
      // with adding a number — otherwise the test alert can't page anyone.
      options: hasPhone
        ? [
            { label: 'Continue setup', value: 'continue' },
            { label: 'Connect Slack', value: 'slack' },
            { label: 'Back to menu', value: 'back' }
          ]
        : [
            { label: 'Add a phone number (recommended — so the test alert pages you)', value: 'phone' },
            { label: 'Continue setup', value: 'continue' },
            { label: 'Connect Slack', value: 'slack' },
            { label: 'Back to menu', value: 'back' }
          ],
      onSelect: async (option) => {
        if (option.value === 'slack') {
          await openHandoff('Slack', 'Connect Slack', 'Slack setup');
          return;
        }
        if (option.value === 'phone') {
          setScreen('phone-entry');
          return;
        }
        if (option.value === 'continue') {
          // No phone on file → the test alert may not reach anyone. Confirm
          // before running so the demo doesn't silently page no one.
          setScreen(hasPhone ? 'one-shot-members' : 'one-shot-no-notify');
          return;
        }
        setScreen('menu');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'one-shot-no-notify') {
    return h(OptionScreen, {
      title: 'No phone number yet',
      lines: [
        'You don’t have a phone number on file.',
        '',
        'If you connected Slack, you’re all set — the test alert will reach you there. Otherwise it won’t page anyone.',
        '',
        'Add a number, or continue anyway.'
      ],
      options: [
        { label: 'Add a phone number', value: 'phone' },
        { label: 'Continue anyway', value: 'continue' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'phone') setScreen('phone-entry');
        else if (option.value === 'continue') setScreen('one-shot-members');
        else setScreen('one-shot-prereqs');
      },
      onBack: () => setScreen('one-shot-prereqs')
    });
  }

  if (screen === 'phone-entry') {
    return h(TextEntryScreen, {
      title: 'Add a phone number',
      prompt: 'Enter your mobile number. We’ll text you a code to verify it.',
      lines: ['Outside the US or Canada? Start with your country code, like +44.'],
      placeholder: '(415) 555-0123',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await startPhoneVerificationForTui({ phone: value });
        setLoading(false);
        if (result.ok) {
          setFormState((prev) => ({ ...prev, phoneNumberId: result.data.phoneNumberId, phone: result.data.phone }));
          setScreen('phone-code');
          return;
        }
        setResultScreen({ title: 'Add a phone number', lines: [friendlyError(result.summary)], next: 'phone-entry', continueLabel: 'Try again' });
        setScreen('result');
      },
      onBack: () => setScreen('one-shot-prereqs')
    });
  }

  if (screen === 'phone-code') {
    return h(TextEntryScreen, {
      title: 'Verify phone number',
      prompt: `Enter the 6-digit code we texted to ${formState.phone || 'your phone'}.`,
      lines: ['It can take a few seconds to arrive.'],
      placeholder: '123456',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await confirmPhoneVerificationForTui({ phoneNumberId: formState.phoneNumberId, code: value });
        setLoading(false);
        if (result.ok) {
          setUserPhone(null); // refresh so the pre-flight shows the new number
          setResultScreen({
            title: 'Phone verified',
            lines: ['Your phone number is verified and ready for paging.'],
            next: 'one-shot-prereqs',
            continueLabel: 'Done'
          });
          setScreen('result');
          return;
        }
        setResultScreen({
          title: 'Verification failed',
          lines: [friendlyError(result.summary), 'Check the code and try again.'],
          next: 'phone-code',
          continueLabel: 'Try again'
        });
        setScreen('result');
      },
      onBack: () => setScreen('one-shot-prereqs')
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
            ? 'This sign-in can’t list Rootly users, so members can’t be picked. Setup will still create the team and put the current identity on call.'
            : 'No users were found to add. Setup will create the team with the current identity on call.'
        ],
        options: [
          { label: 'Run setup', value: 'run' },
          { label: 'Back to menu', value: 'back' }
        ],
        onSelect: (option) => {
          if (option.value === 'back') {
            setScreen('menu');
            return;
          }
          setFormState({ oneShotMemberIds: [] });
          setScreen('one-shot-running');
        },
        onBack: () => setScreen('menu')
      });
    }

    return h(MultiSelectScreen, {
      title: 'Who goes on the team & on call?',
      options,
      onSubmit: (selectedOptions) => {
        setFormState({ oneShotMemberIds: selectedOptions.map((option) => option.value) });
        setScreen('one-shot-running');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'one-shot-running') {
    const usersById = {};
    (directoryUsers?.users || []).forEach((user) => {
      usersById[user.id] = user;
    });
    return h(OneShotRunnerScreen, {
      memberIds: formState.oneShotMemberIds || [],
      usersById,
      runner: runOneShotSetupForTui,
      // A successful run lands on the incident-ready screen (with the CEO nudge).
      onContinue: () => {
        clearWorkspaceCache();
        setScreen('setup-complete');
      },
      onMenu: () => {
        clearWorkspaceCache();
        setScreen('menu');
      },
      onRetry: () => {
        clearWorkspaceCache();
        setScreen('one-shot-members');
      },
      onExit: leave
    });
  }

  if (screen === 'placeholder') {
    return h(OptionScreen, {
      title: 'Nothing to do here',
      lines: [
        'There is no recommended action to run right now.',
        '',
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
      initialValue: 'Incident Response',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await createTeamForTui({ name: value });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Team created' : 'Team setup needs attention',
          lines: result.ok
            ? [`Team: ${result.data?.name || value}`, result.data?.id ? `Team ID: ${result.data.id}` : 'Team created']
            : [friendlyError(result.summary)],
          next: result.ok ? 'menu' : 'create-team'
        });
        setScreen('result');
      },
      onBack: () => setScreen('menu')
    });
  }

  // ---- Guided status page flow (public): detect → name → auth → components → customize → publish ----
  const sp = formState.sp || {};
  const patchSp = (patch) => setFormState((prev) => ({ ...prev, sp: { ...(prev.sp || {}), ...patch } }));
  const spReturn = sp.returnTo || 'menu';

  if (screen === 'sp-start') {
    // While loading, or when jumping straight to the public page, show the loader
    // (the directPublic effect navigates away once pages are loaded).
    if (spExisting === null || sp.directPublic) {
      return h(LoadingScreen, { title: 'Status page', detail: 'Opening your public status page…' });
    }
    const existing = spExisting.pages || [];
    if (!existing.length) {
      return h(OptionScreen, {
        title: 'Create a status page',
        lines: ['No status page exists yet — let’s create one.'],
        options: [{ label: 'Create a status page', value: 'new' }, { label: 'Back', value: 'back' }],
        onSelect: (option) => setScreen(option.value === 'back' ? spReturn : 'sp-name'),
        onBack: () => setScreen(spReturn)
      });
    }
    return h(OptionScreen, {
      title: 'Status pages',
      lines: [
        `Your workspace already has ${existing.length} status page${existing.length === 1 ? '' : 's'} (new accounts come with a default one).`,
        '',
        'Customize an existing page, or create a new one.'
      ],
      options: [
        { label: 'Customize an existing page', value: 'existing' },
        { label: 'Create a new page', value: 'new' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') { setScreen(spReturn); return; }
        setScreen(option.value === 'existing' ? 'sp-pick-existing' : 'sp-name');
      },
      onBack: () => setScreen(spReturn)
    });
  }

  if (screen === 'sp-pick-existing') {
    const existing = spExisting?.pages || [];
    return h(OptionScreen, {
      title: 'Pick a page to customize',
      lines: ['Choose the status page to update.'],
      options: [
        ...existing.map((p) => ({
          label: `${p.title} · ${p.public ? 'public' : 'internal'} · ${p.published ? 'published' : 'draft'}`,
          value: p.id
        })),
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') { setScreen('sp-start'); return; }
        patchSp({ existingPage: existing.find((p) => p.id === option.value) || null });
        setScreen('sp-existing-actions');
      },
      onBack: () => setScreen('sp-start')
    });
  }

  if (screen === 'sp-existing-actions') {
    const page = sp.existingPage || {};
    const slug = page.slug;
    const view = page.public ? 'public' : 'private';
    const liveUrl = slug ? `${STATUS_PAGES_URL}/${slug}/${view}` : STATUS_PAGES_URL;
    const manageUrl = slug ? `${STATUS_PAGES_URL}/${slug}` : STATUS_PAGES_URL;
    return h(OptionScreen, {
      title: `Customize ${page.title || 'status page'}`,
      lines: [
        `${page.public ? 'Public' : 'Internal'} · ${page.published ? 'published' : 'draft'}.`,
        '',
        page.published
          ? 'It’s live. Edit its settings here, or open the full editor in Rootly.'
          : 'Publish makes it live. Edit its settings here, or open the full editor in Rootly.'
      ],
      options: [
        { label: 'Edit settings', value: 'edit' },
        ...(page.published ? [] : [{ label: 'Publish it now', value: 'publish' }]),
        { label: 'Open it in Rootly (full editor)', value: 'open' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') { setScreen(sp.directPublic ? spReturn : 'sp-pick-existing'); return; }
        if (option.value === 'edit') { setScreen('sp-edit-menu'); return; }
        if (option.value === 'open') {
          setResultScreen({
            title: page.title || 'Status page',
            lines: [hyperlink(page.published ? liveUrl : manageUrl, '↗ Open it in Rootly'), '', 'Customize and publish it in the web app.'],
            next: spReturn
          });
          setScreen('result');
          return;
        }
        setLoading(true);
        const result = await publishStatusPageForTui({ id: page.id });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Status page published' : 'Could not publish',
          lines: result.ok
            ? [`${page.title} is now live.`, '', hyperlink(liveUrl, '↗ View your status page'), '', 'Customize it anytime in the web app.']
            : [friendlyError(result.summary)],
          next: result.ok ? spReturn : 'sp-existing-actions'
        });
        setScreen('result');
      },
      onBack: () => setScreen(sp.directPublic ? spReturn : 'sp-pick-existing')
    });
  }

  if (screen === 'sp-edit-menu') {
    const page = sp.existingPage || {};
    const slug = page.slug;
    const liveUrl = slug ? `${STATUS_PAGES_URL}/${slug}/${page.public ? 'public' : 'private'}` : STATUS_PAGES_URL;
    const manageUrl = slug ? `${STATUS_PAGES_URL}/${slug}` : STATUS_PAGES_URL;
    const editError = (result) => {
      setResultScreen({ title: 'Update failed', lines: [friendlyError(result.summary)], next: 'sp-edit-menu' });
      setScreen('result');
    };
    return h(OptionScreen, {
      title: `Edit ${page.title || 'status page'}`,
      lines: [`${page.public ? 'Public' : 'Internal'} · ${page.published ? 'published' : 'draft'}.`, '', 'Change one setting at a time — each is saved immediately.'],
      options: [
        { label: 'Rename', value: 'name' },
        { label: 'Authentication', value: 'auth' },
        { label: 'Components to show', value: 'components' },
        { label: 'Website link', value: 'website' },
        { label: page.published ? 'Unpublish (make it a draft)' : 'Publish now', value: 'toggle' },
        { label: 'Done', value: 'done' }
      ],
      onSelect: async (option) => {
        if (option.value === 'done') {
          setResultScreen({
            title: 'Status page updated',
            lines: [
              `${page.title}`,
              `${page.public ? 'Public' : 'Internal'} · ${page.published ? 'published' : 'draft'}`,
              '',
              hyperlink(page.published ? liveUrl : manageUrl, page.published ? '↗ View your status page' : '↗ Open it in Rootly')
            ],
            next: spReturn
          });
          setScreen('result');
          return;
        }
        if (option.value === 'toggle') {
          setLoading(true);
          const result = await updateStatusPageForTui({ id: page.id, publish: !page.published });
          setLoading(false);
          if (result.ok) patchSp({ existingPage: { ...page, published: result.data.published, slug: result.data.slug || page.slug } });
          else editError(result);
          return;
        }
        setScreen(`sp-edit-${option.value}`);
      },
      onBack: () => setScreen(sp.directPublic ? spReturn : 'sp-existing-actions')
    });
  }

  if (screen === 'sp-edit-name') {
    const page = sp.existingPage || {};
    return h(TextEntryScreen, {
      title: 'Rename status page',
      prompt: 'New name for the page.',
      initialValue: page.title || '',
      onSubmit: async (value) => {
        setLoading(true);
        const result = await updateStatusPageForTui({ id: page.id, title: value });
        setLoading(false);
        if (result.ok) patchSp({ existingPage: { ...page, title: result.data.title || value, slug: result.data.slug || page.slug } });
        setScreen('sp-edit-menu');
      },
      onBack: () => setScreen('sp-edit-menu')
    });
  }

  if (screen === 'sp-edit-auth') {
    const page = sp.existingPage || {};
    return h(OptionScreen, {
      title: 'Page authentication',
      lines: ['Who can view the page?'],
      options: [
        { label: 'No authentication', value: 'none' },
        { label: 'Password protect', value: 'password' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') { setScreen('sp-edit-menu'); return; }
        if (option.value === 'password') { setScreen('sp-edit-password'); return; }
        setLoading(true);
        await updateStatusPageForTui({ id: page.id, authenticationMethod: 'none' });
        setLoading(false);
        setScreen('sp-edit-menu');
      },
      onBack: () => setScreen('sp-edit-menu')
    });
  }

  if (screen === 'sp-edit-password') {
    const page = sp.existingPage || {};
    return h(TextEntryScreen, {
      title: 'Set a page password',
      prompt: 'Visitors will need this password to view the page.',
      placeholder: 'Password',
      hidden: true,
      onSubmit: async (value) => {
        setLoading(true);
        await updateStatusPageForTui({ id: page.id, authenticationMethod: 'password', authenticationPassword: value });
        setLoading(false);
        setScreen('sp-edit-menu');
      },
      onBack: () => setScreen('sp-edit-auth')
    });
  }

  if (screen === 'sp-edit-components') {
    const page = sp.existingPage || {};
    const options = spComponents?.components || [];
    if (!options.length) {
      return h(OptionScreen, {
        title: 'Components to show',
        lines: ['No services or functionalities exist yet to show on the page.', '', 'Add some in the Rootly web app, then come back.'],
        options: [{ label: 'Back', value: 'back' }],
        onSelect: () => setScreen('sp-edit-menu'),
        onBack: () => setScreen('sp-edit-menu')
      });
    }
    return h(MultiSelectScreen, {
      title: 'Components to show on the page',
      options,
      onSubmit: async (selected) => {
        setLoading(true);
        await updateStatusPageForTui({
          id: page.id,
          serviceIds: selected.filter((o) => o.value.startsWith('service:')).map((o) => o.value.slice(8)),
          functionalityIds: selected.filter((o) => o.value.startsWith('functionality:')).map((o) => o.value.slice(14))
        });
        setLoading(false);
        setScreen('sp-edit-menu');
      },
      onBack: () => setScreen('sp-edit-menu')
    });
  }

  if (screen === 'sp-edit-website') {
    const page = sp.existingPage || {};
    return h(TextEntryScreen, {
      title: 'Website link',
      prompt: 'Link back to your main site (leave blank to clear it).',
      placeholder: 'https://yourcompany.com',
      allowEmpty: true,
      onSubmit: async (value) => {
        setLoading(true);
        await updateStatusPageForTui({ id: page.id, websiteUrl: value });
        setLoading(false);
        setScreen('sp-edit-menu');
      },
      onBack: () => setScreen('sp-edit-menu')
    });
  }

  if (screen === 'sp-name') {
    const orgName = state?.teams?.workspace?.name;
    const defaultName = orgName ? `${orgName} Status` : 'Status Page';
    return h(TextEntryScreen, {
      title: 'Create a status page',
      prompt: `Name your ${sp.isPublic === false ? 'internal' : 'public'} status page.`,
      placeholder: 'e.g. Acme Status',
      initialValue: sp.title || defaultName,
      onSubmit: (value) => {
        patchSp({ title: value });
        setScreen('sp-auth');
      },
      onBack: () => setScreen('sp-start')
    });
  }

  if (screen === 'sp-auth') {
    return h(OptionScreen, {
      title: 'Page authentication',
      lines: ['Who can view the page?', '', 'Default is open — anyone with the link.'],
      options: [
        { label: 'No authentication (default)', value: 'none' },
        { label: 'Password protect', value: 'password' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') { setScreen('sp-name'); return; }
        patchSp({ authMethod: option.value });
        setScreen(option.value === 'password' ? 'sp-password' : 'sp-components');
      },
      onBack: () => setScreen('sp-name')
    });
  }

  if (screen === 'sp-password') {
    return h(TextEntryScreen, {
      title: 'Set a page password',
      prompt: 'Visitors will need this password to view the page.',
      placeholder: 'Password',
      hidden: true,
      onSubmit: (value) => {
        patchSp({ authPassword: value });
        setScreen('sp-components');
      },
      onBack: () => setScreen('sp-auth')
    });
  }

  if (screen === 'sp-components') {
    const options = spComponents?.components || [];
    if (!options.length) {
      return h(OptionScreen, {
        title: 'Components to show',
        lines: ['No services or functionalities exist yet to show on the page.', '', 'You can add components later in the Rootly web app.'],
        options: [{ label: 'Continue', value: 'continue' }, { label: 'Back', value: 'back' }],
        onSelect: (option) => setScreen(option.value === 'back' ? 'sp-auth' : 'sp-customize'),
        onBack: () => setScreen('sp-auth')
      });
    }
    return h(MultiSelectScreen, {
      title: 'Components to show on the page',
      options,
      onSubmit: (selected) => {
        patchSp({
          serviceIds: selected.filter((o) => o.value.startsWith('service:')).map((o) => o.value.slice(8)),
          functionalityIds: selected.filter((o) => o.value.startsWith('functionality:')).map((o) => o.value.slice(14))
        });
        setScreen('sp-customize');
      },
      onBack: () => setScreen('sp-auth')
    });
  }

  if (screen === 'sp-customize') {
    return h(OptionScreen, {
      title: 'Customize further?',
      lines: ['Add optional details now, or skip and tweak everything later in the web app.'],
      options: [
        { label: 'Skip — go to publish', value: 'skip' },
        { label: 'Add a website link', value: 'website' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') { setScreen('sp-components'); return; }
        setScreen(option.value === 'website' ? 'sp-website' : 'sp-publish');
      },
      onBack: () => setScreen('sp-components')
    });
  }

  if (screen === 'sp-website') {
    return h(TextEntryScreen, {
      title: 'Website link',
      prompt: 'A link back to your main site, shown on the page (optional — leave blank to skip).',
      placeholder: 'https://yourcompany.com',
      allowEmpty: true,
      onSubmit: (value) => {
        patchSp({ websiteUrl: value });
        setScreen('sp-publish');
      },
      onBack: () => setScreen('sp-customize')
    });
  }

  if (screen === 'sp-publish') {
    return h(OptionScreen, {
      title: 'Ready to publish?',
      lines: [
        `${sp.title || 'Your status page'} — ${sp.isPublic === false ? 'internal' : 'public'}, ${sp.authMethod === 'password' ? 'password-protected' : 'open'}.`,
        '',
        'Publish makes it live now. Save as draft keeps it unpublished until you publish it later.'
      ],
      options: [
        { label: 'Publish now', value: 'publish' },
        { label: 'Save as draft', value: 'draft' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') { setScreen('sp-customize'); return; }
        const publish = option.value === 'publish';
        setLoading(true);
        const result = await createStatusPageForTui({
          title: sp.title,
          isPublic: sp.isPublic !== false,
          authenticationMethod: sp.authMethod || 'none',
          authenticationPassword: sp.authPassword || null,
          serviceIds: sp.serviceIds || [],
          functionalityIds: sp.functionalityIds || [],
          websiteUrl: sp.websiteUrl || null,
          publish
        });
        setLoading(false);
        const slug = result.data?.slug;
        const view = result.data?.public ? 'public' : 'private';
        const liveUrl = slug ? `${STATUS_PAGES_URL}/${slug}/${view}` : STATUS_PAGES_URL;
        const manageUrl = slug ? `${STATUS_PAGES_URL}/${slug}` : STATUS_PAGES_URL;
        setResultScreen({
          title: result.ok ? (publish ? 'Status page published' : 'Saved as draft') : 'Status page needs attention',
          lines: result.ok
            ? [
                `${result.data?.title || sp.title}`,
                `${result.data?.public ? 'Public' : 'Internal'} · ${result.data?.authenticationMethod === 'password' ? 'password-protected' : 'open'} · ${result.data?.componentCount || 0} component(s)`,
                '',
                publish
                  ? hyperlink(liveUrl, '↗ View your status page')
                  : hyperlink(manageUrl, '↗ Open it in Rootly to publish'),
                '',
                publish ? 'Customize it anytime in the Rootly web app.' : 'It is unpublished — publish it from the web app when ready.'
              ]
            : [friendlyError(result.summary)],
          next: result.ok ? (sp.returnTo || 'menu') : 'sp-publish'
        });
        setScreen('result');
      },
      onBack: () => setScreen('sp-customize')
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
            : [friendlyError(result.summary)],
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
            : [friendlyError(result.summary)],
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
              : [friendlyError(result.summary)],
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
            : [friendlyError(result.summary)],
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
            : [friendlyError(result.summary)],
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
            : [friendlyError(result.summary)],
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
          groupIds: selectedTeam?.id ? [selectedTeam.id] : [],
          // Page the team's on-call escalation policy so the alert actually rings.
          page: true
        });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Test alert sent' : 'Test alert needs attention',
          lines: result.ok
            ? [
                `Alert: ${result.data?.summary || value}`,
                result.data?.paged
                  ? 'Paging the on-call person now — watch for a call or text.'
                  : 'Heads up: no escalation policy found for this team, so it won’t page anyone.'
              ]
            : [friendlyError(result.summary)],
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
          lines: result.ok ? [`Incident: ${result.data?.title || value}`] : [friendlyError(result.summary)],
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
