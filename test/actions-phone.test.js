process.env.ROOTLY_TOKEN = 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startPhoneVerificationAction,
  confirmPhoneVerificationAction
} from '../src/actions/phone.js';

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

test('startPhoneVerificationAction creates the number for the current user and sends a code', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/users/42/phone_numbers') && req.method === 'POST') return { body: { data: { id: 'pn1' } } };
    if (req.href.endsWith('/v1/phone_numbers/pn1/verify') && req.method === 'POST') return { body: { message: 'Verification code sent' } };
    return { body: {} };
  });

  const result = await startPhoneVerificationAction({ phone: '+14155550123' });
  assert.equal(result.ok, true);
  assert.equal(result.data.phoneNumberId, 'pn1');

  const create = calls.find((c) => c.href.endsWith('/v1/users/42/phone_numbers') && c.method === 'POST');
  assert.equal(create.body.data.type, 'user_phone_numbers');
  assert.equal(create.body.data.attributes.phone, '+14155550123');
  assert.ok(calls.some((c) => c.href.endsWith('/v1/phone_numbers/pn1/verify') && c.method === 'POST'));
});

test('startPhoneVerificationAction cleans up the number if sending the code fails', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/users/42/phone_numbers') && req.method === 'POST') return { body: { data: { id: 'pn1' } } };
    if (req.href.endsWith('/v1/phone_numbers/pn1/verify') && req.method === 'POST') return { ok: false, status: 422, body: { error: 'Twilio error' } };
    return { body: {} };
  });

  const result = await startPhoneVerificationAction({ phone: '+14155550123' });
  assert.equal(result.ok, false);
  assert.ok(calls.some((c) => c.href.endsWith('/v1/phone_numbers/pn1') && c.method === 'DELETE'));
});

test('confirmPhoneVerificationAction submits the code to verify_code', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/phone_numbers/pn1/verify_code') && req.method === 'PATCH') return { body: { message: 'Phone number verified successfully' } };
    return { body: {} };
  });

  const result = await confirmPhoneVerificationAction({ phoneNumberId: 'pn1', code: '123456' });
  assert.equal(result.ok, true);

  const submit = calls.find((c) => c.href.endsWith('/v1/phone_numbers/pn1/verify_code') && c.method === 'PATCH');
  assert.equal(submit.body.code, '123456');
});

test('confirmPhoneVerificationAction surfaces an invalid code', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/verify_code')) return { ok: false, status: 422, body: { error: 'Invalid or expired verification code' } };
    return { body: {} };
  });

  const result = await confirmPhoneVerificationAction({ phoneNumberId: 'pn1', code: '000000' });
  assert.equal(result.ok, false);
});

test('confirmPhoneVerificationAction wires the phone into call/SMS notification rules', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/phone_numbers/pn1/verify_code') && req.method === 'PATCH') return { body: { message: 'verified' } };
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/users/42/notification_rules') && req.method === 'GET') {
      return { body: { data: [{ id: 'nr1', type: 'user_notification_rules', attributes: { enabled_contact_types: ['email'] } }] } };
    }
    return { body: {} };
  });

  const result = await confirmPhoneVerificationAction({ phoneNumberId: 'pn1', code: '123456' });
  assert.equal(result.ok, true);

  const patch = calls.find((c) => c.href.endsWith('/v1/notification_rules/nr1') && c.method === 'PATCH');
  assert.ok(patch, 'expected the notification rule to be patched');
  assert.equal(patch.body.data.attributes.user_call_number_id, 'pn1');
  assert.equal(patch.body.data.attributes.user_sms_number_id, 'pn1');
  assert.deepEqual(
    [...patch.body.data.attributes.enabled_contact_types].sort(),
    ['call', 'email', 'sms']
  );
});

test('confirmPhoneVerificationAction creates a rule when the user has none', async () => {
  const calls = installFetch((req) => {
    if (req.href.endsWith('/v1/phone_numbers/pn1/verify_code') && req.method === 'PATCH') return { body: { message: 'verified' } };
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '42' } } };
    if (req.href.endsWith('/v1/users/42/notification_rules') && req.method === 'GET') return { body: { data: [] } };
    return { body: {} };
  });

  const result = await confirmPhoneVerificationAction({ phoneNumberId: 'pn1', code: '123456' });
  assert.equal(result.ok, true);

  const create = calls.find((c) => c.href.endsWith('/v1/users/42/notification_rules') && c.method === 'POST');
  assert.ok(create, 'expected a notification rule to be created');
  assert.equal(create.body.data.attributes.user_call_number_id, 'pn1');
  assert.ok(create.body.data.attributes.enabled_contact_types.includes('call'));
});
