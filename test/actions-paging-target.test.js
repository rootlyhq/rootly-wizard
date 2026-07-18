process.env.ROOTLY_TOKEN = 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getPagingTargetAction } from '../src/actions/inspect.js';

const originalFetch = globalThis.fetch;

function installFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    const res = handler({ href: url.toString(), method: init.method || 'GET' }) || {};
    return {
      ok: res.ok !== false,
      status: res.status || 200,
      json: async () => res.body ?? {},
      text: async () => JSON.stringify(res.body ?? {})
    };
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('paging target is self for a human sign-in', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '100', attributes: { email: 'jo@acme.com', full_name: 'Jo' } } } };
    return { body: { data: [] } };
  });
  const { data } = await getPagingTargetAction();
  assert.equal(data.mode, 'self');
  assert.equal(data.id, '100');
  assert.equal(data.serviceAccount, false);
});

test('service-account token with one human auto-selects that human', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '900', attributes: { email: 'bot+apikey-abc@rootly.com' } } } };
    if (req.href.endsWith('/v1/users')) return { body: { data: [{ id: '268993', attributes: { email: 'anika@acme.com', full_name: 'Anika Shah' } }] } };
    return { body: { data: [] } };
  });
  const { data } = await getPagingTargetAction();
  assert.equal(data.mode, 'auto-human');
  assert.equal(data.id, '268993');
  assert.equal(data.serviceAccount, true);
  assert.match(data.label, /Anika Shah/);
});

test('service-account token with no humans falls back to the bot', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '900', attributes: { email: 'bot+apikey-abc@rootly.com' } } } };
    if (req.href.endsWith('/v1/users')) return { body: { data: [{ id: '900', attributes: { email: 'bot+apikey-abc@rootly.com' } }] } };
    return { body: { data: [] } };
  });
  const { data } = await getPagingTargetAction();
  assert.equal(data.mode, 'bot-fallback');
  assert.equal(data.id, '900');
});

test('service-account token with several humans requires a pick', async () => {
  installFetch((req) => {
    if (req.href.endsWith('/v1/users/me')) return { body: { data: { id: '900', attributes: { email: 'bot+apikey-abc@rootly.com' } } } };
    if (req.href.endsWith('/v1/users')) return { body: { data: [
      { id: '1', attributes: { email: 'a@acme.com', full_name: 'A' } },
      { id: '2', attributes: { email: 'b@acme.com', full_name: 'B' } }
    ] } };
    return { body: { data: [] } };
  });
  const { data } = await getPagingTargetAction();
  assert.equal(data.mode, 'pick');
  assert.equal(data.candidates.length, 2);
});
