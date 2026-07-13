import {
  addClaudeCodeUserScope,
  buildHostedMcpPreview,
  claudeCodeUserCommandDisplay,
  getMcpConfigPath,
  verifyHostedMcpConfig,
  writeHostedMcpConfig
} from '../mcp.js';
import { getStoredToken } from '../auth.js';

export async function previewMcpSetupAction({ clients = [], auth = 'Use stored token', claudeCodeScope = 'project' } = {}) {
  const paths = clients.map((client) => {
    if (client === 'Claude Code' && claudeCodeScope === 'user') {
      return { client, path: 'user scope via `claude mcp add --scope user` (~/.claude.json)', command: claudeCodeUserCommandDisplay() };
    }
    return { client, path: getMcpConfigPath(client) };
  });

  return {
    ok: true,
    summary: 'Built MCP preview.',
    data: {
      clients,
      auth,
      claudeCodeScope,
      preview: clients.map((client) => buildHostedMcpPreview(client, auth)),
      paths
    }
  };
}

export async function applyMcpSetupAction({ clients = [], auth = 'Use stored token', claudeCodeScope = 'project' } = {}) {
  const token = auth === 'Use ROOTLY_TOKEN'
    ? process.env.ROOTLY_TOKEN?.trim()
    : await getStoredToken();

  if (!token) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: auth === 'Use ROOTLY_TOKEN'
        ? 'ROOTLY_TOKEN was not found in the environment.'
        : 'No stored Rootly token was found.',
      data: null
    };
  }

  const results = [];
  for (const client of clients) {
    // Claude Code has two scopes: 'project' writes .mcp.json to cwd (the
    // default) and 'user' registers a global MCP server via the claude CLI so
    // Rootly works across every project without a token file in each repo.
    if (client === 'Claude Code' && claudeCodeScope === 'user') {
      const outcome = addClaudeCodeUserScope(token);
      results.push({
        client,
        targetPath: outcome.target,
        ran: outcome.ran,
        // When `claude` isn't on PATH we surface the exact command so the user
        // can run it themselves — the wizard doesn't hand-edit ~/.claude.json.
        command: outcome.ran ? null : outcome.command
      });
      continue;
    }

    const { targetPath, backupPath } = await writeHostedMcpConfig(client, token);
    await verifyHostedMcpConfig(client);
    results.push({ client, targetPath, backupPath });
  }

  return {
    ok: true,
    summary: 'Configured MCP for selected clients.',
    data: {
      clients,
      auth,
      claudeCodeScope,
      results
    }
  };
}
