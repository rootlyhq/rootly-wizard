process.env.ROOTLY_TOKEN = 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamAction, createScheduleAction, createEscalationPolicyAction, createAlertSourceAction } from '../src/actions/setup.js';

const originalFetch = globalThis.fetch;

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const entry = {
      href: url.toString(),
      method: init.method || 'GET',
      body: init.body ? JSON.parse(init.body) : null
    };
    calls.push(entry);
    const res = handler(entry) || {};
    return {
      ok: res.ok !== false,
      status: res.status || 200,
      json: async () => res.body ?? {},
      text: async () => JSON.stringify(res.body ?? {})
    };
  };
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('createTeamAction (agent path) sends a minimal payload', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: '100' } } };
    return { body: {} };
  });

  const result = await createTeamAction({ name: 'Payments' });
  assert.equal(result.data.id, '100');

  const attrs = calls.find((c) => c.href.endsWith('/v1/teams') && c.method === 'POST').body.data.attributes;
  assert.deepEqual(attrs.user_ids, ['42']);
  assert.deepEqual(attrs.admin_ids, ['42']);
  assert.equal(attrs.auto_add_members_when_attached, true);
  assert.equal('notify_emails' in attrs, false);
  assert.equal('alerts_email_enabled' in attrs, false);
});

test('createTeamAction does not seed an API-key service account as member/admin', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '99', attributes: { email: 'bot+apikey-abc-123@rootly.com' } } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: 't1' } } };
    return { body: {} };
  });

  await createTeamAction({ name: 'Payments' });

  const attrs = calls.find((c) => c.href.endsWith('/v1/teams') && c.method === 'POST').body.data.attributes;
  assert.deepEqual(attrs.user_ids, []);
  assert.deepEqual(attrs.admin_ids, []);
});

test('createTeamAction (guided path) resolves emails and enables alerts/broadcast', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.includes('/v1/users') && req.method === 'GET') {
      return { body: { data: [{ id: '7', attributes: { email: 'dev@example.com', full_name: 'Dev User' } }], links: {} } };
    }
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: '100' } } };
    return { body: {} };
  });

  const result = await createTeamAction({
    name: 'Payments',
    memberEmails: ['dev@example.com', 'missing@example.com'],
    enableAlertsAndBroadcast: true
  });

  assert.deepEqual(result.data.memberIds, [7]);
  assert.deepEqual(result.data.matchedUsers, [{ id: '7', email: 'dev@example.com', name: 'Dev User' }]);

  const attrs = calls.find((c) => c.href.endsWith('/v1/teams') && c.method === 'POST').body.data.attributes;
  assert.deepEqual(attrs.user_ids, ['42', 7]);
  assert.deepEqual(attrs.notify_emails, ['dev@example.com', 'missing@example.com']);
  assert.equal(attrs.alerts_email_enabled, true);
  assert.equal(attrs.incident_broadcast_enabled, true);
});

test('createScheduleAction adds the current user and members to the rotation in order', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    return { body: {} };
  });

  const result = await createScheduleAction({ teamId: '100', name: 'Payments On-Call', memberIds: [7, 9] });
  assert.equal(result.data.scheduleId, 'sch1');

  const members = calls
    .find((c) => c.href.includes('/schedule_rotations') && c.method === 'POST')
    .body.data.attributes.schedule_rotation_members;
  assert.deepEqual(members, [
    { member_type: 'User', member_id: '42', position: 1 },
    { member_type: 'User', member_id: 7, position: 2 },
    { member_type: 'User', member_id: 9, position: 3 }
  ]);
});

test('createScheduleAction does not put a service account on the rotation', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '99', attributes: { email: 'bot+apikey-x@rootly.com' } } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    return { body: {} };
  });

  const result = await createScheduleAction({ teamId: 't1', name: 'On-Call' });
  assert.equal(result.data.scheduleId, 'sch1');
  assert.equal(result.data.rotationCreated, false);
  assert.equal(calls.some((c) => c.href.includes('/schedule_rotations')), false);

  // No human is available, so the required owner falls back to the current
  // identity, but the rotation (who is on call) is left empty.
  const scheduleAttrs = calls.find((c) => c.href.endsWith('/v1/schedules') && c.method === 'POST').body.data.attributes;
  assert.equal(scheduleAttrs.owner_user_id, '99');
});

test('createScheduleAction builds the rotation from real members only', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '99', attributes: { email: 'bot+apikey-x@rootly.com' } } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    return { body: {} };
  });

  const result = await createScheduleAction({ teamId: 't1', name: 'On-Call', memberIds: [7, 9] });
  assert.equal(result.data.rotationCreated, true);

  // Owner falls back to the first real invited member, not the service account.
  const scheduleAttrs = calls.find((c) => c.href.endsWith('/v1/schedules') && c.method === 'POST').body.data.attributes;
  assert.equal(scheduleAttrs.owner_user_id, 7);

  const members = calls.find((c) => c.href.includes('/schedule_rotations') && c.method === 'POST').body.data.attributes.schedule_rotation_members;
  assert.deepEqual(members, [
    { member_type: 'User', member_id: 7, position: 1 },
    { member_type: 'User', member_id: 9, position: 2 }
  ]);
});

test('createEscalationPolicyAction creates a default path only when requested', async () => {
  const withPath = installFetch((req) => {
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep1' } } };
    if (req.href.includes('/escalation_paths') && req.method === 'POST') return { body: { data: { id: 'path1' } } };
    return { body: {} };
  });
  const created = await createEscalationPolicyAction({ teamId: '100', name: 'Default', createDefaultPath: true });
  assert.equal(created.data.id, 'ep1');
  assert.equal(created.data.pathCreated, true);
  assert.equal(created.data.pathError, null);
  const pathCall = withPath.find((c) => c.href.includes('/v1/escalation_policies/ep1/escalation_paths') && c.method === 'POST');
  assert.ok(pathCall);
  assert.deepEqual(pathCall.body.data.attributes.rules, []);

  globalThis.fetch = originalFetch;

  const withoutPath = installFetch((req) => {
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep2' } } };
    return { body: {} };
  });
  const skipped = await createEscalationPolicyAction({ teamId: '100', name: 'Default' });
  assert.equal(skipped.data.pathCreated, false);
  assert.equal(withoutPath.some((c) => c.href.includes('/escalation_paths')), false);
});

test('createAlertSourceAction posts a generic_webhook source', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/alert_sources') && req.method === 'POST') {
      return { status: 201, body: { data: { id: 'as1', attributes: { webhook_endpoint: 'https://hook.example' } } } };
    }
    return { body: {} };
  });

  const result = await createAlertSourceAction({ teamId: '100', name: 'My webhook' });
  assert.equal(result.data.id, 'as1');
  assert.equal(result.data.webhookEndpoint, 'https://hook.example');

  const attrs = calls.find((c) => c.href.endsWith('/v1/alert_sources') && c.method === 'POST').body.data.attributes;
  assert.equal(attrs.source_type, 'generic_webhook');
  assert.deepEqual(attrs.owner_group_ids, ['100']);
});

test('createEscalationPolicyAction keeps the policy when the default path fails', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep3' } } };
    if (req.href.includes('/escalation_paths') && req.method === 'POST') {
      return { ok: false, status: 422, body: { errors: [{ detail: 'Urgency IDs are required' }] } };
    }
    return { body: {} };
  });
  const result = await createEscalationPolicyAction({ teamId: '100', name: 'Default', createDefaultPath: true });
  assert.equal(result.ok, true);
  assert.equal(result.data.id, 'ep3');
  assert.equal(result.data.pathCreated, false);
  assert.ok(result.data.pathError);
});
