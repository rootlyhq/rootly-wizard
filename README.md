# Rootly Wizard

Rootly Wizard is a CLI for accelerating Rootly setup.

The initial goal is to help new customers get operational quickly without needing to understand every Rootly setup surface up front. This is primarily a new customer onboarding flow. Over time, the same tool can support expansion tasks for existing customers, such as adding a new team, connecting another integration, or configuring Rootly MCP for engineers.

## Why this exists

Rootly setup can require a series of product, integration, and configuration decisions that are easy to understand in isolation but harder to assemble into a complete, working setup.

This project aims to provide a guided setup flow that:

- reduces onboarding friction for new customers
- gives Sales and Solutions a simple activation path during trials
- helps customers move through common integrations without navigating Rootly blindly
- creates a foundation for repeatable setup and expansion workflows

The intended experience is:

```bash
npx @rootly/wizard
```

Then follow a guided flow to complete the next meaningful setup task.

## Running the wizard

Preferred entrypoints:

```bash
npx @rootly/wizard
```

For local development from this repo:

```bash
node ./src/cli.js
```

Avoid using `npm start` in demos or user-facing docs, because npm echoes the underlying script command before launching the wizard.

## Product thesis

Rootly Wizard should be a guided onboarding and expansion tool, not a general replacement for the Rootly UI.

It should be especially useful in the following situations:

- right after a new customer signs up
- when a team is setting up incident management for the first time
- when an existing customer wants to add a new team or integration quickly
- when a technical user wants procedural MCP / IDE setup

For MVP, the wizard should optimize for fast time-to-value:

- create sensible defaults
- reduce product decision fatigue
- prefer deterministic API-backed setup where available
- use explicit Rootly web handoffs where integrations still live behind the app

## Goals

- help a newly signed-up customer get to a usable Rootly setup quickly
- guide users through a recommended setup sequence
- encode Rootly best practices into the setup flow
- support procedural integration setup where CLI is faster than the UI
- create a reusable setup surface for onboarding and expansion

## Target users

### Primary

- newly signed-up startup customers
- technical champions evaluating Rootly during onboarding or trial
- Sales / Solutions / Customer Success teammates helping customers get set up

### Secondary

- existing customers adding teams or integrations
- engineers configuring MCP access for their IDE or agent environment

## MVP scope

The MVP should focus on a narrow set of high-value setup tasks.

### In scope

- guided account setup
- Slack handoff and resume flow
- generic webhook alert source setup
- alert verification / test paging
- MCP / IDE configuration
- status / doctor summary with recommended next step

### Out of scope for MVP

- workflows
- long-tail integrations
- complex migration flows
- enterprise rollout orchestration

## Recommended setup flow

For brand-new customers, the wizard should guide users through a recommended sequence instead of dropping them into raw configuration choices.

Suggested flow:

1. Sign up / authenticate
2. Complete workspace setup
3. Set up the first group and schedule
4. Create an escalation policy with Rootly defaults
5. Hook up a generic webhook alert source
6. Test page
7. Hand off to Rootly web for Slack connection
8. Create a test incident
9. Optionally configure MCP / IDE integration

This ordering is based on the assumption that many startups:

- do not yet know what a good schedule structure looks like
- want best-practice guidance
- care most about becoming operational quickly

For the onboarding MVP, the flow breaks into two tracks:

- Alerts: sign up, invite team members, set up on-call, create escalation policy, hook up generic webhook, test page
- Incidents: connect Slack, create a test incident

## User experience principles

- CLI-first, fast, and low-friction
- opinionated defaults with clear escape hatches
- procedural and guided rather than open-ended
- deterministic setup actions wherever possible
- useful both during trial and after purchase

The CLI should feel safe for a startup audience. Token-based auth is acceptable for MVP. OAuth should be used where it materially improves setup, especially for Slack. For the onboarding MVP, the wizard assumes an admin org-wide Rootly API key so it can complete setup without permission gaps.

## Technical approach

The current implementation direction is:

- CLI frontend for user interaction
- Rootly APIs for the setup objects they already expose
- state detection to understand what is already configured
- selective automation for local configuration tasks like MCP setup
- explicit handoff back into the Rootly web app for integrations that do not have supported external APIs

The guiding principle is:

- AI-guided, API-executed

That means the CLI may eventually use AI for recommendations, explanations, and intent shaping, but the core setup steps should remain deterministic and backed by Rootly APIs or existing Rootly setup services.

## Integration priorities

### MVP priorities

- Slack handoff / resume
- generic webhook alert source setup
- MCP / IDE setup
- startup status / doctor flow

### Notes

- Slack and vendor integrations should use the existing Rootly web flow until supported APIs exist
- MCP setup uses the hosted Rootly MCP server and can write config files for supported clients
- Supported MCP clients in the current MVP: Cursor, Claude Code, Claude Desktop, Windsurf, Codex
- Rootly auth can come from a stored token or `ROOTLY_TOKEN`
- Vendor-specific alert sources stay out of the wizard until we have full support for them
- workflows should be excluded from MVP because they add too much complexity
