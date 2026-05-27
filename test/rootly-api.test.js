import test from 'node:test';
import assert from 'node:assert/strict';
import { RootlyApiClient } from '../src/rootly-api.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = original;
    });
}

test('request throws a formatted error on non-ok responses', async () => {
  await withFetch(async () => jsonResponse({ error: 'nope' }, { ok: false, status: 403 }), async () => {
    const api = new RootlyApiClient('tok');
    await assert.rejects(() => api.request('/v1/teams'), /Rootly API request failed for \/v1\/teams: 403/);
  });
});

test('request sends a bearer auth header', async () => {
  let seenHeaders;
  await withFetch(async (_url, init) => {
    seenHeaders = init.headers;
    return jsonResponse({ data: [] });
  }, async () => {
    const api = new RootlyApiClient('secret-token');
    await api.listTeams();
    assert.equal(seenHeaders.Authorization, 'Bearer secret-token');
  });
});

test('findUserByEmail follows pagination links until it finds a match', async () => {
  const calls = [];
  await withFetch(async (url) => {
    calls.push(url.toString());
    if (calls.length === 1) {
      return jsonResponse({
        data: [{ id: '1', attributes: { email: 'other@example.com' } }],
        links: { next: 'https://api.rootly.com/v1/users?page%5Bnumber%5D=2' }
      });
    }
    return jsonResponse({
      data: [{ id: '2', attributes: { email: 'Target@Example.com' } }],
      links: {}
    });
  }, async () => {
    const api = new RootlyApiClient('tok');
    const match = await api.findUserByEmail('target@example.com');
    assert.equal(match.id, '2');
    assert.equal(calls.length, 2);
  });
});

test('findUserByEmail returns null when no page contains the email', async () => {
  await withFetch(async () => jsonResponse({ data: [{ id: '1', attributes: { email: 'a@b.com' } }], links: {} }), async () => {
    const api = new RootlyApiClient('tok');
    const match = await api.findUserByEmail('missing@example.com');
    assert.equal(match, null);
  });
});
