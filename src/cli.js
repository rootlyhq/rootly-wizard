#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildHostedMcpPreview, getMcpConfigPath, verifyHostedMcpConfig, writeHostedMcpConfig } from './mcp.js';
import { deleteToken, getStoredToken, storeToken, validateToken } from './auth.js';
import { RootlyApiClient } from './rootly-api.js';
import { detectOnboardingState } from './detect-state.js';

const rl = readline.createInterface({ input, output });
const LOGO_ART = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⢠⣤⣄⡀⠐⣿⣿⠇⢀⣠⣤⡄⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣿⣿⠀⠈⠁⠀⣿⣿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠠⣶⣶⣦⡀⠀⠀⣼⣧⠀⠀⢀⣴⣶⣶⡆⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠈⠛⠛⠁⠀⠀⢿⣿⠃⠀⠈⠛⠛⠉⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⢰⣶⣶⣶⣶⣶⣦⣄⠀⠀⣠⣤⣶⣶⣶⣶⣶⡆⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠈⠉⠀⠀⠈⠉⠛⢿⣷⣾⡿⠛⠉⠁⠀⠀⠈⠁⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠿⠿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀'
].join('\n');

const separator = () => console.log('');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SHIMMER_COLORS = ['\u001b[38;5;255m', '\u001b[38;5;252m', '\u001b[38;5;250m'];
const RESET = '\u001b[0m';

function colorizeLogo(frame) {
  const lines = LOGO_ART.split('\n');

  return lines
    .map((line, lineIndex) => {
      if (!line.trim()) {
        return '';
      }

      const color = SHIMMER_COLORS[(lineIndex + frame) % SHIMMER_COLORS.length];
      return `${color}${line}${RESET}`;
    })
    .join('\n');
}

async function printLogo() {
  if (!output.isTTY) {
    console.log(LOGO_ART);
    separator();
    return;
  }

  for (let frame = 0; frame < 3; frame += 1) {
    process.stdout.write('\u001b[H\u001b[2J\u001b[3J');
    console.log(colorizeLogo(frame));
    await sleep(80);
  }

  separator();
}

function heading(text) {
  console.log(text);
  console.log('-'.repeat(text.length));
}

async function ask(question, defaultValue = '') {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || defaultValue;
}

