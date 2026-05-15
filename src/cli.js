#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { buildHostedMcpPreview, getMcpConfigPath, verifyHostedMcpConfig, writeHostedMcpConfig } from './mcp.js';
import { deleteToken, getStoredToken, storeToken, validateToken } from './auth.js';
import { RootlyApiClient } from './rootly-api.js';
import { detectOnboardingState } from './detect-state.js';

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
      const hiddenRl = createInterface();
      output.write(prompt);
      const answer = await hiddenRl.question('');
      hiddenRl.close();
      output.write('\n');
      return answer.trim();
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

function formatApiError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
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
      return 'Hook up a monitor';
    default:
      return 'Review remaining setup';
  }
}

function humanizeAction(action) {
  switch (action) {
    case 'run-guided-setup':
      return 'Review remaining setup';
    case 'create-team':
      return 'Create the first team';
    case 'invite-team-members':
      return 'Add members to a team';
    case 'create-schedule':
      return 'Create the first on-call schedule';
    case 'create-escalation-policy':
      return 'Create the first escalation policy';
    case 'hook-up-monitor':
      return 'Hook up a generic webhook monitor';
    case 'connect-slack':
      return 'Connect Slack in Rootly web';
    case 'create-test-incident':
      return 'Create a test incident in Slack';
    default:
      return 'Continue setup';
  }
}

async function getActiveToken() {
  return process.env.ROOTLY_TOKEN?.trim() || (await getStoredToken()) || null;
}

