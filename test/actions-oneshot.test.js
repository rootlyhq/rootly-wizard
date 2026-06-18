process.env.ROOTLY_TOKEN = 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';
import { runOneShotSetupAction } from '../src/actions/oneshot.js';

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

function statusOf(result, step) {
  return result.data.steps.find((s) => s.step === step)?.status;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('runOneShotSetupAction runs the whole chain and ends with an alert + incident', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: '100' } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep1' } } };
    if (req.href.includes('/escalation_paths') && req.method === 'POST') return { body: { data: { id: 'path1' } } };
    if (req.href.includes('/escalation_levels') && req.method === 'POST') return { body: { data: { id: 'lvl1' } } };
    if (req.href.endsWith('/v1/alert_urgencies')) return { body: { data: [{ id: 'urg-high', attributes: { name: 'High' } }] } };
    if (req.href.endsWith('/v1/alert_sources') && req.method === 'POST') return { body: { data: { id: 'as1', attributes: { webhook_endpoint: 'https://hook' } } } };
    if (req.href.endsWith('/v1/alerts') && req.method === 'POST') return { body: { data: { id: 'al1' } } };
    if (req.href.endsWith('/v1/severities')) return { body: { data: [{ id: 'sev1' }] } };
    if (req.href.endsWith('/v1/incidents') && req.method === 'POST') return { body: { data: { id: 'inc1', attributes: { slack_channel_url: 'https://slack/inc1' } } } };
    return { body: {} };
  });

  const result = await runOneShotSetupAction({ teamName: 'Incident Response' });

  assert.equal(result.ok, true);
  assert.equal(statusOf(result, 'team'), 'ok');
  assert.equal(statusOf(result, 'schedule'), 'ok');
  assert.equal(statusOf(result, 'escalation-policy'), 'ok');
  assert.equal(statusOf(result, 'alert-source'), 'ok');
  assert.equal(statusOf(result, 'test-alert'), 'ok');
  assert.equal(statusOf(result, 'test-incident'), 'ok');
  // Status pages are no longer part of Quick start (offered separately).
  assert.equal(statusOf(result, 'status-page'), undefined);
  assert.equal(result.data.incident.id, 'inc1');
  assert.equal(result.data.incident.slackChannelUrl, 'https://slack/inc1');
  assert.deepEqual(result.data.blocked, []);
  assert.equal(result.data.note, null);

  // An escalation level is created targeting the on-call schedule, so a
  // triggered alert pages a person.
  const level = calls.find((c) => c.href.includes('/escalation_levels') && c.method === 'POST');
  assert.ok(level, 'escalation level created');
  assert.deepEqual(level.body.data.attributes.notification_target_params, [{ id: 'sch1', type: 'schedule' }]);

  // The test alert is triggered against the escalation policy (urgency high) so
  // it actually pages the on-call person — not just a passive record.
  const alert = calls.find((c) => c.href.endsWith('/v1/alerts') && c.method === 'POST');
  assert.equal(alert.body.data.attributes.notification_target_type, 'EscalationPolicy');
  assert.equal(alert.body.data.attributes.notification_target_id, 'ep1');
  assert.equal(alert.body.data.attributes.status, 'triggered');
  assert.equal(alert.body.data.attributes.alert_urgency_id, 'urg-high');
  assert.deepEqual(alert.body.data.attributes.group_ids, ['100']);
  const incident = calls.find((c) => c.href.endsWith('/v1/incidents') && c.method === 'POST');
  assert.deepEqual(incident.body.data.attributes.group_ids, ['100']);
  assert.equal(incident.body.data.attributes.severity_id, 'sev1');
});

