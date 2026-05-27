import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, buildActionCatalog, buildToolSpecs, describeAction, validateInput, toStructuredError } from '../src/actions/registry.js';

test('every action has a handler, a description, and an input schema', () => {
  for (const [name, entry] of Object.entries(ACTIONS)) {
    assert.equal(typeof entry.handler, 'function', `${name} handler`);
    assert.equal(typeof entry.description, 'string', `${name} description`);
    assert.equal(typeof entry.mutates, 'boolean', `${name} mutates`);
    assert.equal(typeof entry.input, 'object', `${name} input`);
  }
});

test('catalog and describe expose discovery metadata', () => {
  const catalog = buildActionCatalog();
  assert.ok(catalog.some((a) => a.name === 'run-guided-setup' && a.mutates === true));
  assert.ok(catalog.some((a) => a.name === 'list-services' && a.mutates === false));

  const team = describeAction('create-team');
  assert.equal(team.mutates, true);
  assert.equal(team.supportsDryRun, true);
  assert.equal(team.input.name.required, true);

  assert.equal(describeAction('nope'), null);
});

test('buildToolSpecs emits valid tool definitions for every action', () => {
  const tools = buildToolSpecs();
  assert.equal(tools.length, Object.keys(ACTIONS).length);

  for (const tool of tools) {
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.ok(Array.isArray(tool.input_schema.required));
  }

  const team = tools.find((t) => t.name === 'create-team');
  assert.ok(team.input_schema.required.includes('name'));
  assert.equal(team.input_schema.properties.dryRun.type, 'boolean'); // mutating actions expose dryRun
  assert.deepEqual(team.input_schema.properties.memberEmails.items, { type: 'string' });

  const readOnly = tools.find((t) => t.name === 'list-services');
  assert.equal(readOnly.input_schema.properties.dryRun, undefined); // read actions do not
});

test('validateInput flags missing required fields and type mismatches', () => {
  const schema = { name: { type: 'string', required: true }, emails: { type: 'array' } };
  assert.deepEqual(validateInput(schema, {}), { field: 'name', message: 'name is required' });
  assert.deepEqual(validateInput(schema, { name: '' }), { field: 'name', message: 'name is required' });
  assert.equal(validateInput(schema, { name: 'X' }), null);
  assert.deepEqual(validateInput(schema, { name: 'X', emails: 'a@b.com' }), { field: 'emails', message: 'emails must be of type array' });
  assert.equal(validateInput(schema, { name: 'X', emails: ['a@b.com'] }), null);
});

test('toStructuredError parses a 422 validation error with field pointer', () => {
  const err = new Error('Rootly API request failed for /v1/teams: 422 - {"errors":[{"title":"Name can\'t be blank","status":"422","source":{"pointer":"/data/attributes/name"}}]}');
  const out = toStructuredError('create-team', err);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'VALIDATION');
  assert.equal(out.status, 422);
  assert.equal(out.field, 'name');
  assert.equal(out.error, "Name can't be blank");
  assert.equal(out.retryable, false);
});

test('toStructuredError maps status codes and timeouts', () => {
  assert.equal(toStructuredError('x', new Error('401 - {}')).code, 'UNAUTHORIZED');
  assert.equal(toStructuredError('x', new Error('403 - {}')).code, 'FORBIDDEN');
  assert.equal(toStructuredError('x', new Error('404 - {}')).code, 'NOT_FOUND');

  const server = toStructuredError('x', new Error('500 - {}'));
  assert.equal(server.code, 'ACTION_FAILED');
  assert.equal(server.retryable, true);

  const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
  const out = toStructuredError('x', timeout);
  assert.equal(out.code, 'TIMEOUT');
  assert.equal(out.retryable, true);
});
