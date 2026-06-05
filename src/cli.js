#!/usr/bin/env node

import { startInteractiveWizard } from './tui/index.js';
import {
  ACTIONS,
  buildActionCatalog,
  buildToolSpecs,
  describeAction,
  toStructuredError,
  validateInput
} from './actions/registry.js';

function emitAction(result) {
  console.log(JSON.stringify(result, null, 2));
}

function agentQuickstart() {
  return {
    ok: true,
    summary: 'Rootly Wizard agent interface.',
    data: {
      usage: 'rootly-wizard action <name> [json]',
      conventions: [
        'Input is a single JSON object as the last argument; output is one JSON object on stdout.',
        'Success: { ok:true, summary, data }. Failure: { ok:false, code, error, field?, retryable }.',
        'Auth: set ROOTLY_TOKEN to an organization admin Rootly API key.',
        'Add "dryRun": true to any mutating action to preview without executing.'
      ],
      discover: {
        list: 'rootly-wizard action list',
        describe: 'rootly-wizard action describe <name>',
        tools: 'rootly-wizard action tools'
      },
      examples: [
        'rootly-wizard action get-recommended-next-step',
        'rootly-wizard action list-services',
        'rootly-wizard action run-guided-setup \'{"teamName":"Payments"}\''
      ]
    }
  };
}

async function runActionCommand() {
  const actionName = process.argv[3];
  const rawInput = process.argv[4];

  if (!actionName || actionName === 'help') {
    emitAction(agentQuickstart());
    return;
  }

  if (actionName === 'list') {
    emitAction({ ok: true, summary: 'Available actions.', data: { actions: buildActionCatalog() } });
    return;
  }

  if (actionName === 'tools') {
    emitAction({ ok: true, summary: 'Function-calling tool definitions.', data: { tools: buildToolSpecs() } });
    return;
  }

  if (actionName === 'describe') {
    const described = describeAction(rawInput);
    if (!described) {
      emitAction({
        ok: false,
        code: 'UNKNOWN_ACTION',
        summary: `Unknown action: ${rawInput || '(missing)'}`,
        data: { actions: Object.keys(ACTIONS) }
      });
      return;
    }
    emitAction({ ok: true, summary: `Schema for ${rawInput}.`, data: described });
    return;
  }

  const entry = ACTIONS[actionName];
  if (!entry) {
    emitAction({
      ok: false,
      code: 'UNKNOWN_ACTION',
      summary: `Unknown action: ${actionName || '(missing)'}`,
      data: {
        actions: Object.keys(ACTIONS),
        hint: 'Run `action list` for descriptions or `action describe <name>` for input schema.'
      }
    });
    return;
  }

  let inputPayload;
  try {
    inputPayload = rawInput ? JSON.parse(rawInput) : {};
  } catch {
    emitAction({
      ok: false,
      code: 'BAD_INPUT',
      summary: `Could not parse input for ${actionName}.`,
      error: 'The input argument was not valid JSON.',
      data: null
    });
    return;
  }

  const invalid = validateInput(entry.input, inputPayload);
  if (invalid) {
    emitAction({
      ok: false,
      code: 'VALIDATION',
      summary: `Invalid input for ${actionName}.`,
      field: invalid.field,
      error: invalid.message,
      retryable: false,
      data: null
    });
    return;
  }

  if (entry.mutates && inputPayload.dryRun === true) {
    const { dryRun, ...input } = inputPayload;
    emitAction({
      ok: true,
      code: 'DRY_RUN',
      summary: `Dry run: ${actionName} was not executed.`,
      data: { action: actionName, mutates: true, input }
    });
    return;
  }

  try {
    emitAction(await entry.handler(inputPayload));
  } catch (error) {
    emitAction(toStructuredError(actionName, error));
  }
}

function printHelp() {
  console.log('Rootly Wizard');
  console.log('A guided onboarding CLI for getting Rootly operational quickly.');
  console.log('');
  console.log('Usage:');
  console.log('  rootly-wizard                        Start the interactive guided setup');
  console.log('  rootly-wizard action <name> [json]   Run a single action non-interactively (JSON in/out)');
  console.log('  rootly-wizard action list            List available actions (JSON)');
  console.log('  rootly-wizard action describe <name> Show an action input schema (JSON)');
  console.log('  rootly-wizard action tools           Emit function-calling tool defs (JSON)');
  console.log('  rootly-wizard action help            Agent quickstart (JSON)');
  console.log('  rootly-wizard help                   Show this help');
  console.log('');
  console.log('The interactive wizard handles sign-in, status, inspect, setup, integrations,');
  console.log('verify, MCP setup, and disconnect from a single menu.');
  console.log('Preferred run path: `rootly-wizard` or `npx @rootly/wizard` once published.');
  console.log('Local development: `node ./src/cli.js`.');
  console.log('Auth: set ROOTLY_TOKEN, or sign in on first run (browser or API key).');
  console.log('Agents: see AGENTS.md. Pass {"dryRun": true} to any mutating action to preview.');
}

function formatTopLevelError(error) {
  const message = error?.message || String(error);

  if (/\b401\b/.test(message)) {
    return 'Rootly rejected the token (401). Disconnect from the wizard menu, then sign in again.';
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
    return;
  }

  if (entry === 'help' || entry === '--help' || entry === '-h') {
    printHelp();
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('An interactive terminal is required. Run this in a normal shell session.');
    process.exitCode = 1;
    return;
  }

  await startInteractiveWizard();
}

main().catch((error) => {
  console.error(formatTopLevelError(error));
  process.exitCode = 1;
});
