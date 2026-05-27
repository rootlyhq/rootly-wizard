import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOnboardingState } from '../src/detect-state.js';

function user({ teamIds = [], currentTeamId = null, slackId = null, email = 'admin@example.com', name = 'Admin' } = {}) {
  return {
    data: {
      id: 'u1',
      attributes: { email, full_name: name, slack_id: slackId },
      relationships: {
        teams: { data: teamIds.map((id) => ({ id })) },
        current_team: currentTeamId ? { data: { id: currentTeamId } } : { data: null }
      }
    }
  };
}

function team({ id, name = `Team ${id}`, users = [], schedules = [], escalationPolicies = [], attributes = {} }) {
  return {
    id,
    attributes: { name, slug: name.toLowerCase(), ...attributes },
    relationships: {
      users: { data: users.map((uid) => ({ id: uid })) },
      schedules: { data: schedules.map((sid) => ({ id: sid })) },
      escalation_policies: { data: escalationPolicies.map((eid) => ({ id: eid })) }
    }
  };
}

function build({ teams = [], schedules = [], escalationPolicies = [], userOpts = {} } = {}) {
  return detectOnboardingState({
    userPayload: user(userOpts),
    teamsPayload: { data: teams },
    schedulesPayload: { data: schedules },
    escalationPoliciesPayload: { data: escalationPolicies }
  });
}

test('empty workspace recommends creating a team', () => {
  const state = build();
  assert.equal(state.onboarding.nextBestAction, 'create-team');
  assert.equal(state.onboarding.steps.createTeam, 'needed');
  assert.equal(state.onboarding.readiness.workspaceSetup, 'needed');
  assert.equal(state.teams.total, 0);
});

test('team without members recommends inviting members', () => {
  const state = build({ teams: [team({ id: '1' })] });
  assert.equal(state.onboarding.nextBestAction, 'invite-team-members');
  assert.equal(state.onboarding.steps.createTeam, 'done');
  assert.equal(state.onboarding.steps.inviteTeamMembers, 'needed');
  assert.equal(state.onboarding.readiness.workspaceSetup, 'done');
});

test('team with members but no schedule recommends a schedule', () => {
  const state = build({ teams: [team({ id: '1', users: ['u1'] })] });
  assert.equal(state.onboarding.nextBestAction, 'create-schedule');
  assert.equal(state.teams.teamsWithMembers, 1);
});

test('team with a schedule but no escalation policy recommends an escalation policy', () => {
  const state = build({
    teams: [team({ id: '1', users: ['u1'], schedules: ['s1'] })],
    schedules: [{ id: 's1', attributes: { all_time_coverage: true, owner_group_ids: ['1'] } }]
  });
  assert.equal(state.onboarding.nextBestAction, 'create-escalation-policy');
  assert.equal(state.onboarding.steps.createSchedule, 'done');
});

test('team with members, schedule, and escalation policy is considered ready', () => {
  const state = build({
    teams: [team({ id: '1', users: ['u1'], schedules: ['s1'], escalationPolicies: ['e1'] })],
    schedules: [{ id: 's1', attributes: { all_time_coverage: true, owner_group_ids: ['1'] } }],
    escalationPolicies: [{ id: 'e1', attributes: { group_ids: ['1'], repeat_count: 1 } }]
  });
  assert.equal(state.onboarding.nextBestAction, 'run-guided-setup');
  assert.equal(state.teams.hasAnyAlertingReadyTeam, true);
  assert.equal(state.onboarding.steps.hookUpMonitor, 'done');
});

test('a slack channel signal marks incident setup in progress', () => {
  const state = build({
    teams: [team({ id: '1', users: ['u1'], attributes: { slack_channel_id: 'C123' } })]
  });
  assert.equal(state.teams.teamsWithSlack, 1);
  assert.equal(state.onboarding.readiness.incidentSetup, 'in-progress');
  assert.equal(state.onboarding.steps.connectSlack, 'maybe-needed');
});

test('resolves the workspace from the current_team relationship', () => {
  const state = build({
    teams: [team({ id: 'w1', name: 'Acme' })],
    userOpts: { currentTeamId: 'w1' }
  });
  assert.equal(state.teams.workspace.name, 'Acme');
});
