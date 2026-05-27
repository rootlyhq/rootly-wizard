#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { buildHostedMcpPreview, getMcpConfigPath, verifyHostedMcpConfig, writeHostedMcpConfig } from './mcp.js';
import { deleteToken, getAuthSummary, getStoredToken, startOAuthLogin, storeToken, validateToken } from './auth.js';
import { RootlyApiClient } from './rootly-api.js';
import { getActiveToken, loadApiClient, loadOnboardingState } from './runtime.js';
import { getEscalationPoliciesAction, getReadinessAction, getSchedulesAction, getStatusAction, getTeamsAction } from './actions/inspect.js';
import { addTeamMembersAction, createAlertSourceAction, createEscalationPolicyAction, createScheduleAction, createTeamAction, serializeActionError } from './actions/setup.js';
import { openUrl, startWebHandoffAction, webHandoffUrl } from './actions/integrations.js';
import { applyMcpSetupAction, previewMcpSetupAction } from './actions/mcp.js';
import { getRecommendedNextStepAction, humanizeAction } from './actions/workflow.js';
import { createTestAlertAction, createTestIncidentAction } from './actions/testing.js';

function createInterface() {
  return readline.createInterface({ input, output });
}

let rl = createInterface();
const LOGO_ART = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⢠⣤⣄⡀⠐⣿⣿⠇⢀⣠⣤⡄⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣿⣿⠀⠈⠁⠀⣿⣿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠠⣶⣶⣦⡀⠀⠀⣼⣧⠀⠀⢀⣴⣶⣶⡆⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠈⠛⠛⠁⠀⠀⢿⣿⠃⠀⠈⠛⠛⠉⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⢰⣶⣶⣶⣶⣶⣦⣄⠀⠀⣠⣤⣶⣶⣶⣶⣶⡆⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠈⠉⠀⠀⠈⠉⠛⢿⣷⣾⡿⠛⠉⠁⠀⠀⠈⠁⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠿⠿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀'
].join('\n');

const separator = () => console.log('');
const SESSION_DIR = path.join(process.cwd(), '.rootly-wizard-session');
const RESET = '\u001b[0m';
const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const FG_SLATE = '\u001b[38;5;245m';
const FG_GREEN = '\u001b[38;5;78m';
const FG_AMBER = '\u001b[38;5;221m';
const FG_RED = '\u001b[38;5;203m';
const FG_BLUE = '\u001b[38;5;117m';
const FG_PURPLE = '\u001b[38;5;183m';
const FG_WHITE = '\u001b[38;5;255m';
const FG_MUSTARD = '\u001b[38;5;220m';

async function printLogo() {
  if (!output.isTTY) {
    console.log(LOGO_ART);
    separator();
    return;
  }

  console.log(`${FG_MUSTARD}${LOGO_ART}${RESET}`);
  separator();
}

function heading(text) {
  console.log(output.isTTY ? `${BOLD}${FG_WHITE}${text}${RESET}` : text);
  console.log(output.isTTY ? `${DIM}${FG_SLATE}${'─'.repeat(text.length)}${RESET}` : '-'.repeat(text.length));
}

function tone(text, color) {
  return output.isTTY ? `${color}${text}${RESET}` : text;
}

function statusTone(value) {
  switch (value) {
    case 'ready':
    case 'complete':
    case 'connected':
    case 'yes':
      return tone(value, FG_GREEN);
    case 'in progress':
    case 'partial':
    case 'requested':
      return tone(value, FG_AMBER);
    case 'needs attention':
    case 'blocked':
    case 'needed':
    case 'no':
      return tone(value, FG_RED);
    default:
      return tone(value, FG_SLATE);
  }
}

function bulletIcon(item) {
  const lower = item.toLowerCase();
  if (lower.includes('next best action')) return tone('→', FG_PURPLE);
  if (lower.includes('blocked') || lower.includes('stopped')) return tone('!', FG_RED);
  if (lower.includes('connected') || lower.includes('created') || lower.includes('verified') || lower.includes('ready')) return tone('✓', FG_GREEN);
  if (lower.includes('handoff') || lower.includes('next step')) return tone('→', FG_BLUE);
  return tone('•', FG_SLATE);
}

function statusLine(label, value) {
  return `${tone(label.padEnd(16), FG_SLATE)} ${statusTone(value)}`;
}

function panelTitle(text) {
  return output.isTTY ? `${FG_BLUE}${text}${RESET}` : text;
}

function printKeyValuePanel(title, rows) {
  heading(title);
  rows.forEach(({ label, value }) => {
    console.log(statusLine(label, value));
  });
  separator();
}

function printCallout(title, body) {
  heading(title);
  body.forEach((line) => console.log(`${tone('│', FG_PURPLE)} ${line}`));
  separator();
}

function printTeamList(title, teams) {
  heading(title);

  if (!teams?.length) {
    console.log(`${tone('•', FG_SLATE)} No teams found`);
    separator();
    return;
  }

  teams.forEach((team) => {
    const parts = [
      team.name || team.slug || team.id,
      `${team.memberCount || 0} member${team.memberCount === 1 ? '' : 's'}`,
      `${team.scheduleCount || 0} schedule${team.scheduleCount === 1 ? '' : 's'}`,
      `${team.escalationPolicyCount || 0} escalation polic${team.escalationPolicyCount === 1 ? 'y' : 'ies'}`
    ];
    console.log(`${tone('•', FG_SLATE)} ${parts.join('  ·  ')}`);
  });

  separator();
}

function printScheduleList(title, schedules) {
  heading(title);

  if (!schedules?.length) {
    console.log(`${tone('•', FG_SLATE)} No schedules found`);
    separator();
    return;
  }

  schedules.forEach((schedule) => {
    const attrs = schedule.attributes || {};
    const owners = Array.isArray(attrs.owner_group_ids) && attrs.owner_group_ids.length > 0
      ? `${attrs.owner_group_ids.length} team${attrs.owner_group_ids.length === 1 ? '' : 's'}`
      : 'no teams';
    const coverage = attrs.all_time_coverage ? '24/7' : 'custom coverage';
    console.log(`${tone('•', FG_SLATE)} ${(attrs.name || schedule.id)}  ·  ${coverage}  ·  ${owners}`);
  });

  separator();
}

function printEscalationPolicyList(title, policies) {
  heading(title);

  if (!policies?.length) {
    console.log(`${tone('•', FG_SLATE)} No escalation policies found`);
    separator();
    return;
  }

  policies.forEach((policy) => {
    const attrs = policy.attributes || {};
    const teamCount = Array.isArray(attrs.group_ids) ? attrs.group_ids.length : 0;
    const repeatCount = attrs.repeat_count ?? 0;
    console.log(`${tone('•', FG_SLATE)} ${(attrs.name || policy.id)}  ·  ${teamCount} team${teamCount === 1 ? '' : 's'}  ·  repeats ${repeatCount} time${repeatCount === 1 ? '' : 's'}`);
  });

  separator();
}

async function ask(question, defaultValue = '') {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`${tone(question, FG_SLATE)}${suffix}: `);
  return answer.trim() || defaultValue;
}

