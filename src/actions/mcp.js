import { buildHostedMcpPreview, getMcpConfigPath, verifyHostedMcpConfig, writeHostedMcpConfig } from '../mcp.js';
import { getStoredToken } from '../auth.js';

export async function previewMcpSetupAction({ clients = [], auth = 'Use stored token' } = {}) {
  return {
    ok: true,
    summary: 'Built MCP preview.',
    data: {
      clients,
      auth,
      preview: clients.map((client) => buildHostedMcpPreview(client, auth)),
      paths: clients.map((client) => ({
        client,
        path: getMcpConfigPath(client)
      }))
    }
  };
}

export async function applyMcpSetupAction({ clients = [], auth = 'Use stored token' } = {}) {
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
      results
    }
  };
}
