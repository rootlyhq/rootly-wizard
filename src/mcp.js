import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const HOSTED_MCP_URL = 'https://mcp.rootly.com/mcp';

function stringifyConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function hostedJsonConfig(token) {
  return {
    mcpServers: {
      rootly: {
        url: HOSTED_MCP_URL,
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  };
}

function claudeDesktopConfig(token) {
  return {
    mcpServers: {
      rootly: {
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://mcp.rootly.com/sse', '--header', `Authorization: Bearer ${token}`]
      }
    }
  };
}

function claudeCodeConfig(token) {
  return {
    mcpServers: {
      rootly: {
        type: 'http',
        url: HOSTED_MCP_URL,
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  };
}

function windsurfConfig(token) {
  return {
    mcpServers: {
      rootly: {
        serverUrl: HOSTED_MCP_URL,
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  };
}

function codexConfig() {
  return [
    '[mcp_servers.rootly]',
    `url = "${HOSTED_MCP_URL}"`,
    'bearer_token_env_var = "ROOTLY_API_TOKEN"'
  ].join('\n');
}

function configForClient(client, token) {
  switch (client) {
    case 'Cursor':
      return stringifyConfig(hostedJsonConfig(token));
    case 'Claude Desktop':
      return stringifyConfig(claudeDesktopConfig(token));
    case 'Claude Code':
      return stringifyConfig(claudeCodeConfig(token));
    case 'Windsurf':
      return stringifyConfig(windsurfConfig(token));
    case 'Codex':
      return `${codexConfig()}\n`;
    default:
      throw new Error(`Unsupported MCP client: ${client}`);
  }
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
        return path.join(appData || home, 'Codeium', 'Windsurf', 'mcp_config.json');
      }
      return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
    case 'Claude Code':
      return path.join(process.cwd(), '.mcp.json');
    case 'Codex':
      return path.join(home, '.codex', 'config.toml');
    default:
      throw new Error(`Unsupported MCP client: ${client}`);
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
  return [
    `Client: ${client}`,
    `Auth: ${tokenType}`,
    'Connection: hosted Rootly MCP server',
    '',
    configForClient(client, '<YOUR_ROOTLY_API_TOKEN>')
  ].join('\n');
}

export async function writeHostedMcpConfig(client, token) {
  const targetPath = configFileForClient(client);
  await ensureParentDir(targetPath);

  if (client === 'Codex') {
    await fs.writeFile(targetPath, codexConfig(), 'utf8');
    return targetPath;
  }

  const existing = await readExistingJson(targetPath);
  const merged = {
    ...existing,
    ...JSON.parse(configForClient(client, token))
  };
  await fs.writeFile(targetPath, stringifyConfig(merged), 'utf8');
  return targetPath;
}

export function getMcpConfigPath(client) {
  return configFileForClient(client);
}

export async function verifyHostedMcpConfig(client) {
  const targetPath = configFileForClient(client);

  if (client === 'Codex') {
    const raw = await fs.readFile(targetPath, 'utf8');
    if (!raw.includes('[mcp_servers.rootly]')) {
      throw new Error(`Rootly MCP config not found in ${targetPath}`);
    }
    if (!raw.includes(HOSTED_MCP_URL)) {
      throw new Error(`Rootly MCP config in ${targetPath} is missing the hosted Rootly endpoint`);
    }
    if (!raw.includes('bearer_token_env_var')) {
      throw new Error(`Rootly MCP config in ${targetPath} is missing bearer_token_env_var`);
    }
    return targetPath;
  }

  const config = await readExistingJson(targetPath);
  const rootly = config?.mcpServers?.rootly || config?.rootly;

  if (!rootly) {
    throw new Error(`Rootly MCP config not found in ${targetPath}`);
  }

  const isHostedHttp = rootly.url === HOSTED_MCP_URL || rootly.serverUrl === HOSTED_MCP_URL;
  const isClaudeDesktop = rootly.command === 'npx' && Array.isArray(rootly.args) && rootly.args.includes('mcp-remote');

  if (!isHostedHttp && !isClaudeDesktop) {
    throw new Error(`Rootly MCP config in ${targetPath} does not point at the hosted Rootly server`);
  }

  return targetPath;
}