async function askHidden(question) {
  if (!input.isTTY || !output.isTTY) {
    const answer = await rl.question(`${tone(question, FG_SLATE)}: `);
    return answer.trim();
  }

  const prompt = `${tone(question, FG_SLATE)}: `;

  if (process.platform !== 'win32') {
    rl.close();
    try {
      spawnSync('stty', ['-echo'], { stdio: ['inherit', 'ignore', 'ignore'] });
      output.write(prompt);
      const answer = await new Promise((resolve) => {
        let value = '';

        const onData = (chunk) => {
          const text = chunk.toString('utf8');

          if (text === '\u0003') {
            input.off('data', onData);
            spawnSync('stty', ['echo'], { stdio: ['inherit', 'ignore', 'ignore'] });
            process.exit(1);
          }

          if (text.includes('\n') || text.includes('\r')) {
            input.off('data', onData);
            value += text.replace(/[\r\n]+/g, '');
            resolve(value.trim());
            return;
          }

          value += text;
        };

        input.resume();
        input.on('data', onData);
      });
      output.write('\n');
      return answer;
    } finally {
      spawnSync('stty', ['echo'], { stdio: ['inherit', 'ignore', 'ignore'] });
      rl = createInterface();
    }
  }

  try {
    rl.pause();
    output.write(prompt);
    if (typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    input.resume();

    const answer = await new Promise((resolve) => {
      let value = '';

      const onData = (chunk) => {
        const text = chunk.toString('utf8');

        if (text === '\r' || text === '\n') {
          input.off('data', onData);
          resolve(value.trim());
          return;
        }

        if (text === '\u0003') {
          input.off('data', onData);
          rl.close();
          process.exit(1);
        }

        if (text === '\u007f' || text === '\b') {
          value = value.slice(0, -1);
          return;
        }

        if (text.startsWith('\u001b')) {
          return;
        }

        value += text;
      };

      input.on('data', onData);
    });

    output.write('\n');
    return answer;
  } finally {
    if (typeof input.setRawMode === 'function') {
      input.setRawMode(false);
    }
    rl.resume();
  }
}

async function choose(question, options) {
  while (true) {
    console.log(panelTitle(question));
    options.forEach((option, index) => {
      console.log(`  ${tone(`${index + 1}.`, FG_PURPLE)} ${option.label}`);
    });

    const raw = await rl.question(`${tone('Select an option', FG_SLATE)}: `);
    const index = Number.parseInt(raw, 10) - 1;

    if (!Number.isNaN(index) && index >= 0 && index < options.length) {
      return options[index];
    }

    console.log(`Please choose a number between 1 and ${options.length}.`);
    separator();
  }
}

function printSummary(title, items) {
  heading(title);
  items.forEach((item) => console.log(`${bulletIcon(item)} ${item}`));
  separator();
}

function printOnboardingState(state) {
  printSummary('Onboarding state', [
    `User: ${state.user.name || state.user.email || 'Unknown'}`,
    `Next best action: ${humanizeAction(state.onboarding.nextBestAction)}`
  ]);

  printKeyValuePanel('Current setup', [
    { label: 'Workspace', value: state.teams.workspace?.name || state.teams.workspace?.slug || 'Connected Rootly account' },
    { label: 'Teams', value: String(state.teams.total) },
    { label: 'Teams w/ members', value: `${state.teams.teamsWithMembers}/${state.teams.total}` },
    { label: 'Teams w/ schedules', value: `${state.teams.teamsWithSchedules}/${state.teams.total}` },
    { label: 'Teams w/ escalations', value: `${state.teams.teamsWithEscalationPolicies}/${state.teams.total}` },
    { label: 'Teams w/ Slack', value: `${state.teams.teamsWithSlack}/${state.teams.total}` },
    { label: 'Alerting', value: state.teams.hasAnyAlertingReadyTeam ? 'ready' : 'needed' }
  ]);

  printTeamList('Teams', state.teams.all);

  printKeyValuePanel('Readiness', [
    { label: 'Workspace setup', value: state.onboarding.readiness.workspaceSetup },
    { label: 'Team setup', value: state.onboarding.readiness.groupSetup },
    { label: 'Alerting setup', value: state.onboarding.readiness.alertingSetup },
    { label: 'Incident setup', value: state.onboarding.readiness.incidentSetup }
  ]);

  printKeyValuePanel('Step status', [
    { label: 'Create team', value: state.onboarding.steps.createTeam },
    { label: 'Invite members', value: state.onboarding.steps.inviteTeamMembers },
    { label: 'Create schedule', value: state.onboarding.steps.createSchedule },
    { label: 'Create escalation', value: state.onboarding.steps.createEscalationPolicy },
    { label: 'Hook up monitor', value: state.onboarding.steps.hookUpMonitor },
    { label: 'Connect Slack', value: state.onboarding.steps.connectSlack },
    { label: 'Test page', value: state.onboarding.steps.testPage },
    { label: 'Test incident', value: state.onboarding.steps.createTestIncident }
  ]);
}

function printDoctorSummary(state) {
  printSummary('Readiness', [
    state.onboarding.completed ? 'Setup looks healthy enough to start using Rootly.' : 'Setup is still incomplete.',
    `Next best action: ${humanizeAction(state.onboarding.nextBestAction)}`,
    state.onboarding.steps.createTeam === 'needed' ? 'Create the first team inside this Rootly workspace.' : null,
    state.onboarding.steps.inviteTeamMembers === 'needed' ? 'Add members to at least one team.' : null,
    state.onboarding.steps.createSchedule === 'needed' ? 'Create a first on-call schedule.' : null,
    state.onboarding.steps.createEscalationPolicy === 'needed' ? 'Create an escalation policy for at least one team.' : null,
    state.onboarding.steps.hookUpMonitor === 'needed' ? 'Connect a generic webhook alert source.' : null,
    state.onboarding.steps.connectSlack === 'needed' ? 'Connect Slack before testing incident collaboration.' : null
  ].filter(Boolean));
}

function printStartupStatus(state) {
  printKeyValuePanel('Rootly status', [
    { label: 'Workspace', value: state.teams.workspace?.name || state.teams.workspace?.slug || 'Connected Rootly account' },
    { label: 'Teams', value: String(state.teams.total) },
    { label: 'Teams w/ members', value: `${state.teams.teamsWithMembers}/${state.teams.total}` },
    { label: 'Teams w/ on-call', value: `${state.teams.teamsWithSchedules}/${state.teams.total}` },
    { label: 'Teams w/ escalation', value: `${state.teams.teamsWithEscalationPolicies}/${state.teams.total}` },
    { label: 'Alerting', value: state.onboarding.readiness.alertingSetup },
    { label: 'Slack coverage', value: `${state.teams.teamsWithSlack}/${state.teams.total}` }
  ]);
  printCallout('Next best action', [humanizeAction(state.onboarding.nextBestAction)]);
}

function recommendedActionLabel(state) {
  switch (state?.onboarding.nextBestAction) {
    case 'run-guided-setup':
      return 'Review remaining setup';
    case 'create-team':
      return 'Create a team';
    case 'invite-team-members':
      return 'Add team members';
    case 'create-schedule':
      return 'Create a schedule';
    case 'create-escalation-policy':
      return 'Create an escalation policy';
    case 'hook-up-monitor':
      return 'Hook up a monitor (Datadog, Grafana, PagerDuty)';
    default:
      return 'Review remaining setup';
  }
}

function inferWorkspaceNameFromUserPayload(userPayload) {
  const explicitName =
    userPayload?.data?.attributes?.current_team_name ||
    userPayload?.data?.attributes?.team_name ||
    null;

  if (explicitName) {
    return explicitName;
  }

  const decorated = userPayload?.data?.attributes?.full_name_with_team || '';
  const match = decorated.match(/^\[(.+?)\]/);
  return match?.[1] || null;
}

function tokenFingerprint(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

async function sessionPathForToken(token) {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  return path.join(SESSION_DIR, `${tokenFingerprint(token)}.json`);
}

async function chooseTeamRecord(state, prompt = 'Which team do you want to work on?') {
  if (!state?.teams?.all?.length) {
    printSummary('Teams', ['No teams were found in this Rootly workspace.']);
    return null;
  }

  const team = await choose(prompt, [
    ...state.teams.all.map((item) => ({
      label: `${item.name} (${item.memberCount || 0} members, ${item.scheduleCount || 0} schedules, ${item.escalationPolicyCount || 0} escalations)`,
      value: item
    })),
    { label: 'Back to previous menu', value: null }
  ]);

  return team.value;
}

async function chooseMany(question, options) {
  while (true) {
    console.log(panelTitle(question));
    options.forEach((option, index) => {
      console.log(`  ${tone(`${index + 1}.`, FG_PURPLE)} ${option.label}`);
    });

    const raw = await rl.question(`${tone('Select one or more options', FG_SLATE)} (comma-separated): `);
    const indexes = raw
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10) - 1)
      .filter((value) => Number.isInteger(value));

    const uniqueIndexes = [...new Set(indexes)];
    const valid = uniqueIndexes.filter((index) => index >= 0 && index < options.length);

    if (valid.length > 0 && valid.length === uniqueIndexes.length) {
      return valid.map((index) => options[index]);
    }

    console.log(`Please choose one or more numbers between 1 and ${options.length}.`);
    separator();
  }
}

