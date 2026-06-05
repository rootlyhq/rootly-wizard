# Ink Migration Plan

This wizard should migrate to Ink as a full interactive app, not as a hybrid nested inside the existing readline flow.

## Why

- The current interactive CLI mixes:
  - `console.log(...)`
  - manual ANSI redraws
  - readline key handling
- Partial Ink embedding proved brittle and caused premature exits.
- A full Ink app can own:
  - layout
  - input
  - scroll containment
  - screen transitions

## Non-goals

- Do not change `action` mode.
- Do not rewrite Rootly business logic inside the TUI.
- Do not remove the legacy interactive path until Ink reaches parity.

## New structure

- `src/tui/`
  - `components/`
  - `screens/`
  - `index.js`
- `src/tui-legacy-bridge.js`
  - small adapter layer for existing async logic

## Migration phases

1. **Scaffold**
   - app shell
   - menu list primitive
   - intro screen
   - main menu preview

2. **Read-only flow**
   - auth state display
   - startup status
   - inspect / readiness / teams / schedules / escalation lists

3. **Input flow**
   - text prompts
   - confirmations
   - team pickers
   - multi-select member pickers

4. **Mutation flow**
   - create team
   - add team members
   - create schedule
   - create escalation policy
   - alert source setup
   - verify flows

5. **Cutover** ✅ done
   - default interactive mode now routes to Ink (`startInteractiveWizard`)
   - `action` mode untouched
   - legacy ANSI renderer, readline flows, and the isolated `ink-preview`
     subcommand removed from `src/cli.js`
   - orphaned `src/ink-ui.js` deleted

## Current entrypoint

The default invocation launches the Ink app directly:

```bash
node ./src/cli.js
```

`cli.js` is now a thin entry: it dispatches `action <name>` to the
non-interactive action runner, `help` to usage text, and everything else
(in a TTY) to `startInteractiveWizard()`.

## Auth recovery

The Ink path loads onboarding state via `tui-legacy-bridge.js`. On failure it
classifies the error: a workspace-access failure (401/403 on
teams/schedules/escalation policies) routes to the `auth-recovery` screen,
which clears the stored token and sends the user back to sign-in (the legacy
OAuth-can't-read-workspace recovery, ported). Any other error routes to the
LoadFailed screen.
