# Agent guide

Rootly Wizard exposes a non-interactive, JSON-in / JSON-out command built for agents. The interactive wizard (`rootly-wizard` with no args) requires a TTY; agents should use the `action` subcommand instead.

## Entry point

```
rootly-wizard action <name> [json]
```

From a checkout (not installed globally): `node ./src/cli.js action <name> [json]`.

- **Input**: a single JSON object as the last argument.
- **Output**: exactly one JSON object printed to stdout.
- **Auth**: set `ROOTLY_TOKEN` to an organization admin Rootly API key. No token is needed for `list` / `describe` / `tools` / `help`.

## Discover what's available

```
rootly-wizard action list             # catalog: name, mutates, description
rootly-wizard action describe <name>  # input schema for one action
rootly-wizard action tools            # all actions as function-calling tool defs
rootly-wizard action help             # this quickstart, as JSON
```

`list` / `describe` / `tools` are the source of truth — read them at runtime instead of hardcoding the action set.

## Response envelope

Success:

```json
{ "ok": true, "summary": "...", "data": { } }
```

Failure:

```json
{ "ok": false, "code": "VALIDATION", "summary": "...", "error": "...", "field": "name", "retryable": false }
```

Branch on `code`. Possible codes: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TIMEOUT`, `ACTION_FAILED`, `BAD_INPUT`, `UNKNOWN_ACTION`, plus `DRY_RUN`/`NO_AUTH`/`GUIDED_SETUP_FAILED`. `field` points at the offending input when known; `retryable` is true for timeouts and 5xx.

## Safety: preview before mutating

Add `"dryRun": true` to any mutating action to validate and echo the call without executing it:

```
rootly-wizard action create-team '{"name":"Payments","dryRun":true}'
# -> { "ok": true, "code": "DRY_RUN", "data": { "action": "create-team", "input": { "name": "Payments" } } }
```

## Resolving IDs

Mutating actions take IDs (`teamId`, `serviceIds`, `severityId`, ...). Resolve names to IDs with the read actions, which return `{id, name}` (or `{id, email}` for users):

```
list-teams  list-services  list-severities  list-environments  list-incident-types  list-users
```

## Typical flow

```
rootly-wizard action get-recommended-next-step
rootly-wizard action run-guided-setup '{"teamName":"Payments"}'
```

`run-guided-setup` creates team + schedule + escalation policy (+ default path) + generic webhook in one call and returns a per-step report. Or do it step by step: `create-team` → `create-schedule` → `create-escalation-policy` → `create-alert-source`.

## Wiring into a tool-using agent

`action tools` emits Anthropic/OpenAI-compatible tool definitions: each has `name` (identical to the action name), `description`, and a JSON Schema `input_schema`. Register them, then map a tool call `name(args)` to:

```
rootly-wizard action <name> '<args-as-json>'
```

and parse the JSON object from stdout. (If your agent already has tools named like `list-teams`, namespace these on your side to avoid collisions.)
