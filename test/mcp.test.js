import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeCodeUserCommandArgs, buildHostedMcpPreview, getMcpConfigPath } from '../src/mcp.js';

test('preview embeds the hosted endpoint and a token placeholder for JSON clients', () => {
  const preview = buildHostedMcpPreview('Cursor', 'Use stored token');
  assert.match(preview, /mcp\.rootly\.com\/mcp/);
  assert.match(preview, /<YOUR_ROOTLY_TOKEN>/);
  assert.match(preview, /Client: Cursor/);
});

test('Codex config embeds the token inline via an Authorization header', () => {
  const preview = buildHostedMcpPreview('Codex', 'Use stored token');
  assert.match(preview, /\[mcp_servers\.rootly\]/);
  assert.match(preview, /mcp\.rootly\.com\/mcp/);
  // Token is embedded (placeholder in preview), not referenced via env var.
  assert.match(preview, /http_headers = \{ Authorization = "Bearer <YOUR_ROOTLY_TOKEN>" \}/);
  assert.doesNotMatch(preview, /bearer_token_env_var/);
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
