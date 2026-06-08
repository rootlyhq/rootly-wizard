# Rootly Wizard

Get your Rootly workspace from empty to incident-ready in minutes — without clicking through every setup screen.

Rootly Wizard is a guided command-line setup tool. It walks you through creating a team, putting people on call, wiring up escalation and alerting, and firing a real test alert and incident so you can see the whole flow end to end.

```bash
npx @rootly/wizard
```

## Requirements

- **Node.js 18 or newer**
- A **Rootly API token** (see [Authorizing](#authorizing) below)
- A terminal (macOS, Linux, or Windows)

## Quick start

Run the wizard:

```bash
npx @rootly/wizard
```

You'll be asked to authorize with a Rootly API token (stored securely in your OS keychain), then land on the main menu:

- **Quick start** — set everything up at once and see a test alert + incident
- **Recommended setup** — do the single next best step, guided
- **General setup** — pick any individual task (teams, on-call, integrations, and more)

That's it. Your token is remembered, so the next run takes you straight to the menu.

## Authorizing

The wizard authorizes with a **Rootly API token**. To create one:

1. Log in to Rootly.
2. Go to **Organization Settings → API Keys**.
3. Click **Generate New API Key**, name it, and copy the token.

**Which key type?** Use a **Global** key with write access (teams, schedules, escalation, alerts, incidents) so the wizard can complete setup, or a **Personal** key if your account can already manage those.

Docs: <https://docs.rootly.com/api-reference/overview>

Your token is stored in your operating system's keychain. You can also provide it via the `ROOTLY_TOKEN` environment variable:

```bash
ROOTLY_TOKEN=rootly_xxx npx @rootly/wizard
```

On exit, the wizard asks whether to keep the saved token or delete it from your keychain (it keeps it by default).

## What you can do

### Quick start

The fastest path. In one flow it will:

1. Create a team (or reuse one you're already on)
2. Let you pick who joins the team and the on-call rotation
3. Create an on-call schedule
4. Create an escalation policy
5. Add an alert source
6. Fire a **test alert**
7. Open a **test incident** (with a link to its Slack channel, if Slack is connected)

Anything that already exists is reused, so it's safe to re-run.

### Recommended setup

Prefer to go one step at a time? Recommended setup looks at your workspace and runs the single most useful next step — create a team, add members, set up a schedule, add an escalation policy, or connect an alert source — and returns you to the menu.

### General setup

Jump to any individual task:

- **Teams & members** — create teams, add members from your directory
- **On-call** — schedules and escalation policies
- **Integrations** — Slack and alert source handoffs
- **Verify** — send a test alert or create a test incident
- **Inspect** — review your current teams, schedules, and coverage
- **MCP / IDE** — configure the Rootly MCP server for your editor or AI agent

### MCP / IDE setup

The wizard can write Rootly MCP server config for supported clients: **Cursor, Claude Code, Claude Desktop, Windsurf, and Codex**.

## Scripting (advanced)

Every setup step is also available non-interactively as a JSON-in/JSON-out action — handy for automation or AI agents:

```bash
rootly-wizard action list                 # list available actions
rootly-wizard action describe <name>      # show an action's inputs
rootly-wizard action get-recommended-next-step
rootly-wizard action one-shot-setup '{"teamName":"Payments"}'
```

Add `"dryRun": true` to any setup action to preview it without making changes.

## Troubleshooting

- **"Authorize with a Rootly API token" keeps appearing** — your token may be missing or invalid. Generate a fresh key (Organization Settings → API Keys) and re-enter it.
- **Setup steps are skipped or blocked** — the token needs write access. Use a Global key with the relevant permissions.
- **Nothing happens / wrong screen** — make sure you're on Node.js 18+ and running in an interactive terminal.

## Development

From a clone of this repo:

```bash
node ./src/cli.js     # run the wizard locally
npm test              # run the test suite
```

(Use `node ./src/cli.js` rather than `npm start` for demos — `npm start` echoes the underlying command before launching.)
