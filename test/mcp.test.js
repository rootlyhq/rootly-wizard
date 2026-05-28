import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeCodeUserCommandArgs, buildHostedMcpPreview, getMcpConfigPath } from '../src/mcp.js';

test('preview embeds the hosted endpoint and a token placeholder for JSON clients', () => {
  const preview = buildHostedMcpPreview('Cursor', 'Use stored token');
  assert.match(preview, /mcp\.rootly\.com\/mcp/);
  assert.match(preview, /<YOUR_ROOTLY_API_TOKEN>/);
  assert.match(preview, /Client: Cursor/);
});

test('Codex preview uses env-var indirection rather than an inline token', () => {
  const preview = buildHostedMcpPreview('Codex', 'Use ROOTLY_TOKEN');
  assert.match(preview, /bearer_token_env_var/);
  assert.doesNotMatch(preview, /<YOUR_ROOTLY_API_TOKEN>/);
});

test('Claude Code config path is the project-local .mcp.json', () => {
  const target = getMcpConfigPath('Claude Code');
  assert.ok(target.endsWith('.mcp.json'), `expected .mcp.json, got ${target}`);
});

test('Cursor config path is under the user .cursor directory', () => {
  const target = getMcpConfigPath('Cursor');
  assert.match(target, /\.cursor[/\\]mcp\.json$/);
});

test('Claude Code user-scope command targets the hosted MCP with a bearer header', () => {
  const args = buildClaudeCodeUserCommandArgs('tok-123');
  assert.deepEqual(args, [
    'mcp', 'add', '--scope', 'user', '--transport', 'http', 'rootly',
    'https://mcp.rootly.com/mcp', '--header', 'Authorization: Bearer tok-123'
  ]);
});