async function chooseMenuAction(state) {
  const recommended = state ? recommendedActionLabel(state) : 'Run guided setup';

  const category = await choose('What would you like to do?', [
    { label: `Continue recommended setup (${recommended})`, action: recommended },
    { label: 'Setup (teams, members, schedules, escalation)', action: 'Setup' },
    { label: 'Integrations (Slack, alert sources, vendor connections)', action: 'Integrations' },
    { label: 'Set up MCP / IDE', action: 'Set up MCP / IDE' },
    { label: 'Inspect (readiness, teams, schedules)', action: 'Inspect' },
    { label: 'Disconnect', action: 'Disconnect' },
    { label: 'Exit wizard', action: 'Exit wizard' }
  ]);

  if (category.action !== 'Setup' && category.action !== 'Integrations' && category.action !== 'Inspect') {
    return category.action;
  }

  if (category.action === 'Setup') {
    const setupAction = await choose('Setup', [
      { label: 'Run guided setup', action: 'Run guided setup' },
      { label: 'Create a team', action: 'Create a team' },
      { label: 'Add team members', action: 'Add team members' },
      { label: 'Create a schedule', action: 'Create a schedule' },
      { label: 'Create an escalation policy', action: 'Create an escalation policy' },
      { label: 'Back to main menu', action: 'Back' }
    ]);
    return setupAction.action;
  }

  if (category.action === 'Integrations') {
    const integrationsAction = await choose('Integrations', [
      { label: 'Connect Slack for incidents', action: 'Connect Slack for incidents' },
      { label: 'Hook up a monitor (Datadog, Grafana, PagerDuty)', action: 'Hook up a monitor' },
      { label: 'Send a test alert', action: 'Send a test alert' },
      { label: 'Create a test incident', action: 'Create a test incident' },
      { label: 'Connect vendor integration in Rootly web', action: 'Connect vendor integration in Rootly web' },
      { label: 'Back to main menu', action: 'Back' }
    ]);
    return integrationsAction.action;
  }

  if (category.action === 'Inspect') {
    const inspectAction = await choose('Inspect', [
      { label: 'Check readiness', action: 'Check readiness' },
      { label: 'View teams', action: 'View teams' },
      { label: 'View schedules', action: 'View schedules' },
      { label: 'View escalation policies', action: 'View escalation policies' },
      { label: 'Back to main menu', action: 'Back' }
    ]);
    return inspectAction.action;
  }
}

