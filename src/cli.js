#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildHostedMcpPreview, getMcpConfigPath, writeHostedMcpConfig } from './mcp.js';
import { deleteToken, getStoredToken, storeToken, validateToken } from './auth.js';

const rl = readline.createInterface({ input, output });

const separator = () => console.log('');

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

async function logoutFlow() {
  const deleted = await deleteToken();
  printSummary('Logout', [
    deleted ? 'Stored token deleted from keychain' : 'No stored token found, or auth is being supplied by ROOTLY_TOKEN'
  ]);
}

async function accountSetup() {
  heading('Account setup');

  const teamName = await ask('Team name', 'Payments');
  const ownerEmail = await ask('Owner email', 'owner@company.com');
  const addMembers = await ask('Add more member emails now? (comma-separated, optional)', '');
  const createSchedule = await ask('Create an initial schedule now? (yes/no)', 'yes');
  const createEscalationPolicy = await ask('Create a default escalation policy now? (yes/no)', 'yes');

  const created = [
    `Team: ${teamName}`,
    `Owner: ${ownerEmail}`,
    addMembers ? `Invites: ${addMembers}` : null,
    createSchedule.toLowerCase().startsWith('y') ? 'Schedule: created with starter rotation defaults' : 'Schedule: skipped',
    createEscalationPolicy.toLowerCase().startsWith('y') ? 'Escalation policy: created with default Rootly flow' : 'Escalation policy: skipped'
  ].filter(Boolean);

  printSummary('What the wizard can do now', created);
}

async function slackSetup() {
  heading('Slack setup');

  const mode = await choose('How should Slack be connected?', [
    { label: 'OAuth connect' },
    { label: 'Paste workspace token / existing auth' }
  ]);
  const channel = await ask('Default incident channel', '#incidents');

  printSummary('Slack setup plan', [
    `Connection mode: ${mode.label}`,
    `Default channel: ${channel}`,
    'Next step: hand off to Rootly Slack auth / workspace binding'
  ]);
}

async function alertSourceSetup() {
  heading('Alert source setup');

  const source = await choose('Which alert source are we setting up?', [
    { label: 'Generic webhook' },
    { label: 'PagerDuty' },
    { label: 'Opsgenie' },
    { label: 'Datadog' }
  ]);
  const serviceName = await ask('Service name', 'payments-api');

  printSummary('Alert source plan', [
    `Source: ${source.label}`,
    `Service: ${serviceName}`,
    'Next step: create the integration and return the webhook / connect instructions'
  ]);
}

async function mcpSetup() {
  heading('IDE / MCP setup');
  console.log('This uses the hosted Rootly MCP server and writes config for supported clients only.');
  separator();

  const client = await choose('Which client do you want to configure?', [
    { label: 'Cursor' },
    { label: 'Claude Desktop' },
    { label: 'Windsurf' }
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

  printSummary('MCP setup plan', [
    `Client: ${client.label}`,
    `Auth: ${tokenType.label}`,
    `Config written to: ${targetPath}`,
    'Next step: restart the client if needed and verify the connection'
  ]);
}

async function main() {
  heading('Rootly Wizard');
  console.log('A guided onboarding CLI for new Rootly customers.');
  separator();

  const entry = process.argv[2];
  if (entry === 'logout' || entry === 'forget') {
    await logoutFlow();
    rl.close();
    return;
  }

  await authFlow();
  if (process.exitCode) {
    rl.close();
    return;
  }

  const action = await choose('What would you like to do?', [
    { label: 'Onboard a new customer' },
    { label: 'Connect Slack' },
    { label: 'Add an alert source' },
    { label: 'Set up MCP / IDE' }
  ]);

  separator();

  if (action.label === 'Onboard a new customer') {
    await accountSetup();
  } else if (action.label === 'Connect Slack') {
    await slackSetup();
  } else if (action.label === 'Add an alert source') {
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
