#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
  console.log(question);
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option.label}`);
  });

  const raw = await rl.question('Select an option: ');
  const index = Number.parseInt(raw, 10) - 1;

  if (Number.isNaN(index) || index < 0 || index >= options.length) {
    return options[0];
  }

  return options[index];
}

function printSummary(title, items) {
  heading(title);
  items.forEach((item) => console.log(`- ${item}`));
  separator();
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

  const client = await choose('Which client do you want to configure?', [
    { label: 'Cursor' },
    { label: 'Claude Desktop' },
    { label: 'Claude Code' },
    { label: 'Windsurf' },
    { label: 'Codex' },
    { label: 'Gemini CLI' }
  ]);
  const tokenType = await choose('How will auth be provided?', [
    { label: 'Token now' },
    { label: 'OAuth later' }
  ]);

  printSummary('MCP setup plan', [
    `Client: ${client.label}`,
    `Auth: ${tokenType.label}`,
    'Next step: generate the correct config block and write it when safe'
  ]);
}

async function main() {
  heading('Rootly Wizard');
  console.log('A guided setup CLI for new and existing Rootly customers.');
  separator();

  const action = await choose('What would you like to do?', [
    { label: 'Account setup' },
    { label: 'Slack setup' },
    { label: 'Alert source setup' },
    { label: 'IDE / MCP setup' }
  ]);

  separator();

  if (action.label === 'Account setup') {
    await accountSetup();
  } else if (action.label === 'Slack setup') {
    await slackSetup();
  } else if (action.label === 'Alert source setup') {
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
