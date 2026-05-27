process.env.ROOTLY_TOKEN = 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuidedSetupAction } from '../src/actions/guided.js';
import { getServicesAction, getUsersAction, getTeamMembersAction } from '../src/actions/inspect.js';

const originalFetch = globalThis.fetch;

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const entry = { href: url.toString(), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    calls.push(entry);
    const res = handler(entry) || {};
    return { ok: res.ok !== false, status: res.status || 200, json: async () => res.body ?? {}, text: async () => JSON.stringify(res.body ?? {}) };
  };
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('runGuidedSetupAction creates team, schedule, escalation+path, and alert source', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: 'team1' } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep1' } } };
    if (req.href.includes('/escalation_paths') && req.method === 'POST') return { body: { data: { id: 'path1' } } };
    if (req.href.endsWith('/v1/alert_sources') && req.method === 'POST') return { body: { data: { id: 'as1', attributes: { webhook_endpoint: 'https://hook' } } } };
    return { body: {} };
  });

  const result = await runGuidedSetupAction({ teamName: 'Payments' });
  assert.equal(result.ok, true);
  assert.equal(result.data.team.id, 'team1');
  assert.equal(result.data.schedule.id, 'sch1');
  assert.equal(result.data.escalationPolicy.id, 'ep1');
  assert.equal(result.data.escalationPolicy.pathCreated, true);
  assert.equal(result.data.alertSource.id, 'as1');
  assert.equal(result.data.alertSource.webhookEndpoint, 'https://hook');
  assert.deepEqual(result.data.steps.map((s) => [s.step, s.ok]), [
    ['create-team', true],
    ['create-schedule', true],
    ['create-escalation-policy', true],
    ['create-alert-source', true]
  ]);
});

test('runGuidedSetupAction is fatal when the team cannot be created', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { ok: false, status: 422, body: { errors: [{ title: 'bad' }] } };
    return { body: {} };
  });

  const result = await runGuidedSetupAction({ teamName: 'Payments' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'GUIDED_SETUP_FAILED');
  assert.equal(result.data.team, null);
  assert.equal(result.data.steps[0].step, 'create-team');
  assert.equal(result.data.steps[0].ok, false);
});

test('runGuidedSetupAction continues when a later step fails', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: 'team1' } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { ok: false, status: 500, body: { errors: [{ title: 'boom' }] } };
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep1' } } };
    if (req.href.endsWith('/v1/alert_sources') && req.method === 'POST') return { body: { data: { id: 'as1' } } };
    return { body: {} };
  });

  const result = await runGuidedSetupAction({ teamName: 'Payments' });
  assert.equal(result.ok, true);
  const byStep = Object.fromEntries(result.data.steps.map((s) => [s.step, s.ok]));
  assert.equal(byStep['create-team'], true);
  assert.equal(byStep['create-schedule'], false);
  assert.equal(byStep['create-escalation-policy'], true);
  assert.equal(byStep['create-alert-source'], true);
  // schedule failed, so no default escalation path is attempted
  assert.equal(result.data.escalationPolicy.pathCreated, false);
});

test('list actions map resources to {id, name} / {id, email}', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/services')) return { body: { data: [{ id: 's1', attributes: { name: 'API' } }] } };
    if (req.href.endsWith('/v1/users')) return { body: { data: [{ id: 'u1', attributes: { email: 'a@b.com', full_name: 'A B' } }], links: {} } };
    return { body: { data: [] } };
  });

  const services = await getServicesAction();
  assert.deepEqual(services.data.items, [{ id: 's1', name: 'API' }]);
  assert.equal(services.data.total, 1);

  const users = await getUsersAction();
  assert.deepEqual(users.data.items, [{ id: 'u1', email: 'a@b.com', name: 'A B' }]);
});

test('getTeamMembersAction resolves a team\'s members from included users', async () => {
  installFetch((req) => {
    if (req.href.includes('/v1/teams/t1')) {
      return {
        body: {
          data: { id: 't1', attributes: { name: 'Payments' }, relationships: { users: { data: [{ id: 'u1' }, { id: 'u2' }] } } },
          included: [
            { id: 'u1', type: 'users', attributes: { email: 'a@b.com', full_name: 'A B' } },
            { id: 'u2', type: 'users', attributes: { email: 'c@d.com', full_name: 'C D' } }
          ]
        }
      };
    }
    return { body: {} };
  });

  const result = await getTeamMembersAction({ teamId: 't1' });
  assert.equal(result.data.teamName, 'Payments');
  assert.equal(result.data.total, 2);
  assert.deepEqual(result.data.members, [
    { id: 'u1', email: 'a@b.com', name: 'A B' },
    { id: 'u2', email: 'c@d.com', name: 'C D' }
  ]);
});