async function choose(question, options) {
  while (true) {
    console.log(question);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option.label}`);
    });

    const raw = await rl.question('Select an option: ');
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
  items.forEach((item) => console.log(`- ${item}`));
  separator();
}

function printOnboardingState(state) {
  printSummary('Onboarding state', [
    `User: ${state.user.name || state.user.email || 'Unknown'}`,
    `Teams: ${state.teams.total}`,
    `Team membership: ${state.teams.hasAnyTeamMembership ? 'yes' : 'no'}`,
    `Slack connected: ${state.user.slackConnected ? 'yes' : 'no'}`,
    `Schedules present: ${state.teams.hasAnySchedules ? 'yes' : 'no'}`,
    `Escalation policies present: ${state.teams.hasAnyEscalationPolicies ? 'yes' : 'no'}`,
    `Alerting-ready teams: ${state.teams.hasAnyAlertingReadyTeam ? 'yes' : 'no'}`,
    `Next best action: ${state.onboarding.nextBestAction}`
  ]);

  printSummary('Readiness', [
    `Workspace setup: ${state.onboarding.readiness.workspaceSetup}`,
    `Group setup: ${state.onboarding.readiness.groupSetup}`,
    `Alerting setup: ${state.onboarding.readiness.alertingSetup}`,
    `Incident setup: ${state.onboarding.readiness.incidentSetup}`
  ]);

  printSummary('Step status', [
    `Create team: ${state.onboarding.steps.createTeam}`,
    `Invite team members: ${state.onboarding.steps.inviteTeamMembers}`,
    `Create schedule: ${state.onboarding.steps.createSchedule}`,
    `Create escalation policy: ${state.onboarding.steps.createEscalationPolicy}`,
    `Hook up monitor: ${state.onboarding.steps.hookUpMonitor}`,
    `Connect Slack: ${state.onboarding.steps.connectSlack}`,
    `Test page: ${state.onboarding.steps.testPage}`,
    `Test incident: ${state.onboarding.steps.createTestIncident}`
  ]);
}

function printDoctorSummary(state) {
  printSummary('Doctor', [
    state.onboarding.completed ? 'Setup looks healthy enough to start using Rootly.' : 'Setup is still incomplete.',
    `Next best action: ${state.onboarding.nextBestAction}`,
    state.onboarding.steps.createTeam === 'needed' ? 'Create the first workspace-level team container.' : null,
    state.onboarding.steps.inviteTeamMembers === 'needed' ? 'Attach at least one member to the current workspace.' : null,
    state.onboarding.steps.createSchedule === 'needed' ? 'Create a first on-call schedule.' : null,
    state.onboarding.steps.createEscalationPolicy === 'needed' ? 'Create an escalation policy for responders.' : null,
    state.onboarding.steps.hookUpMonitor === 'needed' ? 'Connect a generic webhook alert source.' : null,
    state.onboarding.steps.connectSlack === 'needed' ? 'Connect Slack before testing incident collaboration.' : null
  ].filter(Boolean));
}

function printStartupStatus(state) {
  printSummary('Rootly status', [
    `Workspace setup: ${state.onboarding.readiness.workspaceSetup}`,
    `Group setup: ${state.onboarding.readiness.groupSetup}`,
    `Alerting setup: ${state.onboarding.readiness.alertingSetup}`,
    `Incident setup: ${state.onboarding.readiness.incidentSetup}`,
    `Next best action: ${state.onboarding.nextBestAction}`
  ]);
}

function recommendedActionLabel(state) {
  switch (state?.onboarding.nextBestAction) {
    case 'create-team':
    case 'invite-team-members':
    case 'create-schedule':
    case 'create-escalation-policy':
      return 'Onboard a new customer';
    case 'hook-up-monitor':
      return 'Hook up a monitor';
    case 'connect-slack':
    case 'create-test-incident':
      return 'Connect Slack for incidents';
    default:
      return 'Onboard a new customer';
  }
}

async function authFlow() {
  heading('Rootly auth');
  console.log('This wizard is primarily for new customer onboarding and assumes an admin org-wide Rootly API key.');
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

  const token = await ask('Paste your admin org-wide Rootly API key');
  const baseUrl = await ask('Rootly API base URL', 'https://api.rootly.com');

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
  const token = process.env.ROOTLY_TOKEN?.trim() || (await getStoredToken());
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

  printOnboardingState(state);
}

async function doctorFlow() {
  const state = await loadOnboardingState();
  if (!state) {
    printSummary('Doctor', ['No auth context found. Authenticate first to inspect onboarding readiness.']);
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

async function runWorkspaceSetup(state) {
  const token = process.env.ROOTLY_TOKEN?.trim() || (await getStoredToken());
  if (!token) {
    throw new Error('Rootly auth is required before running onboarding mutations');
  }

  const api = new RootlyApiClient(token);
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);
  const currentUserEmail = currentUser?.data?.attributes?.email || null;

  const teamName = state?.onboarding.steps.createTeam === 'needed'
    ? await ask('Team name', 'Payments')
    : 'Rootly team';
  const ownerEmail = state?.onboarding.steps.createTeam === 'needed'
    ? await ask('Primary admin email', currentUserEmail || 'owner@company.com')
    : currentUserEmail || 'owner@company.com';
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

  const teamPayload = await api.createTeam({
    name: teamName,
    description: `Created by Rootly Wizard for ${ownerEmail}`,
    notify_emails: memberEmails,
    user_ids: [currentUserId, ...resolvedMemberIds].filter(Boolean),
    admin_ids: [currentUserId].filter(Boolean),
    alerts_email_enabled: true,
    incident_broadcast_enabled: true,
    auto_add_members_when_attached: true
  });

  const teamId = extractTeamId(teamPayload);

  const createdSchedule = await api.createSchedule({
    name: `${teamName} On-Call`,
    description: 'Primary on-call rotation created by Rootly Wizard',
    all_time_coverage: true,
    owner_user_id: currentUserId,
    owner_group_ids: teamId ? [teamId] : []
  });

  const scheduleId = createdSchedule?.data?.id || createdSchedule?.id || null;
  if (scheduleId) {
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
  }

  const escalationPolicy = await api.createEscalationPolicy({
    name: `${teamName} Default Escalation`,
    description: 'Default escalation policy created by Rootly Wizard',
    repeat_count: 1,
    group_ids: teamId ? [teamId] : [],
    service_ids: []
  });

  const escalationPolicyId = escalationPolicy?.data?.id || escalationPolicy?.id || null;

  if (escalationPolicyId && scheduleId) {
    try {
      const escalationPathPayload = await api.request(`/v1/escalation_policies/${escalationPolicyId}/escalation_paths`, {
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

      void escalationPathPayload;
    } catch (error) {
      console.log(`Could not create escalation path automatically: ${error.message}`);
    }
  }

  let alertSourceSummary = 'skipped';
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
    alertSourceSummary = `manual follow-up needed (${error.message})`;
  }

  printSummary('Created objects', buildHappyPathSummary([
    `Team: ${teamName}`,
    teamId ? `Team ID: ${teamId}` : null,
    `Resolved member emails: ${resolvedMembers.map((user) => user.attributes?.email).join(', ') || 'none'}`,
    scheduleId ? `Schedule: ${scheduleId}` : 'Schedule: not created',
    escalationPolicyId ? `Escalation policy: ${escalationPolicyId}` : 'Escalation policy: not created',
    `Alert source: ${alertSourceSummary}`
  ]));

  printSummary('Slack', [
    'Slack OAuth is still the handoff step.',
    'Use the existing Rootly Slack install flow to connect the workspace, then come back to wire incident channels.'
  ]);
}

async function runGroupSetup(state) {
  printSummary('Group setup', [
    state?.onboarding.steps.inviteTeamMembers === 'needed' ? 'Invite members and map them to the workspace.' : 'Member mapping already looks present.',
    state?.onboarding.steps.createSchedule === 'needed' ? 'Create the first on-call schedule next.' : 'A schedule already exists for the current scope.',
    state?.onboarding.steps.createEscalationPolicy === 'needed' ? 'Create an escalation policy for the new group.' : 'An escalation policy already exists for the current scope.'
  ]);
}

async function runAlertingSetup(state) {
  printSummary('Alerting setup', [
    state?.onboarding.steps.hookUpMonitor === 'needed'
      ? 'Generic webhook is the only fully supported alert source in the wizard right now.'
      : 'Alerting looks partially configured already.',
    state?.onboarding.steps.testPage === 'blocked'
      ? 'Test paging stays blocked until the generic webhook path is in place.'
      : 'You can test paging after connecting the alert source.'
  ]);
}

async function runIncidentSetup(state) {
  printSummary('Incident setup', [
    state?.onboarding.steps.connectSlack === 'needed'
      ? 'Slack still needs the existing Rootly OAuth handoff.'
      : 'Slack looks connected already.',
    state?.onboarding.steps.createTestIncident === 'blocked'
      ? 'A test incident should wait until Slack is connected.'
      : 'A test incident is the right final smoke test.'
  ]);
}

async function runOnboarding(state) {
  await runWorkspaceSetup(state);
  await runGroupSetup(state);
  await runAlertingSetup(state);
  await runIncidentSetup(state);
}

async function accountSetup() {
  heading('Onboard a new customer');
  console.log('Workspace setup, group setup, alerting setup, then incident setup.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  await runOnboarding(state);
}

async function slackSetup() {
  heading('Connect Slack for incidents');
  console.log('Incidents track: connect Slack, then create a test incident.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  const mode = await choose('How should Slack be connected?', [
    { label: 'OAuth connect' },
    { label: 'Paste workspace token / existing auth' }
  ]);
  const channel = state?.user.slackConnected ? '#incidents' : await ask('Default incident channel', '#incidents');
  const testIncident = state?.onboarding.steps.createTestIncident === 'blocked'
    ? 'no'
    : await ask('Create a test incident after Slack is connected? (yes/no)', 'yes');

  printSummary('Incidents track summary', [
    `Connection mode: ${mode.label}`,
    `Default channel: ${channel}`,
    state?.user.slackConnected ? 'Slack: already connected' : 'Slack: connect via Rootly workspace binding',
    testIncident.toLowerCase().startsWith('y') ? 'Test incident: requested' : 'Test incident: skipped',
    'Next step: hand off to Rootly Slack auth / workspace binding'
  ]);
}

async function alertSourceSetup() {
  heading('Hook up a monitor');
  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  const source = await choose('Which alert source are we setting up?', [
    { label: 'Generic webhook' }
  ]);
  const serviceName = state?.teams.hasAnyAlertingReadyTeam ? 'payments-api' : await ask('Service name', 'payments-api');

  printSummary('Monitor setup plan', [
    `Source: ${source.label}`,
    `Service: ${serviceName}`,
    'Next step: create the integration and run a test page'
  ]);
}

async function mcpSetup() {
  heading('IDE / MCP setup');
  console.log('This uses the hosted Rootly MCP server and writes config for supported clients only.');
  separator();

  const state = await loadOnboardingState();
  if (state) {
    printOnboardingState(state);
  }

  const client = await choose('Which client do you want to configure?', [
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
  const preview = buildHostedMcpPreview(client.label, tokenType.label);

  console.log(preview);
  separator();

  if (!writeConfig.toLowerCase().startsWith('y')) {
    printSummary('MCP setup plan', [
      `Client: ${client.label}`,
      `Config path: ${getMcpConfigPath(client.label)}`,
      'Next step: copy the config into place or rerun and let the wizard write it'
    ]);
    return;
  }

  const token = await getStoredToken();
  if (!token) {
    printSummary('MCP setup blocked', [
      'No stored Rootly token was found',
      'Authenticate first, or provide ROOTLY_TOKEN in the environment'
    ]);
    return;
  }

  const targetPath = await writeHostedMcpConfig(client.label, token);
  await verifyHostedMcpConfig(client.label);

  printSummary('MCP setup plan', [
    `Client: ${client.label}`,
    `Auth: ${tokenType.label}`,
    `Config written to: ${targetPath}`,
    'Config verified successfully',
    'Next step: restart the client if needed and verify the connection'
  ]);
}

async function main() {
  await printLogo();
  heading('Rootly Wizard');
  console.log('A guided onboarding CLI for new Rootly customers.');
  separator();

  if (!input.isTTY || !output.isTTY) {
    console.log('An interactive terminal is required. Run this in a normal shell session.');
    process.exitCode = 1;
    rl.close();
    return;
  }

  const entry = process.argv[2];
  if (entry === 'logout' || entry === 'forget') {
    await logoutFlow();
    rl.close();
    return;
  }

  if (entry === 'status') {
    await statusFlow();
    rl.close();
    return;
  }

  if (entry === 'doctor') {
    await doctorFlow();
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

  const state = await loadOnboardingState();
  if (state) {
    console.log('Checking your Rootly setup...');
    separator();
    printStartupStatus(state);
  }

  const actions = [];
  const recommended = state ? recommendedActionLabel(state) : 'Onboard a new customer';
  actions.push({ label: `Continue recommended setup (${recommended})`, action: recommended });
  actions.push({ label: 'Check status / doctor', action: 'Check status / doctor' });

  for (const option of ['Onboard a new customer', 'Connect Slack for incidents', 'Hook up a monitor', 'Set up MCP / IDE']) {
    if (option !== recommended) {
      actions.push({ label: option, action: option });
    }
  }

  const action = await choose('What would you like to do?', actions);

  separator();

  if (action.action === 'Onboard a new customer') {
    await accountSetup();
  } else if (action.action === 'Check status / doctor') {
    await doctorFlow();
  } else if (action.action === 'Connect Slack for incidents') {
    await slackSetup();
  } else if (action.action === 'Hook up a monitor') {
    await alertSourceSetup();
  } else {
    await mcpSetup();
  }

  rl.close();
}

main().catch((error) => {
  console.error(error);
  rl.close();
  process.exitCode = 1;
});
