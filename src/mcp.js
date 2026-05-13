import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function rootlyMcpConfig(token) {
  return {
    mcpServers: {
      rootly: {
        command: 'npx',
        args: [
          '-y',
          'mcp-remote',
          'https://mcp.rootly.com/sse',
          '--header',
          'Authorization:${ROOTLY_AUTH_HEADER}'
        ],
        env: {
          ROOTLY_AUTH_HEADER: `Bearer ${token}`
        }
      }
    }
  };
}

function stringifyConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function configFileForClient(client) {
  const home = os.homedir();
  const appData = process.env.APPDATA;
  const platform = process.platform;

  switch (client) {
    case 'Cursor':
      return path.join(home, '.cursor', 'mcp.json');
    case 'Claude Desktop':
      if (platform === 'win32') {
        return path.join(appData || home, 'Claude', 'claude_desktop_config.json');
      }
      if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      }
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    case 'Windsurf':
      if (platform === 'win32') {
        return path.join(appData || home, 'Windsurf', 'mcp.json');
      }
      return path.join(home, '.windsurf', 'mcp.json');
    case 'Claude Code':
      return path.join(home, '.claude', 'claude_code_config.json');
    default:
      return path.join(process.cwd(), `${client.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-mcp.json`);
  }
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readExistingJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function buildHostedMcpPreview(client, tokenType) {
  const config = rootlyMcpConfig('<YOUR_ROOTLY_API_TOKEN>');
  return [
    `Client: ${client}`,
    `Auth: ${tokenType}`,
    'Connection: hosted Rootly MCP server',
    '',
    stringifyConfig(config)
  ].join('\n');
}

export async function writeHostedMcpConfig(client, token) {
  const targetPath = configFileForClient(client);
  await ensureParentDir(targetPath);
  const existing = await readExistingJson(targetPath);
  const merged = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      ...rootlyMcpConfig(token).mcpServers
    }
  };
  await fs.writeFile(targetPath, stringifyConfig(merged), 'utf8');
  return targetPath;
}

export function getMcpConfigPath(client) {
  return configFileForClient(client);
}
