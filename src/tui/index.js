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
  createStatusPageForTui,
  loadStatusPageComponentsForTui,
  createCustomComponentForTui,
  loadStatusPagesForTui,
  publishStatusPageForTui,
  updateStatusPageForTui,
  createTestAlertForTui,
  createTestIncidentForTui,
  deleteTokenForTui,
  runOneShotSetupForTui,
  startPhoneVerificationForTui,
  confirmPhoneVerificationForTui,
  resendPhoneVerificationForTui,
  loadCurrentUserPhoneForTui,
  startWebHandoffForTui,
  openExternalUrlForTui,
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
  const [teamMembersData, setTeamMembersData] = useState(null);
  const [addableUsers, setAddableUsers] = useState(null);
  const [directoryUsers, setDirectoryUsers] = useState(null);
  const [spComponents, setSpComponents] = useState(null);
  const [spExisting, setSpExisting] = useState(null);
  const [userPhone, setUserPhone] = useState(null);
  const [authRecovery, setAuthRecovery] = useState(null);
  // Where a completed action returns on Continue. Actions launched from a
  // General setup submenu set this so the user lands back in that submenu
  // (e.g. Integrations) to run another, instead of the main menu. Direct
  // launches from the main menu reset it to 'menu'.
  const [actionReturnTo, setActionReturnTo] = useState('menu');

  useEffect(() => {
    let cancelled = false;
    if (!['menu', 'status', 'inspect', 'teams', 'schedules', 'policies', 'schedule-members', 'add-members-picker', 'one-shot-members'].includes(screen)) return undefined;

    void (async () => {
     try {
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
      // Gate on the cached data belonging to the CURRENTLY selected team, not
      // just on presence — otherwise switching teams (A -> back -> B) reuses A's
      // roster and would add A's people to B / staff B's rotation with A's users.
      if (screen === 'schedule-members' && selectedTeam?.id && teamMembersData?.teamId !== selectedTeam.id) {
        setLoading(true);
        const nextMembers = await loadTeamMembersForTui(selectedTeam.id);
        if (!cancelled) setTeamMembersData(nextMembers);
      }
      if (screen === 'add-members-picker' && selectedTeam?.id && addableUsers?.teamId !== selectedTeam.id) {
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
     } catch {
        // Any loader (teams/schedules/policies/members/directory) can throw on a
        // network/5xx/timeout. Without this the promise rejects, setLoading(false)
        // never runs, and the TUI is stuck on the loading screen forever.
        if (!cancelled) {
          setLoading(false);
          setScreen('load-failed');
        }
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
      // Walk them through editing the existing public page (update, not create).
      setFormState((prev) => ({ ...prev, sp: { ...(prev.sp || {}), editId: publicPage.id, existingPage: publicPage, title: publicPage.title } }));
    }
    setScreen('sp-name'); // no public page → create one; otherwise walk through editing it
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

  // Detect a stored (keychain) or env sign-in while on the welcome screen so we
  // can show a "signed in" indicator before the user continues. Cheap
  // (keychain read); the menu reuses this cached authContext.
  useEffect(() => {
    if (screen !== 'welcome' || authContext) return undefined;
    let cancelled = false;
    void (async () => {
      const ctx = await loadAuthContextForTui();
      if (!cancelled) setAuthContext(ctx);
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, authContext]);

  const leave = () => {
    onExit?.();
    exit();
  };

  // Every user-initiated exit — including hitting Esc on the top-level screens —
  // routes through the exit-confirm dialog (keep/delete the saved sign-in),
  // rather than quitting the program outright. exit-confirm calls leave() to
  // actually terminate once they choose.
  const requestExit = () => setScreen('exit-confirm');

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
    if (screen === 'phone-entry') {
      return h(LoadingScreen, {
        title: 'Sending a code…',
        detail: 'Texting a verification code to your phone.'
      });
    }
    if (screen === 'phone-code') {
      return h(LoadingScreen, {
        title: 'Verifying…',
        detail: 'Checking your code with Rootly.'
      });
    }
    return h(LoadingScreen, {
      title: screen === 'menu' ? 'Loading Rootly workspace…' : 'Loading Rootly data…',
      detail: authContext?.label || 'Checking your current sign-in and workspace state.'
    });
  }

  if (screen === 'welcome') {
    // Surface a detected keychain / env sign-in so a returning user knows
    // Continue takes them straight in (the welcome effect loads authContext).
    // SlideReveal renders plain strings, so this is a string, not a styled node.
    const signedIn = authContext?.hasAuth
      ? `✓ ${authContext.label || 'Saved Rootly sign-in detected'} — Continue to jump right in.`
      : null;
    return h(WelcomeScreen, {
      lines: [
        'Get from an empty workspace to incident-ready on-call in minutes.',
        '',
        'A handful of guided steps covers your teams, schedules, escalation, alerting, and integrations. No docs required.',
        ...(signedIn ? ['', signedIn] : [])
      ],
      // Head to the menu, whose effect checks the keychain for a stored
      // sign-in: returning users skip auth entirely, and only an unauthed
      // session gets routed on to the sign-in chooser.
      onContinue: () => setScreen('menu'),
      // Esc / Exit here shows the exit dialog rather than quitting outright.
      onExit: requestExit
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
              'Once your account is set up, come back and sign in — with your browser or an API token.'
            ],
            // Return to the sign-in chooser so they can pick browser (OAuth) or
            // an API token; the default label here would be "Try again", which
            // reads wrong after a successful hand-off.
            continueLabel: 'Sign in',
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
      // Esc shows the exit dialog rather than quitting outright.
      onBack: requestExit
    });
  }

  if (screen === 'result' && resultScreen) {
    return h(ResultScreen, {
      title: resultScreen.title,
      lines: resultScreen.lines,
      actions: resultScreen.actions || [],
      onContinue: () => {
        // Actions launched from a General setup submenu return there (so the
        // user can run another) instead of the main menu. Action results are
        // authored with next:'menu'; redirect them when a submenu is in play.
        const target = resultScreen.next === 'menu' && actionReturnTo !== 'menu'
          ? actionReturnTo
          : resultScreen.next;
        // A completed action may have mutated the workspace; refresh the
        // snapshot so coverage reflects the change on the next menu visit.
        if (resultScreen.next === 'menu') clearWorkspaceCache();
        setScreen(target);
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
        { label: 'Chat with us', value: 'chat' },
        { label: 'Back to main menu', value: 'back' }
      ],
      onSelect: (option) => {
        if (option.value === 'back') {
          setScreen('menu');
          return;
        }
        if (option.value === 'chat') {
          setScreen('chat-menu');
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
        setScreen('menu');
      },
      onBack: () => setScreen('menu')
    });
  }

  if (screen === 'chat-menu') {
    return h(OptionScreen, {
      title: 'Chat with us',
      lines: ['Talk to the Rootly team.'],
      options: [
        { label: 'Talk to our founder JJ (seriously)', value: 'chat-ceo' },
        { label: 'Book a demo with sales', value: 'book-demo' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('general-menu');
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
          lines: result.opened
            ? [handoff.opened]
            : [handoff.fallback, '', handoff.url],
          continueLabel: 'Continue',
          next: 'chat-menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('general-menu')
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
        setActionReturnTo('setup-menu');
        if (option.value === 'create-team') {
          setScreen('create-team');
          return;
        }
        if (option.value === 'create-status-page') {
          // Launch the guided public status-page flow (detects existing pages first).
          setSpExisting(null);
          setFormState({ sp: { isPublic: true, returnTo: 'setup-menu' } });
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
        setActionReturnTo('verify-menu');
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
        { label: 'Connect an alert source — Datadog, Sentry…', value: 'vendor' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('general-menu');
          return;
        }
        setActionReturnTo('integrations-menu');
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
      title: 'Connect an alert source',
      lines: ['These alert sources connect through Rootly web.'],
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
      lines: [
        'Adds Rootly’s hosted MCP server so your AI client can pull Rootly data.',
        '',
        'Claude Code registers globally (every project); other clients get their',
        'config file written with your token embedded.',
        // Browser (OAuth) sessions store a short-lived access token; embedding it
        // in a static MCP config means MCP breaks once it expires. Warn, but
        // still let them proceed (they may just want it working for now).
        ...(authContext?.isApiKey === false
          ? [
              '',
              '⚠ You’re signed in with a browser session. That token expires, so MCP',
              '   will stop working later. Sign in with an API key for a setup that lasts.'
            ]
          : [])
      ],
      options: [
        { label: 'Claude Code (recommended)', value: 'apply-claude-user' },
        { label: 'Cursor', value: 'apply-cursor' },
        { label: 'Codex', value: 'apply-codex' },
        { label: 'Gemini CLI', value: 'apply-gemini' },
        { label: 'Claude Desktop', value: 'apply-claude-desktop' },
        { label: 'Windsurf', value: 'apply-windsurf' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') {
          setScreen('general-menu');
          return;
        }
        setActionReturnTo('mcp-menu');
        setLoading(true);
        // Claude Code registers globally via `claude mcp add --scope user`
        // (Rootly MCP works across every project). Every other client gets its
        // hosted-server config written with the token embedded.
        const clientByValue = {
          'apply-claude-user': 'Claude Code',
          'apply-cursor': 'Cursor',
          'apply-codex': 'Codex',
          'apply-gemini': 'Gemini CLI',
          'apply-claude-desktop': 'Claude Desktop',
          'apply-windsurf': 'Windsurf'
        };
        const clients = [clientByValue[option.value]];
        const claudeCodeScope = 'user';
        const result = await applyMcpForTui({ clients, auth: 'Use stored token', claudeCodeScope });
        setLoading(false);
        const resultLines = result.ok
          ? (result.data?.results || []).flatMap((entry) => {
              const primary = `${entry.client}: ${entry.targetPath}`;
              // When the claude CLI isn't on PATH, applyMcpSetupAction returns
              // the exact command for the user to run manually. Surface it so
              // they can complete the setup without hunting for it.
              return entry.command ? [primary, '', 'Run this to finish (claude CLI not found on PATH):', entry.command] : [primary];
            })
          : [friendlyError(result.summary)];
        setResultScreen({
          title: result.ok ? 'MCP configured' : 'MCP setup blocked',
          lines: resultLines,
          continueLabel: 'Continue',
          next: 'menu'
        });
        setScreen('result');
      },
      onBack: () => setScreen('general-menu')
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
          setFormState({ sp: { isPublic: true, directPublic: true, returnTo: 'setup-complete' } });
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
          lines: result.opened
            ? [handoff.opened]
            : [handoff.fallback, '', handoff.url],
          continueLabel: 'Continue',
          next: 'setup-complete'
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
      // Didn't get a code? Ctrl-R resends without leaving the screen. The
      // resend path is the same action the agent surface exposes; it just
      // wasn't wired to the UI before.
      secondaryHint: 'Ctrl-R  resend the code',
      onSecondary: async () => {
        setLoading(true);
        const result = await resendPhoneVerificationForTui({ phoneNumberId: formState.phoneNumberId });
        setLoading(false);
        setResultScreen({
          title: result.ok ? 'Code resent' : 'Couldn’t resend',
          lines: result.ok
            ? [`Sent a new code to ${formState.phone || 'your phone'}.`, 'It can take a few seconds to arrive.']
            : [friendlyError(result.summary)],
          continueLabel: 'Continue',
          next: 'phone-code'
        });
        setScreen('result');
      },
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

    // With no directory (an OAuth session can't list /v1/users) or only the
    // signed-in user available, a check/uncheck list of one is pointless — just
    // confirm and add that user (the chain puts them on call). Show the
    // multiselect only when there are several people to choose from.
    if (options.length <= 1) {
      const onlyUser = options[0];
      return h(OptionScreen, {
        title: 'Quick start',
        lines: [
          onlyUser
            ? `${onlyUser.label} will be added to the team, put on call, and paged by the test alert.${authContext?.isApiKey ? '' : ' Sign in with an API key to add more teammates.'}`
            : directoryUsers?.userLookupUnavailable
              ? 'This sign-in can’t list other Rootly users, so just the signed-in user will be added to the team, put on call, and paged by the test alert.'
              : 'No other users to add — just the signed-in user will be added to the team, put on call, and paged by the test alert.'
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
          setFormState({ oneShotMemberIds: onlyUser ? [onlyUser.value] : [] });
          setScreen('one-shot-running');
        },
        onBack: () => setScreen('menu')
      });
    }

    return h(MultiSelectScreen, {
      title: 'Who goes on the team & on call?',
      lines: ['Selected people are added to the team, put on call, and paged by the test alert.'],
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
      // Opens Rootly's "manual page" modal. Uses the same
      // handoff-plus-result-screen pattern as Slack/CEO/etc. so the user gets
      // the same "Opened in your browser…" acknowledgement. Lands on
      // setup-complete afterwards — going back to one-shot-running would
      // re-trigger the whole setup (that screen kicks off the run on mount).
      onOpenTestPage: async () => {
        setLoading(true);
        const result = await startWebHandoffForTui({ kind: 'TestPage', open: true });
        setLoading(false);
        const url = result?.data?.url;
        clearWorkspaceCache();
        setResultScreen({
          title: 'Send a test page',
          lines: result?.data?.opened
            ? ['Opened Rootly’s manual page modal in your browser.', '', 'Fill it in to page whoever’s on call — we’ll be here when you’re done.', ...(url ? ['', hyperlink(url, '↗ Reopen the manual page in Rootly')] : [])]
            : ['Couldn’t open your browser — open this link to page on-call from the Rootly app:', ...(url ? ['', hyperlink(url, '↗ Open the manual page in Rootly')] : [])],
          continueLabel: 'Continue',
          next: 'setup-complete'
        });
        setScreen('result');
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

  // The live public page lives at /teams/<org-slug>/status-pages/<slug>/public, but
  // the org slug isn't exposed in the API — so we open the account editor instead
  // (slug-keyed, always works; it previews the live page and links to it with the
  // correct URL Rootly builds server-side). Both helpers point there.
  const spViewUrl = (slug) => `${STATUS_PAGES_URL}/${slug}/edit`;
  const spManageUrl = (slug) => `${STATUS_PAGES_URL}/${slug}/edit`;

  // Create-or-update the page (always published), then open it in the browser so
  // there's no URL to copy. Further tweaks (incl. disabling) happen in the web UI.
  const finalizeStatusPage = async () => {
    const fields = {
      title: sp.title,
      authenticationMethod: sp.authMethod || 'none',
      authenticationPassword: sp.authPassword || null,
      publish: true,
      // Only set components when the user actually chose some this session, so
      // editing a page without touching components doesn't wipe its existing set.
      ...(sp.componentsTouched
        ? { serviceIds: sp.serviceIds || [], functionalityIds: sp.functionalityIds || [] }
        : {})
    };
    setLoading(true);
    const result = sp.editId
      ? await updateStatusPageForTui({ id: sp.editId, ...fields })
      : await createStatusPageForTui({ isPublic: sp.isPublic !== false, ...fields });
    setLoading(false);
    const slug = result.data?.slug || sp.existingPage?.slug;
    const isPublic = result.data?.public ?? (sp.isPublic !== false);
    const liveUrl = slug ? spViewUrl(slug, isPublic) : STATUS_PAGES_URL;
    if (result.ok) await openExternalUrlForTui(liveUrl);
    setResultScreen({
      title: result.ok ? 'Your status page is live' : 'Status page needs attention',
      lines: result.ok
        ? [
            `${result.data?.title || sp.title}`,
            '',
            'Opened your status page in Rootly — preview it and customize it there.'
          ]
        : [friendlyError(result.summary)],
      actions: result.ok
        ? [{ label: 'Open the status page again', onSelect: () => openExternalUrlForTui(liveUrl) }]
        : [],
      continueLabel: result.ok ? 'Continue' : undefined,
      next: result.ok ? spReturn : 'sp-components'
    });
    setScreen('result');
  };

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
    const liveUrl = slug ? spViewUrl(slug, page.public) : STATUS_PAGES_URL;
    const manageUrl = slug ? spManageUrl(slug) : STATUS_PAGES_URL;
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
    const liveUrl = slug ? spViewUrl(slug, page.public) : STATUS_PAGES_URL;
    const manageUrl = slug ? spManageUrl(slug) : STATUS_PAGES_URL;
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
      title: sp.editId ? 'Set up your public status page' : 'Create a status page',
      prompt: sp.editId
        ? 'Confirm or change the name of your status page.'
        : `Name your ${sp.isPublic === false ? 'internal' : 'public'} status page.`,
      placeholder: 'e.g. Acme Status',
      initialValue: sp.title || defaultName,
      onSubmit: (value) => {
        patchSp({ title: value });
        setScreen('sp-auth');
      },
      onBack: () => setScreen(sp.directPublic ? spReturn : 'sp-start')
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
    // Map selected ids back to labels so we can show what's been added, each
    // with a green check.
    const componentLabel = new Map((spComponents?.components || []).map((c) => [c.value, c.label]));
    const addedValues = [
      ...(sp.serviceIds || []).map((id) => `service:${id}`),
      ...(sp.functionalityIds || []).map((id) => `functionality:${id}`)
    ];
    const count = addedValues.length;
    const lines = count
      ? [
          'Added components:',
          '',
          ...addedValues.map((value) => ({ text: `✓ ${componentLabel.get(value) || value}`, color: palette.success })),
          '',
          'Add more, or publish your page.'
        ]
      : ['Components let visitors see the status of your services.', '', 'Add some now, or just publish — you can add more later.'];
    return h(OptionScreen, {
      title: 'Components to show on the page',
      lines,
      options: [
        { label: 'Go to publish', value: 'publish' },
        { label: count ? 'Add or remove components' : 'Add a component', value: 'add' },
        { label: 'Create your own component', value: 'custom' },
        { label: 'Back', value: 'back' }
      ],
      onSelect: async (option) => {
        if (option.value === 'back') { setScreen('sp-auth'); return; }
        if (option.value === 'add') { setScreen('sp-components-pick'); return; }
        if (option.value === 'custom') { setScreen('sp-component-custom'); return; }
        await finalizeStatusPage();
      },
      onBack: () => setScreen('sp-auth')
    });
  }

  if (screen === 'sp-component-custom') {
    return h(TextEntryScreen, {
      title: 'Create your own component',
      prompt: 'Name a component to show on your status page (e.g. API, Dashboard, Checkout).',
      placeholder: 'e.g. API',
      onSubmit: async (value) => {
        const name = String(value || '').trim();
        if (!name) { setScreen('sp-components'); return; }
        setLoading(true);
        const result = await createCustomComponentForTui({ name });
        setLoading(false);
        if (result.ok) {
          // The custom component is a Service — add its id to serviceIds and to
          // the component list so it shows alongside the existing components.
          patchSp({ serviceIds: [...(sp.serviceIds || []), result.data.id], componentsTouched: true });
          setSpComponents((prev) => ({ components: [...(prev?.components || []), result.data.component] }));
          setScreen('sp-components');
          return;
        }
        setResultScreen({
          title: 'Component needs attention',
          lines: [friendlyError(result.summary)],
          next: 'sp-components'
        });
        setScreen('result');
      },
      onBack: () => setScreen('sp-components')
    });
  }

  if (screen === 'sp-components-pick') {
    const options = spComponents?.components || [];
    if (!options.length) {
      return h(OptionScreen, {
        title: 'Add a component',
        lines: ['No services or functionalities exist yet to show on the page.', '', 'You can add components later in the Rootly web app.'],
        options: [{ label: 'Back', value: 'back' }],
        onSelect: () => setScreen('sp-components'),
        onBack: () => setScreen('sp-components')
      });
    }
    return h(MultiSelectScreen, {
      title: 'Toggle components to show on the page (checked = added)',
      options,
      // Pre-check what's already on the page so the user can uncheck to remove
      // and check to add — submitting applies the full set.
      initialSelectedValues: [
        ...(sp.serviceIds || []).map((id) => `service:${id}`),
        ...(sp.functionalityIds || []).map((id) => `functionality:${id}`)
      ],
      onSubmit: (selected) => {
        patchSp({
          serviceIds: selected.filter((o) => o.value.startsWith('service:')).map((o) => o.value.slice(8)),
          functionalityIds: selected.filter((o) => o.value.startsWith('functionality:')).map((o) => o.value.slice(14)),
          componentsTouched: true
        });
        setScreen('sp-components');
      },
      onBack: () => setScreen('sp-components')
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

    // Only one user available (e.g. an OAuth session that can only see the
    // signed-in user) — confirm-and-add rather than a 1-item check/uncheck.
    if (options.length === 1) {
      const onlyUser = options[0];
      return h(OptionScreen, {
        title: selectedTeam ? `Add members to ${selectedTeam.name}` : 'Add team members',
        lines: [`${onlyUser.label} is the only user available to add.`],
        options: [
          { label: `Add ${onlyUser.label}`, value: 'add' },
          { label: 'Invite someone else by email', value: 'email' },
          { label: 'Back', value: 'back' }
        ],
        onSelect: async (option) => {
          if (option.value === 'back') { setScreen('general-menu'); return; }
          if (option.value === 'email') { setScreen('add-team-members'); return; }
          setLoading(true);
          const result = await addTeamMembersByIdsForTui({ teamId: selectedTeam?.id, userIds: [onlyUser.value] });
          setLoading(false);
          setResultScreen({
            title: result.ok ? 'Team members added' : 'Team members need attention',
            lines: result.ok
              ? [`Team: ${selectedTeam?.name || 'Unknown'}`, `Added as members: ${onlyUser.label}`]
              : [friendlyError(result.summary)],
            next: 'menu'
          });
          setScreen('result');
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
      // Esc (no option) and the back/exit values all leave the top-level menu —
      // route them through the exit dialog instead of quitting outright.
      if (!option) {
        requestExit();
        return;
      }
      if (option.value === 'back') {
        requestExit();
        return;
      }
      if (option.value === 'exit') {
        requestExit();
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
        setActionReturnTo('menu');
        setScreen('one-shot');
        return;
      }
      if (option.value === 'create-team') {
        setActionReturnTo('menu');
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