function tokenFingerprint(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

async function sessionPathForToken(token) {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  return path.join(SESSION_DIR, `${tokenFingerprint(token)}.json`);
}

async function loadApiClient() {
  const token = await getActiveToken();
  if (!token) {
    throw new Error('Rootly auth is required first.');
  }

  return new RootlyApiClient(token);
}

async function chooseTeamRecord(state, prompt = 'Which team do you want to work on?') {
  if (!state?.teams?.all?.length) {
    printSummary('Teams', ['No teams were found in this Rootly workspace.']);
    return null;
  }

  const team = await choose(prompt, state.teams.all.map((item) => ({
    label: `${item.name} (${item.memberCount || 0} members, ${item.scheduleCount || 0} schedules, ${item.escalationPolicyCount || 0} escalations)`,
    value: item
  })));

  return team.value;
}

function rootlyAppBaseUrl() {
  return process.env.ROOTLY_APP_URL?.trim() || 'https://rootly.com';
}

function webHandoffUrl(kind) {
  const base = rootlyAppBaseUrl();

  switch (kind) {
    case 'Slack':
      return `${base}/account/integrations/slack_accounts/landing`;
    case 'Datadog':
      return `${base}/account/integrations/datadog_accounts/new`;
    case 'Sentry':
      return `${base}/account/integrations/sentry_accounts/new`;
    case 'Grafana':
      return `${base}/account/integrations/grafana_accounts/new`;
    case 'PagerDuty':
      return `${base}/account/integrations/pagerduty_accounts/new`;
    case 'Opsgenie':
      return `${base}/account/integrations/opsgenie_accounts/new`;
    default:
      return `${base}/account/integrations`;
  }
}

async function openUrl(url) {
  const platform = process.platform;

  return new Promise((resolve) => {
    let child;

    if (platform === 'darwin') {
      child = spawn('open', [url], { stdio: 'ignore' });
    } else if (platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true });
    } else {
      child = spawn('xdg-open', [url], { stdio: 'ignore' });
    }

    child.on('error', () => resolve(false));
    child.on('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
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
    { label: 'Inspect (readiness and teams)', action: 'Inspect' },
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
      { label: 'Create an escalation policy', action: 'Create an escalation policy' }
    ]);
    return setupAction.action;
  }

  if (category.action === 'Integrations') {
    const integrationsAction = await choose('Integrations', [
      { label: 'Connect Slack for incidents', action: 'Connect Slack for incidents' },
      { label: 'Hook up a monitor', action: 'Hook up a monitor' },
      { label: 'Connect vendor integration in Rootly web', action: 'Connect vendor integration in Rootly web' }
    ]);
    return integrationsAction.action;
  }

  if (category.action === 'Tools') {
    const toolsAction = await choose('Tools', [
      { label: 'Set up MCP / IDE', action: 'Set up MCP / IDE' }
    ]);
    return toolsAction.action;
  }

  if (category.action === 'Inspect') {
    const inspectAction = await choose('Inspect', [
      { label: 'Check readiness', action: 'Check readiness' },
      { label: 'View teams', action: 'View teams' }
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

  const openNow = await ask(`Open the ${kind} setup page in your browser now? (yes/no)`, 'yes');
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
  console.log('Generate an organization API key in Rootly: Organization dropdown > Organization Settings > API Keys > Generate New API Key.');
  console.log('This wizard works best with an organization-wide key.');
  separator();

  const envToken = process.env.ROOTLY_TOKEN?.trim();
  const existingToken = await getStoredToken();
  if (envToken) {
    printSummary('Auth', [
      'Using ROOTLY_TOKEN from environment',
      'No local secret storage needed'
    ]);
    return envToken;
  }

  if (existingToken) {
    const reuse = await ask('A Rootly token is already stored. Reuse it? (yes/no)', 'yes');
    if (reuse.toLowerCase().startsWith('y')) {
      printSummary('Auth', ['Stored token found in keychain', 'Reusing existing token']);
      return existingToken;
    }
  }

  const token = await askHidden('Paste your admin org-wide Rootly API key');
  const baseUrl = process.env.ROOTLY_API_BASE_URL?.trim() || 'https://api.rootly.com';

  console.log('Validating token...');
  const isValid = await validateToken(token, baseUrl);

  if (!isValid) {
    printSummary('Auth failed', [
      'Token did not validate against Rootly',
      'Nothing was stored'
    ]);
    rl.close();
    process.exitCode = 1;
    return null;
  }

  const stored = await storeToken(token);
  printSummary('Auth complete', [
    'Token validated successfully',
    stored ? 'Token stored securely in the system keychain' : 'Token validated, but local secret storage was unavailable'
  ]);

  return token;
}

async function loadOnboardingState() {
  const token = await getActiveToken();
  if (!token) {
    return null;
  }

  const api = new RootlyApiClient(token);
  const [userPayload, teamsPayload, schedulesPayload, escalationPoliciesPayload] = await Promise.all([
    api.getCurrentUser(),
    api.listTeams(),
    api.listSchedules(),
    api.listEscalationPolicies()
  ]);

  return detectOnboardingState({
    userPayload,
    teamsPayload,
    schedulesPayload,
    escalationPoliciesPayload,
    authMode: process.env.ROOTLY_TOKEN?.trim() ? 'env-token' : 'stored-token'
  });
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
  const state = await loadOnboardingState();
  if (!state) {
    printSummary('Teams', ['No auth context found. Authenticate first to inspect team setup.']);
    return;
  }

  printKeyValuePanel('Team summary', [
    { label: 'Workspace', value: state.teams.workspace?.name || state.teams.workspace?.slug || 'Connected Rootly account' },
    { label: 'Teams', value: String(state.teams.total) },
    { label: 'Teams w/ members', value: `${state.teams.teamsWithMembers}/${state.teams.total}` },
    { label: 'Teams w/ schedules', value: `${state.teams.teamsWithSchedules}/${state.teams.total}` },
    { label: 'Teams w/ escalations', value: `${state.teams.teamsWithEscalationPolicies}/${state.teams.total}` },
    { label: 'Teams w/ Slack', value: `${state.teams.teamsWithSlack}/${state.teams.total}` }
  ]);

  printTeamList('Teams', state.teams.all);
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

function extractTeamId(group) {
  return group?.data?.id || group?.id || null;
}

function extractUserId(user) {
  return user?.id || user?.data?.id || null;
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
  const token = process.env.ROOTLY_TOKEN?.trim() || (await getStoredToken());
  if (!token) {
    throw new Error('Rootly auth is required before running onboarding mutations');
  }

  const api = new RootlyApiClient(token);
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

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

  const resolvedMembers = [];
  for (const email of memberEmails) {
    const match = await api.findUserByEmail(email);
    if (match) {
      resolvedMembers.push(match);
    }
  }

  const resolvedMemberIds = resolvedMembers.map((user) => Number.parseInt(user.id, 10)).filter(Number.isFinite);

  printSummary('Planned setup', buildHappyPathSummary([
    `Group / team: ${teamName}`,
    `Matched existing users: ${resolvedMembers.map((user) => user.attributes?.email).join(', ') || 'none'}`,
    memberEmails.length ? `Requested invite emails: ${memberEmails.join(', ')}` : 'Requested invite emails: none',
    'Schedule: create primary on-call rotation',
    'Escalation policy: create default escalation policy',
    'Alert source: create generic webhook source'
  ]));

  const confirm = await ask('Proceed with these Rootly changes? (yes/no)', 'yes');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Workspace setup', ['No changes were made.']);
    return;
  }

  let teamPayload;
  try {
    teamPayload = await api.createTeam({
      name: teamName,
      description: 'Created during Rootly setup',
      notify_emails: memberEmails,
      user_ids: [currentUserId, ...resolvedMemberIds].filter(Boolean),
      admin_ids: [currentUserId].filter(Boolean),
      alerts_email_enabled: true,
      incident_broadcast_enabled: true,
      auto_add_members_when_attached: true
    });
  } catch (error) {
    printSummary('Workspace setup stopped', [
      'The wizard could not create the first team.',
      `Rootly said: ${formatApiError(error)}`,
      'Please create the team in Rootly or adjust the payload shape, then rerun the wizard.'
    ]);
    return;
  }

  const teamId = extractTeamId(teamPayload);

  let createdSchedule = null;
  try {
    createdSchedule = await api.createSchedule({
      name: `${teamName} On-Call`,
      description: 'Primary on-call rotation created by Rootly Wizard',
      all_time_coverage: true,
      owner_user_id: currentUserId,
      owner_group_ids: teamId ? [teamId] : []
    });
  } catch (error) {
    printSummary('Schedule setup needs attention', [
      'The team was created, but the first schedule did not go through.',
      `Rootly said: ${formatApiError(error)}`,
      'You can keep going in Rootly web, then come back and resume.'
    ]);
  }

  const scheduleId = createdSchedule?.data?.id || createdSchedule?.id || null;
  if (scheduleId) {
    try {
      await api.createScheduleRotation(scheduleId, {
        name: `${teamName} Primary Rotation`,
        schedule_rotationable_type: 'ScheduleDailyRotation',
        schedule_rotationable_attributes: {
          handoff_time: '09:00'
        },
        position: 1,
        active_all_week: true,
        time_zone: 'Etc/UTC',
        schedule_rotation_members: [
          ...([currentUserId].filter(Boolean).map((id, index) => ({
            member_type: 'User',
            member_id: id,
            position: index + 1
          }))),
          ...resolvedMemberIds.map((id, index) => ({
            member_type: 'User',
            member_id: id,
            position: index + 2
          }))
        ]
      });
    } catch (error) {
      printSummary('Rotation setup needs attention', [
        'The schedule exists, but the primary rotation was not created automatically.',
        `Rootly said: ${formatApiError(error)}`,
        'You can add the first rotation in Rootly and then continue.'
      ]);
    }
  }

  let escalationPolicy = null;
  try {
    escalationPolicy = await api.createEscalationPolicy({
      name: `${teamName} Default Escalation`,
      description: 'Default escalation policy created by Rootly Wizard',
      repeat_count: 1,
      group_ids: teamId ? [teamId] : [],
      service_ids: []
    });
  } catch (error) {
    printSummary('Escalation policy needs attention', [
      'The team exists, but the default escalation policy was not created.',
      `Rootly said: ${formatApiError(error)}`,
      'You can create the escalation policy in Rootly and then keep going.'
    ]);
  }

  const escalationPolicyId = escalationPolicy?.data?.id || escalationPolicy?.id || null;

  if (escalationPolicyId && scheduleId) {
    try {
      await api.request(`/v1/escalation_policies/${escalationPolicyId}/escalation_paths`, {
        method: 'POST',
        body: {
          data: {
            type: 'escalation_paths',
            attributes: {
              name: `${teamName} Default Path`,
              notification_type: 'audible',
              path_type: 'escalation',
              default: true,
              match_mode: 'match-all-rules',
              position: 1,
              repeat: false,
              initial_delay: 0,
              rules: [
                {
                  rule_type: 'alert_urgency',
                  urgency_ids: []
                }
              ]
            }
          }
        }
      });
    } catch (error) {
      printSummary('Escalation path needs attention', [
        'The escalation policy exists, but the first path was not created automatically.',
        `Rootly said: ${formatApiError(error)}`,
        'You can add the first path in Rootly if needed.'
      ]);
    }
  }

  let alertSourceSummary = 'not created';
  const alertSourceChoice = await choose('Create or connect an alert source?', [
    { label: 'Generic webhook' }
  ]);

  try {
    const sourcePayload = await api.createAlertSource({
      name: `${teamName} ${alertSourceChoice.label}`,
      source_type: 'webhook',
      owner_group_ids: teamId ? [teamId] : [],
      sourceable_attributes: {
        auto_resolve: false,
        accept_threaded_emails: false
      }
    });
    alertSourceSummary = sourcePayload?.data?.attributes?.webhook_endpoint || sourcePayload?.data?.attributes?.secret || 'connected';
  } catch (error) {
    alertSourceSummary = 'needs manual follow-up';
    printSummary('Alert source needs attention', [
      'The generic webhook source was not created automatically.',
      `Rootly said: ${formatApiError(error)}`,
      'You can connect the alert source in Rootly and then return for the paging test.'
    ]);
  }

  printSummary('What the wizard completed', buildHappyPathSummary([
    `Team: ${teamName}`,
    teamId ? `Team ID: ${teamId}` : null,
    `Matched existing users: ${resolvedMembers.map((user) => user.attributes?.email).join(', ') || 'none'}`,
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
  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

  if (state) {
    printStartupStatus(state);
  }

  const teamName = await ask('Team name', 'Payments');
  const description = await ask('Description', 'Created during Rootly setup');

  const confirm = await ask('Create this team now? (yes/no)', 'yes');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Team setup', ['No changes were made.']);
    return;
  }

  try {
    const payload = await api.createTeam({
      name: teamName,
      description,
      user_ids: [currentUserId].filter(Boolean),
      admin_ids: [currentUserId].filter(Boolean),
      auto_add_members_when_attached: true
    });

    printSummary('Team created', [
      `Team: ${teamName}`,
      `Team ID: ${extractTeamId(payload) || 'created'}`
    ]);
  } catch (error) {
    printSummary('Team setup needs attention', [
      'The wizard could not create the team.',
      `Rootly said: ${formatApiError(error)}`
    ]);
  }
}

async function addTeamMembersSetup() {
  heading('Add team members');
  const state = await loadOnboardingState();
  const api = await loadApiClient();

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

  const resolvedMembers = [];
  for (const email of emails) {
    const match = await api.findUserByEmail(email);
    if (match) {
      resolvedMembers.push(match);
    }
  }

  const resolvedMemberIds = resolvedMembers
    .map((user) => Number.parseInt(user.id, 10))
    .filter(Number.isFinite);

  const existingUserIds = team.memberCount
    ? (state?.teams?.all?.find((item) => item.id === team.id)?.userIds || [])
    : [];

  const confirm = await ask(`Add ${emails.join(', ')} to ${team.name}? (yes/no)`, 'yes');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Team members', ['No changes were made.']);
    return;
  }

  try {
    await api.updateTeam(team.id, {
      notify_emails: emails,
      user_ids: [...new Set([...existingUserIds, ...resolvedMemberIds])]
    });

    printSummary('Team members updated', [
      `Team: ${team.name}`,
      `Matched existing users: ${resolvedMembers.map((user) => user.attributes?.email).join(', ') || 'none'}`,
      `Requested emails: ${emails.join(', ')}`
    ]);
  } catch (error) {
    printSummary('Team members need attention', [
      'The wizard could not update team membership.',
      `Rootly said: ${formatApiError(error)}`
    ]);
  }
}

async function createScheduleSetup() {
  heading('Create a schedule');
  const state = await loadOnboardingState();
  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

  if (state) {
    printStartupStatus(state);
  }

  const team = await chooseTeamRecord(state, 'Which team should own this schedule?');
  if (!team) {
    return;
  }

  const name = await ask('Schedule name', `${team.name} On-Call`);
  const handoffTime = await ask('Daily handoff time (HH:MM)', '09:00');

  const confirm = await ask(`Create ${name} for ${team.name}? (yes/no)`, 'yes');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Schedule setup', ['No changes were made.']);
    return;
  }

  try {
    const createdSchedule = await api.createSchedule({
      name,
      description: `Primary schedule for ${team.name}`,
      all_time_coverage: true,
      owner_user_id: currentUserId,
      owner_group_ids: [team.id]
    });

    const scheduleId = createdSchedule?.data?.id || createdSchedule?.id;
    if (scheduleId) {
      await api.createScheduleRotation(scheduleId, {
        name: `${team.name} Primary Rotation`,
        schedule_rotationable_type: 'ScheduleDailyRotation',
        schedule_rotationable_attributes: { handoff_time: handoffTime },
        position: 1,
        active_all_week: true,
        time_zone: 'Etc/UTC',
        schedule_rotation_members: currentUserId ? [{
          member_type: 'User',
          member_id: currentUserId,
          position: 1
        }] : []
      });
    }

    printSummary('Schedule created', [
      `Team: ${team.name}`,
      `Schedule: ${name}`,
      scheduleId ? `Schedule ID: ${scheduleId}` : 'Schedule created'
    ]);
  } catch (error) {
    printSummary('Schedule setup needs attention', [
      'The wizard could not create the schedule.',
      `Rootly said: ${formatApiError(error)}`
    ]);
  }
}

async function createEscalationPolicySetup() {
  heading('Create an escalation policy');
  const state = await loadOnboardingState();
  const api = await loadApiClient();

  if (state) {
    printStartupStatus(state);
  }

  const team = await chooseTeamRecord(state, 'Which team should own this escalation policy?');
  if (!team) {
    return;
  }

  const name = await ask('Escalation policy name', `${team.name} Default Escalation`);
  const repeatCount = Number.parseInt(await ask('Repeat count', '1'), 10) || 1;

  const confirm = await ask(`Create ${name} for ${team.name}? (yes/no)`, 'yes');
  if (!confirm.toLowerCase().startsWith('y')) {
    printSummary('Escalation policy', ['No changes were made.']);
    return;
  }

  try {
    const payload = await api.createEscalationPolicy({
      name,
      description: `Default escalation policy for ${team.name}`,
      repeat_count: repeatCount,
      group_ids: [team.id],
      service_ids: []
    });

    printSummary('Escalation policy created', [
      `Team: ${team.name}`,
      `Policy: ${name}`,
      `Policy ID: ${payload?.data?.id || payload?.id || 'created'}`
    ]);
  } catch (error) {
    printSummary('Escalation policy needs attention', [
      'The wizard could not create the escalation policy.',
      `Rootly said: ${formatApiError(error)}`
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
  console.log('The wizard can set up a generic webhook source directly.');
  separator();
  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  const source = await choose('Which alert source are we setting up?', [
    { label: 'Generic webhook' }
  ]);
  const serviceName = state?.teams.hasAnyAlertingReadyTeam ? 'payments-api' : await ask('Service name', 'payments-api');

  printSummary('Monitor setup summary', [
    `Source: ${source.label}`,
    `Service: ${serviceName}`,
    'Next step: create the integration and run a test page'
  ]);
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
    { label: 'Opsgenie' }
  ]);

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
    { label: 'Use ROOTLY_TOKEN' }
  ]);

  const writeConfig = await ask('Should I write the MCP config file for you? (yes/no)', 'yes');
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

  printSummary('MCP setup summary', [
    `Clients: ${clients.map((client) => client.label).join(', ')}`,
    `Auth: ${tokenType.label}`,
    ...results.map((result) => `${result.client}: ${result.targetPath}`),
    ...results.filter((result) => result.backupPath).map((result) => `${result.client} backup: ${result.backupPath}`),
    'Config verified successfully for each selected client',
    'Next step: restart the client if needed and verify the connection'
  ]);
}

async function main() {
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

  const entry = process.argv[2];
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
    printSummary('Auth', [
      process.env.ROOTLY_TOKEN?.trim() ? 'Using ROOTLY_TOKEN from environment' : 'Stored token found in keychain',
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

  if (action === 'Review remaining setup') {
    await continueRecommendedSetup(state);
  } else if (action === 'Run guided setup') {
    await accountSetup();
  } else if (action === 'Check readiness') {
    await readinessFlow();
    } else if (action === 'View teams') {
      await teamsFlow();
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
    } else if (action === 'Connect vendor integration in Rootly web') {
      await vendorHandoffSetup();
    } else if (action === 'Disconnect') {
      await logoutFlow();
      break;
    } else if (action === 'Exit wizard') {
      break;
    } else {
      await mcpSetup();
    }

    separator();
  }

  rl.close();
}

main().catch((error) => {
  console.error(error);
  rl.close();
  process.exitCode = 1;
});
