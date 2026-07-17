import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const HOSTED_MCP_URL = 'https://mcp.rootly.com/mcp';

function stringifyConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function mergeMcpServers(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    mcpServers: {
      ...(existing?.mcpServers || {}),
      ...(incoming?.mcpServers || {})
    }
  };
}

function hostedJsonConfig(token) {
  // Cursor accepts either shape but recent releases prefer an explicit
  // transport type for streamable-HTTP servers. Matching what we write for
  // Claude Code keeps the format consistent across the JSON-config clients.
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

function codexConfig(token) {
  // Embed the token inline via an Authorization header, like every other client
  // config, so Codex works without a separate ROOTLY_TOKEN env var. Use an
  // inline TOML table so the whole server stays under one [mcp_servers.rootly]
  // block (no sub-table), which keeps refresh-on-rerun a simple block replace.
  return [
    '[mcp_servers.rootly]',
    `url = "${HOSTED_MCP_URL}"`,
    `http_headers = { Authorization = "Bearer ${token}" }`
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
      return `${codexConfig(token)}\n`;
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

async function maybeBackupFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak.${stamp}`;
  await fs.copyFile(filePath, backupPath);
  // The source may embed a bearer token, and copyFile doesn't guarantee tight
  // perms on the copy — restrict the backup to owner read/write like the live file.
  await fs.chmod(backupPath, 0o600).catch(() => {});
  return backupPath;
}

// Read a JSON config, returning:
//   { missing: true }              — the file doesn't exist yet (fine, fresh write)
//   { value: object }              — parsed JSON
//   { malformed: true, raw }       — file exists but isn't valid JSON
// Callers should refuse to clobber a malformed file so a hand-edited or
// corrupted config isn't silently overwritten.
async function readExistingJson(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { missing: true };
    throw error;
  }
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { malformed: true, raw };
  }
}

export function buildHostedMcpPreview(client, tokenType) {
  return [
    `Client: ${client}`,
    `Auth: ${tokenType}`,
    'Connection: hosted Rootly MCP server',
    '',
    configForClient(client, '<YOUR_ROOTLY_TOKEN>')
  ].join('\n');
}

export async function writeHostedMcpConfig(client, token) {
  const targetPath = configFileForClient(client);
  await ensureParentDir(targetPath);
  const backupPath = await maybeBackupFile(targetPath);

  if (client === 'Codex') {
    // Codex config is a shared TOML file (models, profiles, other MCP servers),
    // so never overwrite the whole file. Our [mcp_servers.rootly] block embeds
    // the token, so refresh it on rerun: replace an existing block, append if
    // absent. The block has no sub-tables (inline http_headers table), so it
    // runs from its header to the next top-level table or EOF. Owner-only perms
    // since the token is inline.
    let existing = '';
    try {
      existing = await fs.readFile(targetPath, 'utf8');
    } catch {
      existing = '';
    }
    const block = codexConfig(token);
    let next;
    if (existing.includes('[mcp_servers.rootly]')) {
      next = existing.replace(/\[mcp_servers\.rootly\][^[]*/, `${block}\n`);
    } else if (existing.trim()) {
      next = `${existing.replace(/\s*$/, '')}\n\n${block}\n`;
    } else {
      next = `${block}\n`;
    }
    await fs.writeFile(targetPath, next, { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(targetPath, 0o600).catch(() => {});
    return { targetPath, backupPath };
  }

  const existing = await readExistingJson(targetPath);
  if (existing.malformed) {
    // Don't clobber a file we can't parse — a hand-edited config with a typo
    // would silently lose all its other MCP servers otherwise. Surface a real
    // error so the caller can tell the user what to do.
    throw new Error(`Existing MCP config at ${targetPath} is not valid JSON — refusing to overwrite. Fix or move the file, then rerun.`);
  }
  const existingConfig = existing.value || {};
  const merged = mergeMcpServers(existingConfig, JSON.parse(configForClient(client, token)));
  // These configs embed the bearer token inline, so restrict to owner read/write
  // (0600) rather than leaving the default world-readable perms. writeFile's mode
  // only applies on create, so chmod afterward to also tighten a pre-existing file.
  await fs.writeFile(targetPath, stringifyConfig(merged), { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(targetPath, 0o600).catch(() => {});
  return { targetPath, backupPath };
}

export function getMcpConfigPath(client) {
  return configFileForClient(client);
}

// Claude Code stores user-scoped (global) MCP servers in ~/.claude.json. The
// supported way to register one is the `claude` CLI, which manages that file
// correctly, rather than hand-editing it.
export function buildClaudeCodeUserCommandArgs(token) {
  return ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'rootly', HOSTED_MCP_URL, '--header', `Authorization: Bearer ${token}`];
}

export function claudeCodeUserCommandDisplay() {
  return `claude mcp add --scope user --transport http rootly ${HOSTED_MCP_URL} --header "Authorization: Bearer <YOUR_ROOTLY_TOKEN>"`;
}

function claudeCliAvailable() {
  try {
    const result = spawnSync('claude', ['--version'], { stdio: 'ignore' });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

export function addClaudeCodeUserScope(token) {
  const display = claudeCodeUserCommandDisplay();

  if (!claudeCliAvailable()) {
    return { ran: false, target: 'user scope (~/.claude.json)', command: display };
  }

  const result = spawnSync('claude', buildClaudeCodeUserCommandArgs(token), { stdio: 'ignore' });
  return { ran: !result.error && result.status === 0, target: 'user scope (~/.claude.json)', command: display };
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

  const existing = await readExistingJson(targetPath);
  if (existing.missing) {
    throw new Error(`Rootly MCP config not found in ${targetPath}`);
  }
  if (existing.malformed) {
    throw new Error(`MCP config at ${targetPath} is not valid JSON — cannot verify.`);
  }
  const config = existing.value || {};
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