async function readSessionCheckpoint() {
  const token = await getActiveToken();
  if (!token) {
    return null;
  }

  const sessionPath = await sessionPathForToken(token);
  try {
    const raw = await fs.readFile(sessionPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeSessionCheckpoint(payload) {
  const token = await getActiveToken();
  if (!token) {
    return;
  }

  const sessionPath = await sessionPathForToken(token);
  await fs.writeFile(sessionPath, `${JSON.stringify({
    ...payload,
    tokenFingerprint: tokenFingerprint(token)
  }, null, 2)}\n`, 'utf8');
}

async function clearSessionCheckpoint() {
  const token = await getActiveToken();
  if (!token) {
    return;
  }

  const sessionPath = await sessionPathForToken(token);
  await fs.rm(sessionPath, { force: true });
}

async function resumeAfterWebSetup(kind, options = {}) {
  const { detectable = true } = options;
  const startState = await loadOnboardingState();
  const url = webHandoffUrl(kind);

  await writeSessionCheckpoint({
    kind: 'web-handoff',
    integration: kind,
    detectable,
    url,
    createdAt: new Date().toISOString()
  });

  const openNow = await ask(`Open the ${kind} setup page in your browser now? (y/n)`, 'y');
  let opened = false;
  if (openNow.toLowerCase().startsWith('y')) {
    opened = await openUrl(url);
  }

  printSummary(`${kind} handoff`, detectable
    ? [
        `${kind} is still connected through the existing Rootly web flow.`,
        opened ? 'Opened the setup page in your browser.' : 'Open this setup page in your browser:',
        url,
        `Complete the ${kind} connection in Rootly, then come back here and press Enter to resume.`
      ]
    : [
        `${kind} still uses the existing Rootly web flow.`,
        opened ? 'Opened the setup page in your browser.' : 'Open this setup page in your browser:',
        url,
        `Complete the ${kind} setup in Rootly, then come back here and press Enter to continue.`
      ]);

  await rl.question(`Press Enter after ${kind} setup is done in the browser...`);

  if (!detectable) {
    await clearSessionCheckpoint();
    printSummary('Continue', [
      `${kind} setup was handed off to Rootly web.`,
      'The wizard does not verify this integration directly.',
      'You can keep going with the next setup step.'
    ]);
    return startState;
  }

  const updatedState = await loadOnboardingState();
  if (!updatedState) {
    printSummary('Resume', ['Could not reload Rootly state after the web handoff.']);
    return null;
  }
  await clearSessionCheckpoint();

  const beforeNext = startState?.onboarding?.nextBestAction || 'unknown';
  const afterNext = updatedState.onboarding.nextBestAction;

  printSummary('Updated status', [
    `Workspace setup: ${updatedState.onboarding.readiness.workspaceSetup}`,
    `Team setup: ${updatedState.onboarding.readiness.groupSetup}`,
    `Alerting setup: ${updatedState.onboarding.readiness.alertingSetup}`,
    `Incident setup: ${updatedState.onboarding.readiness.incidentSetup}`,
    beforeNext !== afterNext
      ? `Next best action moved from "${humanizeAction(beforeNext)}" to "${humanizeAction(afterNext)}"`
      : `Next best action: ${humanizeAction(afterNext)}`
  ]);

  return updatedState;
}

async function authFlow() {
  heading('Sign in');
  console.log('Choose a sign-in method for this Rootly workspace.');
  separator();

  const envToken = process.env.ROOTLY_TOKEN?.trim();
  const authSummary = await getAuthSummary();
  const existingToken = await getStoredToken();
  if (envToken) {
    printSummary('Auth', [
      'Using ROOTLY_TOKEN from environment',
      'No local secret storage needed'
    ]);
    return envToken;
  }

  if (existingToken && authSummary) {
    const reuse = await ask(`${authSummary.label}. Reuse it? (y/n)`, 'y');
    if (reuse.toLowerCase().startsWith('y')) {
      printSummary('Auth', [authSummary.label, 'Reusing existing sign-in']);
      return existingToken;
    }
  }

  const method = await choose('Sign in with Rootly', [
    { label: 'Browser sign-in (recommended)', action: 'oauth' },
    { label: 'API key', action: 'api-key' },
    { label: 'Back', action: 'back' }
  ]);

  if (method.action === 'back') {
    printSummary('Sign in', ['No sign-in method selected.']);
    rl.close();
    return null;
  }

  const baseUrl = process.env.ROOTLY_API_BASE_URL?.trim() || 'https://api.rootly.com';

  let userPayload;
  let stored = false;
  let authSuccessLine = 'Token validated successfully';

  if (method.action === 'oauth') {
    console.log('Opening browser for authentication...');
    console.log('Waiting for Rootly authorization...');

    try {
      const result = await startOAuthLogin(baseUrl);
      userPayload = result.userPayload;
      stored = result.stored;
      authSuccessLine = 'Browser sign-in completed successfully';
    } catch (error) {
      printSummary('Auth failed', [
        error?.message || 'Rootly browser sign-in did not complete',
        'Nothing was stored'
      ]);
      rl.close();
      process.exitCode = 1;
      return null;
    }
  } else {
    console.log('Generate an organization API key in Rootly: Organization dropdown > Organization Settings > API Keys > Generate New API Key.');
    console.log('This wizard works best with an organization-wide key.');
    console.log('Input key here:');
    separator();

    const token = await askHidden('Rootly API key');

    console.log('Validating token...');
    userPayload = await validateToken(token, baseUrl);

    if (!userPayload) {
      printSummary('Auth failed', [
        'Token did not validate against Rootly',
        'Nothing was stored'
      ]);
      rl.close();
      process.exitCode = 1;
      return null;
    }

    stored = await storeToken(token);
  }

  let verifiedAccess = [];
  try {
    const accessToken = await getStoredToken();
    const api = new RootlyApiClient(accessToken, baseUrl);
    await Promise.all([
      api.listTeams(),
      api.listSchedules(),
      api.listEscalationPolicies()
    ]);
    verifiedAccess = ['Teams', 'Schedules', 'Escalation policies'];
  } catch {
    verifiedAccess = ['User profile'];
  }

  const identityName =
    userPayload?.data?.attributes?.full_name ||
    userPayload?.data?.attributes?.name ||
    userPayload?.data?.attributes?.email ||
    'Unknown';
  const workspaceName = inferWorkspaceNameFromUserPayload(userPayload);
  printSummary('Auth complete', [
    authSuccessLine,
    `API identity: ${identityName}`,
    workspaceName ? `Workspace: ${workspaceName}` : null,
    `Verified access: ${verifiedAccess.join(', ')}`,
    stored
      ? (method.action === 'oauth'
        ? 'Browser session stored securely in the system keychain'
        : 'Token stored securely in the system keychain')
      : 'Authentication succeeded, but local secret storage was unavailable'
  ].filter(Boolean));

  return await getStoredToken();
}

async function logoutFlow() {
  await clearSessionCheckpoint();
  const deleted = await deleteToken();
  printSummary('Logout', [
    deleted ? 'Stored token deleted from keychain' : 'No stored token found, or auth is being supplied by ROOTLY_TOKEN'
  ]);
}

async function statusFlow() {
  const state = await loadOnboardingState();
  if (!state) {
    printSummary('Status', ['No auth context found. Authenticate first to inspect onboarding state.']);
    return;
  }

  printStartupStatus(state);
}

async function teamsFlow() {
  const result = await getTeamsAction();
  if (!result.ok) {
    printSummary('Teams', ['No auth context found. Authenticate first to inspect team setup.']);
    return;
  }

  const state = result.data;
  printKeyValuePanel('Team summary', [
    { label: 'Workspace', value: state.workspace?.name || state.workspace?.slug || 'Connected Rootly account' },
    { label: 'Teams', value: String(state.summary.total) },
    { label: 'Teams w/ members', value: `${state.summary.teamsWithMembers}/${state.summary.total}` },
    { label: 'Teams w/ schedules', value: `${state.summary.teamsWithSchedules}/${state.summary.total}` },
    { label: 'Teams w/ escalations', value: `${state.summary.teamsWithEscalationPolicies}/${state.summary.total}` },
    { label: 'Teams w/ Slack', value: `${state.summary.teamsWithSlackSignals}/${state.summary.total}` }
  ]);

  printTeamList('Teams', state.teams);
}

async function schedulesFlow() {
  const result = await getSchedulesAction();
  if (!result.ok) {
    printSummary('Schedules', ['No auth context found. Authenticate first to inspect schedules.']);
    return;
  }

  printKeyValuePanel('Schedule summary', [
    { label: 'Schedules', value: String(result.data.summary.total) },
    { label: '24/7 coverage', value: `${result.data.summary.schedulesWithCoverage}/${result.data.summary.total}` },
    { label: 'Mapped to teams', value: `${result.data.summary.schedulesWithTeams}/${result.data.summary.total}` }
  ]);

  printScheduleList('Schedules', result.data.schedules);
}

async function escalationPoliciesFlow() {
  const result = await getEscalationPoliciesAction();
  if (!result.ok) {
    printSummary('Escalation policies', ['No auth context found. Authenticate first to inspect escalation policies.']);
    return;
  }

  printKeyValuePanel('Escalation policy summary', [
    { label: 'Policies', value: String(result.data.summary.total) },
    { label: 'Mapped to teams', value: `${result.data.summary.policiesWithTeams}/${result.data.summary.total}` },
    { label: 'Repeating', value: `${result.data.summary.repeatingPolicies}/${result.data.summary.total}` }
  ]);

  printEscalationPolicyList('Escalation policies', result.data.policies);
}

async function readinessFlow() {
  const state = await loadOnboardingState();
  if (!state) {
    printSummary('Readiness', ['No auth context found. Authenticate first to inspect onboarding readiness.']);
    return;
  }

  printOnboardingState(state);
  printDoctorSummary(state);
}

function buildHappyPathSummary(items) {
  return items.filter(Boolean);
}

function printCompletionSummary(state) {
  printSummary('Setup summary', [
    `Workspace setup: ${state.onboarding.readiness.workspaceSetup}`,
    `Team setup: ${state.onboarding.readiness.groupSetup}`,
    `Alerting setup: ${state.onboarding.readiness.alertingSetup}`,
    `Incident setup: ${state.onboarding.readiness.incidentSetup}`,
    `Next best action: ${humanizeAction(state.onboarding.nextBestAction)}`
  ]);
}

async function runWorkspaceSetup(state) {
  const teamName = state?.onboarding.steps.createTeam === 'needed'
    ? await ask('Primary team name', 'Payments')
    : 'Rootly team';
  const membersRaw = state?.onboarding.steps.inviteTeamMembers === 'needed'
    ? await ask('Invite team members now? (comma-separated emails, optional)', '')
    : '';

  const memberEmails = membersRaw
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  printSummary('Planned setup', buildHappyPathSummary([
    `Group / team: ${teamName}`,
    memberEmails.length ? `Requested invite emails: ${memberEmails.join(', ')}` : 'Requested invite emails: none',
    'Schedule: create primary on-call rotation',
    'Escalation policy: create default escalation policy',
    'Alert source: create generic webhook source'
  ]));

  const confirm = await ask('Proceed with these Rootly changes? (y/n)', 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Workspace setup', ['No changes were made.']);
    return;
  }

  let teamId = null;
  let memberIds = [];
  let matchedEmails = [];
  try {
    const teamResult = await createTeamAction({
      name: teamName,
      memberEmails,
      enableAlertsAndBroadcast: true
    });
    teamId = teamResult.data.id;
    memberIds = teamResult.data.memberIds;
    matchedEmails = teamResult.data.matchedUsers.map((user) => user.email).filter(Boolean);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the first team.');
    printSummary('Workspace setup stopped', [
      failure.summary,
      `Rootly said: ${failure.error}`,
      'Please create the team in Rootly, then rerun the wizard.'
    ]);
    return;
  }

  let scheduleId = null;
  try {
    const scheduleResult = await createScheduleAction({
      teamId,
      name: `${teamName} On-Call`,
      memberIds
    });
    scheduleId = scheduleResult.data.scheduleId;
  } catch (error) {
    const failure = serializeActionError(error, 'The team was created, but the first schedule did not go through.');
    printSummary('Schedule setup needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`,
      'You can keep going in Rootly web, then come back and resume.'
    ]);
  }

  let escalationPolicyId = null;
  try {
    const escalationResult = await createEscalationPolicyAction({
      teamId,
      name: `${teamName} Default Escalation`,
      repeatCount: 1,
      createDefaultPath: Boolean(scheduleId)
    });
    escalationPolicyId = escalationResult.data.id;
    if (escalationResult.data.pathError) {
      printSummary('Escalation path note', [
        'The escalation policy was created, but the default path was not added automatically.',
        `Rootly said: ${escalationResult.data.pathError}`,
        'You can add the first path in Rootly if needed.'
      ]);
    }
  } catch (error) {
    const failure = serializeActionError(error, 'The team exists, but the default escalation policy was not created.');
    printSummary('Escalation policy needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`,
      'You can create the escalation policy in Rootly and then keep going.'
    ]);
  }

  let alertSourceSummary = 'not created';
  const alertSourceChoice = await choose('Create or connect an alert source?', [
    { label: 'Generic webhook' },
    { label: 'Back to previous menu' }
  ]);

  if (alertSourceChoice.label === 'Back to previous menu') {
    return;
  }

  try {
    const sourceResult = await createAlertSourceAction({
      teamId,
      name: `${teamName} ${alertSourceChoice.label}`
    });
    alertSourceSummary = sourceResult.data.webhookEndpoint || sourceResult.data.secret || 'connected';
  } catch (error) {
    alertSourceSummary = 'needs manual follow-up';
    const failure = serializeActionError(error, 'The generic webhook source was not created automatically.');
    printSummary('Alert source needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`,
      'You can connect the alert source in Rootly and then return for the paging test.'
    ]);
  }

  printSummary('What the wizard completed', buildHappyPathSummary([
    `Team: ${teamName}`,
    teamId ? `Team ID: ${teamId}` : null,
    `Matched existing users: ${matchedEmails.join(', ') || 'none'}`,
    scheduleId ? `Schedule created: ${scheduleId}` : 'Schedule created: no',
    escalationPolicyId ? `Escalation policy created: ${escalationPolicyId}` : 'Escalation policy created: no',
    `Alert source: ${alertSourceSummary}`
  ]));

  printSummary('What comes next', [
    'Slack still uses the existing Rootly web flow.',
    'Use the Slack handoff when you are ready to wire incident channels.'
  ]);
}