test('runOneShotSetupAction adds chosen members and puts them on the rotation', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42', attributes: { email: 'bot+apikey-x@rootly.com' } } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') return { body: { data: { id: '100' } } };
    if (req.href.includes('/v1/teams/100') && req.method === 'GET') return { body: { data: { attributes: { user_ids: [] } } } };
    if (req.href.includes('/v1/teams/100') && req.method === 'PUT') return { body: { data: { attributes: { user_ids: ['7', '9'] } } } };
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep1' } } };
    if (req.href.includes('/escalation_paths') && req.method === 'POST') return { body: { data: { id: 'path1' } } };
    if (req.href.endsWith('/v1/alert_sources') && req.method === 'POST') return { body: { data: { id: 'as1' } } };
    if (req.href.endsWith('/v1/alerts') && req.method === 'POST') return { body: { data: { id: 'al1' } } };
    if (req.href.endsWith('/v1/severities')) return { body: { data: [] } };
    if (req.href.endsWith('/v1/incidents') && req.method === 'POST') return { body: { data: { id: 'inc1' } } };
    return { body: {} };
  });

  const result = await runOneShotSetupAction({ memberIds: ['7', '9'] });

  assert.equal(result.ok, true);
  assert.equal(statusOf(result, 'members'), 'ok');

  // Chosen users are merged onto the team...
  const put = calls.find((c) => c.href.includes('/v1/teams/100') && c.method === 'PUT');
  assert.deepEqual(put.body.data.attributes.user_ids, ['7', '9']);

  // ...and placed on the rotation in order (not the API-key bot identity).
  const members = calls
    .find((c) => c.href.includes('/schedule_rotations') && c.method === 'POST')
    .body.data.attributes.schedule_rotation_members;
  assert.deepEqual(members, [
    { member_type: 'User', member_id: '7', position: 1 },
    { member_type: 'User', member_id: '9', position: 2 }
  ]);
});

test('runOneShotSetupAction reuses the signed-in user\'s existing team', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) {
      return { body: { data: { id: '42', relationships: { teams: { data: [{ id: '777' }] } } } } };
    }
    if (req.href.endsWith('/v1/schedules') && req.method === 'POST') return { body: { data: { id: 'sch1' } } };
    if (req.href.includes('/schedule_rotations') && req.method === 'POST') return { body: { data: { id: 'rot1' } } };
    if (req.href.endsWith('/v1/escalation_policies') && req.method === 'POST') return { body: { data: { id: 'ep1' } } };
    if (req.href.includes('/escalation_paths') && req.method === 'POST') return { body: { data: { id: 'path1' } } };
    if (req.href.endsWith('/v1/alert_sources') && req.method === 'POST') return { body: { data: { id: 'as1' } } };
    if (req.href.endsWith('/v1/alerts') && req.method === 'POST') return { body: { data: { id: 'al1' } } };
    if (req.href.endsWith('/v1/severities')) return { body: { data: [] } };
    if (req.href.endsWith('/v1/incidents') && req.method === 'POST') return { body: { data: { id: 'inc1' } } };
    return { body: {} };
  });

  const result = await runOneShotSetupAction({});

  assert.equal(result.ok, true);
  assert.equal(statusOf(result, 'team'), 'reused');
  assert.equal(result.data.team.id, '777');
  // No team is created when one already exists.
  assert.equal(calls.some((c) => c.href.endsWith('/v1/teams') && c.method === 'POST'), false);
  // Downstream scaffolding hangs off the reused team.
  const alert = calls.find((c) => c.href.endsWith('/v1/alerts') && c.method === 'POST');
  assert.deepEqual(alert.body.data.attributes.group_ids, ['777']);
});

test('runOneShotSetupAction degrades gracefully when team writes are blocked', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/teams') && req.method === 'POST') {
      return { ok: false, status: 403, body: { errors: [{ detail: 'Not found or unauthorized' }] } };
    }
    if (req.href.endsWith('/v1/alerts') && req.method === 'POST') return { body: { data: { id: 'al1' } } };
    if (req.href.endsWith('/v1/severities')) return { body: { data: [] } };
    if (req.href.endsWith('/v1/incidents') && req.method === 'POST') return { body: { data: { id: 'inc1' } } };
    return { body: {} };
  });

  const result = await runOneShotSetupAction({});

  // The blocked team write does not abort the run — the alert + incident still
  // fire, just without a team to scope them to.
  assert.equal(result.ok, true);
  assert.equal(statusOf(result, 'team'), 'blocked');
  assert.deepEqual(result.data.blocked, ['team']);
  assert.equal(result.data.incident.id, 'inc1');
  assert.ok(result.data.note);

  // Team-dependent steps are skipped entirely (no schedule / escalation calls).
  assert.equal(calls.some((c) => c.href.endsWith('/v1/schedules') && c.method === 'POST'), false);
  assert.equal(calls.some((c) => c.href.endsWith('/v1/escalation_policies') && c.method === 'POST'), false);
  const alert = calls.find((c) => c.href.endsWith('/v1/alerts') && c.method === 'POST');
  assert.deepEqual(alert.body.data.attributes.group_ids ?? [], []);
});