async function runGroupSetup(state) {
  printSummary('Team setup check', [
    state?.onboarding.steps.inviteTeamMembers === 'needed' ? 'Add members to at least one team.' : 'Team membership already looks present.',
    state?.onboarding.steps.createSchedule === 'needed' ? 'Create the first on-call schedule next.' : 'A schedule already exists for the current scope.',
    state?.onboarding.steps.createEscalationPolicy === 'needed' ? 'Create an escalation policy for a team.' : 'An escalation policy already exists for the current scope.'
  ]);
}

async function runAlertingSetup(state) {
  printSummary('Alerting setup check', [
    state?.onboarding.steps.hookUpMonitor === 'needed'
      ? 'Generic webhook is the only alert source the wizard configures directly.'
      : 'Alerting looks partially configured already.',
    state?.onboarding.steps.testPage === 'blocked'
      ? 'Test paging stays blocked until the generic webhook path is in place.'
      : 'You can test paging after connecting the alert source.'
  ]);
}

async function runIncidentSetup(state) {
  printSummary('Incident setup check', [
    state?.onboarding.steps.connectSlack === 'needed'
      ? 'Slack still needs the Rootly web handoff.'
      : 'Slack looks connected already.',
    state?.onboarding.steps.createTestIncident === 'blocked'
      ? 'A test incident should wait until Slack is connected.'
      : 'A test incident is the right final smoke test.'
  ]);

  if (state?.onboarding.steps.connectSlack === 'needed') {
    await resumeAfterWebSetup('Slack');
  }
}

async function runOnboarding(state) {
  await runWorkspaceSetup(state);
  await runGroupSetup(state);
  await runAlertingSetup(state);
  await runIncidentSetup(state);

  const refreshedState = await loadOnboardingState();
  if (refreshedState) {
    printCompletionSummary(refreshedState);
  }
}

async function accountSetup() {
  heading('Run guided setup');
  console.log('Workspace setup, team setup, alerting setup, then incident setup.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  await runOnboarding(state);
}

async function continueRecommendedSetup(state) {
  const nextAction = state?.onboarding?.nextBestAction || 'run-guided-setup';

  if (nextAction === 'create-team') {
    await createTeamSetup();
    return;
  }

  if (nextAction === 'invite-team-members') {
    await addTeamMembersSetup();
    return;
  }

  if (nextAction === 'create-schedule') {
    await createScheduleSetup();
    return;
  }

  if (nextAction === 'create-escalation-policy') {
    await createEscalationPolicySetup();
    return;
  }

  if (nextAction === 'hook-up-monitor') {
    await alertSourceSetup();
    return;
  }

  heading('Review remaining setup');
  console.log('The workspace already has the main setup objects the wizard can verify.');
  separator();
  if (state) {
    printOnboardingState(state);
    printSummary('What comes next', [
      'Use the explicit setup actions in the menu if you want to keep refining teams, schedules, or escalation policies.',
      'Use the integrations menu when you are ready to connect Slack or another vendor integration.'
    ]);
  }
}

async function createTeamSetup() {
  heading('Create a team');
  const state = await loadOnboardingState();

  if (state) {
    printStartupStatus(state);
  }

  const teamName = await ask('Team name', 'Payments');
  const description = await ask('Description', 'Created during Rootly setup');

  const confirm = await ask('Create this team now? (y/n)', 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Team setup', ['No changes were made.']);
    return;
  }

  try {
    const result = await createTeamAction({ name: teamName, description });

    printSummary('Team created', [
      `Team: ${teamName}`,
      `Team ID: ${result.data.id || 'created'}`
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the team.');
    printSummary('Team setup needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`
    ]);
  }
}

async function addTeamMembersSetup() {
  heading('Add team members');
  const state = await loadOnboardingState();

  if (state) {
    printStartupStatus(state);
  }

  const team = await chooseTeamRecord(state, 'Which team are you adding members to?');
  if (!team) {
    return;
  }

  const membersRaw = await ask('Emails to add (comma-separated)', '');
  const emails = membersRaw.split(',').map((value) => value.trim()).filter(Boolean);

  if (!emails.length) {
    printSummary('Team members', ['No email addresses were provided.']);
    return;
  }

  const confirm = await ask(`Add ${emails.join(', ')} to ${team.name}? (y/n)`, 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Team members', ['No changes were made.']);
    return;
  }

  try {
    const result = await addTeamMembersAction({ teamId: team.id, emails });

    printSummary('Team members updated', [
      `Team: ${team.name}`,
      `Matched existing users: ${result.data.matchedUsers.map((user) => user.email).join(', ') || 'none'}`,
      `Requested emails: ${emails.join(', ')}`
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not update team membership.');
    printSummary('Team members need attention', [
      failure.summary,
      `Rootly said: ${failure.error}`
    ]);
  }
}

async function createScheduleSetup() {
  heading('Create a schedule');
  const state = await loadOnboardingState();

  if (state) {
    printStartupStatus(state);
  }

  const team = await chooseTeamRecord(state, 'Which team should own this schedule?');
  if (!team) {
    return;
  }

  const name = await ask('Schedule name', `${team.name} On-Call`);
  const handoffTime = await ask('Daily handoff time (HH:MM)', '09:00');

  const confirm = await ask(`Create ${name} for ${team.name}? (y/n)`, 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Schedule setup', ['No changes were made.']);
    return;
  }

  try {
    const result = await createScheduleAction({ teamId: team.id, name, handoffTime });

    printSummary('Schedule created', [
      `Team: ${team.name}`,
      `Schedule: ${name}`,
      result.data.scheduleId ? `Schedule ID: ${result.data.scheduleId}` : 'Schedule created'
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the schedule.');
    printSummary('Schedule setup needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`
    ]);
  }
}

async function createEscalationPolicySetup() {
  heading('Create an escalation policy');
  const state = await loadOnboardingState();

  if (state) {
    printStartupStatus(state);
  }

  const team = await chooseTeamRecord(state, 'Which team should own this escalation policy?');
  if (!team) {
    return;
  }

  const name = await ask('Escalation policy name', `${team.name} Default Escalation`);
  const repeatCount = Number.parseInt(await ask('Repeat count', '1'), 10) || 1;

  const confirm = await ask(`Create ${name} for ${team.name}? (y/n)`, 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Escalation policy', ['No changes were made.']);
    return;
  }

  try {
    const result = await createEscalationPolicyAction({ teamId: team.id, name, repeatCount });

    printSummary('Escalation policy created', [
      `Team: ${team.name}`,
      `Policy: ${name}`,
      `Policy ID: ${result.data.id || 'created'}`
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the escalation policy.');
    printSummary('Escalation policy needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`
    ]);
  }
}

async function slackSetup() {
  heading('Connect Slack for incidents');
  console.log('Slack still uses the existing Rootly web flow.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printStartupStatus(state);
  }

  await resumeAfterWebSetup('Slack', { detectable: false });

  printSummary('Slack setup summary', [
    'Slack setup was handed off to Rootly web.',
    'The wizard does not verify Slack directly.',
    'Next step: return to this flow after Slack is configured if you want to continue incident setup manually.'
  ]);
}

async function alertSourceSetup() {
  heading('Hook up a monitor');
  console.log('The wizard can set up a generic webhook alert source directly.');
  separator();
  const state = await loadOnboardingState();
  if (state) {
    printStartupStatus(state);
  }

  const team = state ? await chooseTeamRecord(state, 'Which team should own this alert source?') : null;
  if (state?.teams?.all?.length && !team) {
    return;
  }

  const source = await choose('Which alert source are we setting up?', [
    { label: 'Generic webhook' },
    { label: 'Back to previous menu' }
  ]);
  if (source.label === 'Back to previous menu') {
    return;
  }

  const name = await ask('Alert source name', team ? `${team.name} Generic webhook` : 'Generic webhook');

  const confirm = await ask(`Create ${name} now? (y/n)`, 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Monitor setup', ['No changes were made.']);
    return;
  }

  try {
    const result = await createAlertSourceAction({ teamId: team?.id, name });

    printSummary('Alert source created', [
      `Source: ${name}`,
      result.data.id ? `Alert source ID: ${result.data.id}` : 'Alert source created',
      result.data.webhookEndpoint ? `Webhook endpoint: ${result.data.webhookEndpoint}` : 'Webhook endpoint: not returned',
      'Next step: send a test alert to verify paging'
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the alert source.');
    printSummary('Monitor setup needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`
    ]);
  }
}

function parseIdList(raw) {
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

async function loadApiClientOrNull() {
  try {
    return await loadApiClient();
  } catch {
    return null;
  }
}

function extractResourceOptions(payload) {
  return (payload?.data || [])
    .map((record) => ({
      id: record.id,
      name: record.attributes?.name || record.attributes?.slug || record.id
    }))
    .filter((record) => record.id);
}

const PICK_MANUAL = '__manual__';
const PICK_SKIP = '__skip__';

async function pickResourceIds(label, api, method, { multi = true } = {}) {
  let options = [];
  if (api && typeof api[method] === 'function') {
    try {
      options = extractResourceOptions(await api[method]());
    } catch {
      options = [];
    }
  }

  if (!options.length) {
    if (multi) {
      return parseIdList(await ask(`${label} IDs (comma-separated, optional)`, ''));
    }
    return (await ask(`${label} ID (optional)`, '')).trim() || null;
  }

  const menu = [
    ...options.map((option) => ({ label: `${option.name} (${option.id})`, value: option.id })),
    { label: 'Enter IDs manually', value: PICK_MANUAL },
    { label: 'Skip / none', value: PICK_SKIP }
  ];

  if (multi) {
    const chosen = await chooseMany(`Select ${label} (or skip)`, menu);
    const values = chosen.map((entry) => entry.value);
    if (values.includes(PICK_MANUAL)) {
      return parseIdList(await ask(`${label} IDs (comma-separated)`, ''));
    }
    return values.filter((value) => value !== PICK_SKIP && value !== PICK_MANUAL);
  }

  const chosen = await choose(`Select ${label} (or skip)`, menu);
  if (chosen.value === PICK_MANUAL) {
    return (await ask(`${label} ID`, '')).trim() || null;
  }
  if (chosen.value === PICK_SKIP) {
    return null;
  }
  return chosen.value;
}

async function testAlertSetup() {
  heading('Send a test alert');
  const state = await loadOnboardingState();
  if (state) {
    printStartupStatus(state);
  }

  const team = state ? await chooseTeamRecord(state, 'Which team should receive this test alert?') : null;
  const summary = await ask('Alert summary', 'Rootly Wizard test alert');
  const description = await ask('Description', 'Test alert sent from Rootly Wizard');
  const api = await loadApiClientOrNull();
  const serviceIds = await pickResourceIds('Services', api, 'listServices');
  const environmentIds = await pickResourceIds('Environments', api, 'listEnvironments');

  const confirm = await ask(`Send test alert "${summary}" now? (y/n)`, 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Test alert', ['No changes were made.']);
    return;
  }

  try {
    const result = await createTestAlertAction({
      summary,
      description,
      groupIds: team ? [team.id] : [],
      serviceIds,
      environmentIds
    });

    printSummary('Test alert sent', [
      `Alert: ${summary}`,
      result.data.id ? `Alert ID: ${result.data.id}` : 'Alert created'
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the test alert.');
    printSummary('Test alert needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`
    ]);
  }
}

async function testIncidentSetup() {
  heading('Create a test incident');
  const state = await loadOnboardingState();
  if (state) {
    printStartupStatus(state);
  }

  const team = state ? await chooseTeamRecord(state, 'Which team should own this test incident?') : null;
  const title = await ask('Incident title', 'Rootly Wizard test incident');
  const summary = await ask('Summary', 'Test incident created from Rootly Wizard');
  const api = await loadApiClientOrNull();
  const severityId = await pickResourceIds('Severity', api, 'listSeverities', { multi: false });
  const incidentTypeIds = await pickResourceIds('Incident types', api, 'listIncidentTypes');
  const serviceIds = await pickResourceIds('Services', api, 'listServices');
  const environmentIds = await pickResourceIds('Environments', api, 'listEnvironments');
  const isPrivate = (await ask('Private incident? (y/n)', 'n')).toLowerCase().startsWith('y');

  const confirm = await ask(`Create test incident "${title}" now? (y/n)`, 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Test incident', ['No changes were made.']);
    return;
  }

  try {
    const result = await createTestIncidentAction({
      title,
      summary,
      groupIds: team ? [team.id] : [],
      serviceIds,
      environmentIds,
      incidentTypeIds,
      severityId: severityId || null,
      isPrivate
    });

    printSummary('Test incident created', [
      `Incident: ${title}`,
      result.data.id ? `Incident ID: ${result.data.id}` : 'Incident created',
      result.data.slackChannelName ? `Slack channel: ${result.data.slackChannelName}` : 'Slack channel: not returned'
    ]);
  } catch (error) {
    const failure = serializeActionError(error, 'The wizard could not create the test incident.');
    printSummary('Test incident needs attention', [
      failure.summary,
      `Rootly said: ${failure.error}`,
      'Some Rootly workspaces require severity, incident type, or other form fields for incident creation.'
    ]);
  }
}

async function vendorHandoffSetup() {
  heading('Connect vendor integration in Rootly web');
  console.log('These integrations are still connected through Rootly web.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printStartupStatus(state);
  }

  const vendor = await choose('Which integration are you connecting?', [
    { label: 'Slack' },
    { label: 'Datadog' },
    { label: 'Sentry' },
    { label: 'Grafana' },
    { label: 'PagerDuty' },
    { label: 'Opsgenie' },
    { label: 'Back to previous menu' }
  ]);

  if (vendor.label === 'Back to previous menu') {
    return;
  }

  if (vendor.label === 'Slack') {
    await resumeAfterWebSetup(vendor.label);
    return;
  }

  await resumeAfterWebSetup(vendor.label, { detectable: false });
}

async function mcpSetup() {
  heading('IDE / MCP setup');
  console.log('This uses the hosted Rootly MCP server and can configure multiple supported clients in one run.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  const clients = await chooseMany('Which clients do you want to configure?', [
    { label: 'Cursor' },
    { label: 'Claude Code' },
    { label: 'Claude Desktop' },
    { label: 'Windsurf' },
    { label: 'Codex' }
  ]);
  const tokenType = await choose('How will Rootly auth be provided?', [
    { label: 'Use stored token' },
    { label: 'Use ROOTLY_TOKEN' },
    { label: 'Back to previous menu' }
  ]);

  if (tokenType.label === 'Back to previous menu') {
    return;
  }

  const writeConfig = await ask('Should I write the MCP config file for you? (y/n)', 'y');
  const preview = clients.map((client) => buildHostedMcpPreview(client.label, tokenType.label)).join('\n---\n');

  console.log(preview);
  separator();

  if (!writeConfig.toLowerCase().startsWith('y')) {
    printSummary('MCP setup preview', [
      `Clients: ${clients.map((client) => client.label).join(', ')}`,
      ...clients.map((client) => `${client.label}: ${getMcpConfigPath(client.label)}`),
      'Next step: copy the config into place or rerun and let the wizard write it'
    ]);
    return;
  }

  const token = tokenType.label === 'Use ROOTLY_TOKEN'
    ? process.env.ROOTLY_TOKEN?.trim()
    : await getStoredToken();
  if (!token) {
    printSummary('MCP setup blocked', [
      tokenType.label === 'Use ROOTLY_TOKEN'
        ? 'ROOTLY_TOKEN was not found in the environment'
        : 'No stored Rootly token was found',
      'Authenticate first, or provide ROOTLY_TOKEN in the environment'
    ]);
    return;
  }

  const results = [];
  for (const client of clients) {
    const { targetPath, backupPath } = await writeHostedMcpConfig(client.label, token);
    await verifyHostedMcpConfig(client.label);
    results.push({ client: client.label, targetPath, backupPath });
  }

  const writesPlaintextToken = clients.some((client) => client.label !== 'Codex');
  const writesProjectConfig = clients.some((client) => client.label === 'Claude Code');
  const authSummary = tokenType.label === 'Use stored token' ? await getAuthSummary() : null;
  const usingOAuthToken = authSummary?.mode === 'oauth';

  printSummary('MCP setup summary', buildHappyPathSummary([
    `Clients: ${clients.map((client) => client.label).join(', ')}`,
    `Auth: ${tokenType.label}`,
    ...results.map((result) => `${result.client}: ${result.targetPath}`),
    ...results.filter((result) => result.backupPath).map((result) => `${result.client} backup: ${result.backupPath}`),
    'Config verified successfully for each selected client',
    writesPlaintextToken ? 'Note: the token is stored in plaintext in these config files. Keep them out of version control.' : null,
    writesProjectConfig ? 'Note: Claude Code config is written to .mcp.json in this directory — add it to .gitignore.' : null,
    usingOAuthToken ? 'Note: browser sign-in uses a short-lived token, so this MCP config can stop working when it expires. Use an API key for durable MCP access.' : null,
    'Next step: restart the client if needed and verify the connection'
  ]));
}

async function runActionCommand() {
  const actionName = process.argv[3];
  const rawInput = process.argv[4];
  const inputPayload = rawInput ? JSON.parse(rawInput) : {};

  let result;
  try {
    if (actionName === 'get-status') {
      result = await getStatusAction();
    } else if (actionName === 'get-readiness') {
      result = await getReadinessAction();
    } else if (actionName === 'list-teams') {
      result = await getTeamsAction();
    } else if (actionName === 'list-schedules') {
      result = await getSchedulesAction();
    } else if (actionName === 'list-escalation-policies') {
      result = await getEscalationPoliciesAction();
    } else if (actionName === 'get-recommended-next-step') {
      result = await getRecommendedNextStepAction();
    } else if (actionName === 'create-team') {
      result = await createTeamAction(inputPayload);
    } else if (actionName === 'add-team-members') {
      result = await addTeamMembersAction(inputPayload);
    } else if (actionName === 'create-schedule') {
      result = await createScheduleAction(inputPayload);
    } else if (actionName === 'create-escalation-policy') {
      result = await createEscalationPolicyAction(inputPayload);
    } else if (actionName === 'create-alert-source') {
      result = await createAlertSourceAction(inputPayload);
    } else if (actionName === 'create-test-alert') {
      result = await createTestAlertAction(inputPayload);
    } else if (actionName === 'create-test-incident') {
      result = await createTestIncidentAction(inputPayload);
    } else if (actionName === 'start-web-handoff') {
      result = await startWebHandoffAction(inputPayload);
    } else if (actionName === 'preview-mcp-setup') {
      result = await previewMcpSetupAction(inputPayload);
    } else if (actionName === 'apply-mcp-setup') {
      result = await applyMcpSetupAction(inputPayload);
    } else {
      result = {
        ok: false,
        code: 'UNKNOWN_ACTION',
        summary: `Unknown action: ${actionName || '(missing)'}`,
        availableActions: [
          'get-status',
          'get-readiness',
          'list-teams',
          'list-schedules',
          'list-escalation-policies',
          'get-recommended-next-step',
          'create-team',
          'add-team-members',
          'create-schedule',
          'create-escalation-policy',
          'create-alert-source',
          'create-test-alert',
          'create-test-incident',
          'start-web-handoff',
          'preview-mcp-setup',
          'apply-mcp-setup'
        ]
      };
    }
  } catch (error) {
    result = {
      ok: false,
      code: 'ACTION_FAILED',
      summary: `Action ${actionName || '(missing)'} failed.`,
      error: error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error',
      data: null
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
  heading('Rootly Wizard');
  console.log('A guided onboarding CLI for getting Rootly operational quickly.');
  separator();
  console.log('Usage:');
  console.log('  rootly-wizard                 Start the interactive guided setup');
  console.log('  rootly-wizard status          Print a one-shot workspace status summary');
  console.log('  rootly-wizard readiness       Print the full onboarding readiness report');
  console.log('  rootly-wizard teams           List teams and their setup coverage');
  console.log('  rootly-wizard resume          Resume a pending web handoff (e.g. Slack)');
  console.log('  rootly-wizard logout          Remove the stored token from the keychain');
  console.log('  rootly-wizard action <name> [json]   Run a single action non-interactively (JSON in/out)');
  console.log('  rootly-wizard help            Show this help');
  separator();
  console.log('Auth: set ROOTLY_TOKEN, or sign in on first run (browser or API key).');
  console.log('Run `rootly-wizard action unknown` to list the available actions.');
}

function formatTopLevelError(error) {
  const message = error?.message || String(error);

  if (/\b401\b/.test(message)) {
    return 'Rootly rejected the token (401). Re-authenticate with `rootly-wizard logout`, then rerun.';
  }
  if (/\b403\b/.test(message)) {
    return 'Rootly denied access (403). This wizard expects an admin, organization-wide API key — check your token scope.';
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timed out|aborted/i.test(message)) {
    return 'A Rootly API request timed out. Check your network connection and try again.';
  }

  return message;
}

async function main() {
  const entry = process.argv[2];
  if (entry === 'action') {
    await runActionCommand();
    rl.close();
    return;
  }

  if (entry === 'help' || entry === '--help' || entry === '-h') {
    printHelp();
    rl.close();
    return;
  }

  await printLogo();
  heading('Rootly Wizard');
  console.log('A guided onboarding CLI for getting Rootly operational quickly');
  separator();

  if (!input.isTTY || !output.isTTY) {
    console.log('An interactive terminal is required. Run this in a normal shell session.');
    process.exitCode = 1;
    rl.close();
    return;
  }

  if (entry === 'logout' || entry === 'forget' || entry === 'disconnect' || entry === 'signout') {
    await logoutFlow();
    rl.close();
    return;
  }

  if (entry === 'status') {
    await statusFlow();
    rl.close();
    return;
  }

  if (entry === 'readiness') {
    await readinessFlow();
    rl.close();
    return;
  }

  if (entry === 'teams') {
    await teamsFlow();
    rl.close();
    return;
  }

  if (entry === 'resume') {
    const checkpoint = await readSessionCheckpoint();
    if (!checkpoint) {
      printSummary('Resume', ['No saved handoff checkpoint was found.']);
      rl.close();
      return;
    }

    await resumeAfterWebSetup(checkpoint.integration, { detectable: checkpoint.detectable });
    rl.close();
    return;
  }

  const hasAuthContext = Boolean(process.env.ROOTLY_TOKEN?.trim() || (await getStoredToken()));
  if (!hasAuthContext) {
    await authFlow();
    if (process.exitCode) {
      rl.close();
      return;
    }
  } else {
    const authSummary = await getAuthSummary();
    printSummary('Auth', [
      authSummary?.label || (process.env.ROOTLY_TOKEN?.trim() ? 'Using ROOTLY_TOKEN from environment' : 'Stored token found in keychain'),
      'Proceeding to onboarding state detection'
    ]);
  }

  while (true) {
    const state = await loadOnboardingState();
    if (state) {
      console.log('Checking your Rootly setup...');
      separator();
      printStartupStatus(state);
    }

    const checkpoint = await readSessionCheckpoint();
    if (checkpoint?.kind === 'web-handoff') {
      printSummary('Resume available', [
        `Pending handoff: ${checkpoint.integration}`,
        `Resume with: node ./src/cli.js resume`
      ]);
    }

    const action = await chooseMenuAction(state);

    separator();

    if (action === 'Back') {
      continue;
    }

    if (action === 'Review remaining setup') {
      await continueRecommendedSetup(state);
    } else if (action === 'Run guided setup') {
      await accountSetup();
    } else if (action === 'Check readiness') {
      await readinessFlow();
    } else if (action === 'View teams') {
      await teamsFlow();
    } else if (action === 'View schedules') {
      await schedulesFlow();
    } else if (action === 'View escalation policies') {
      await escalationPoliciesFlow();
    } else if (action === 'Create a team') {
      await createTeamSetup();
    } else if (action === 'Add team members') {
      await addTeamMembersSetup();
    } else if (action === 'Create a schedule') {
      await createScheduleSetup();
    } else if (action === 'Create an escalation policy') {
      await createEscalationPolicySetup();
    } else if (action === 'Connect Slack for incidents') {
      await slackSetup();
    } else if (action === 'Hook up a monitor') {
      await alertSourceSetup();
    } else if (action === 'Send a test alert') {
      await testAlertSetup();
    } else if (action === 'Create a test incident') {
      await testIncidentSetup();
    } else if (action === 'Connect vendor integration in Rootly web') {
      await vendorHandoffSetup();
    } else if (action === 'Disconnect') {
      await logoutFlow();
      break;
    } else if (action === 'Exit wizard') {
      printSummary('Goodbye', ['Thanks for using Rootly Wizard.']);
      break;
    } else {
      await mcpSetup();
    }

    separator();
  }

  rl.close();
}

main().catch((error) => {
  console.error(formatTopLevelError(error));
  rl.close();
  process.exitCode = 1;
});
