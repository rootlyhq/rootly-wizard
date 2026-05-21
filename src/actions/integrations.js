import { spawn } from 'node:child_process';

const DEFAULT_APP_BASE_URL = process.env.ROOTLY_APP_URL?.trim() || 'https://rootly.com';

export function webHandoffUrl(kind, appBaseUrl = DEFAULT_APP_BASE_URL) {
  switch (kind) {
    case 'Slack':
      return `${appBaseUrl}/account/integrations/slack_accounts/landing`;
    case 'Datadog':
      return `${appBaseUrl}/account/integrations/datadog_accounts/new`;
    case 'Sentry':
      return `${appBaseUrl}/account/integrations/sentry_accounts/new`;
    case 'Grafana':
      return `${appBaseUrl}/account/integrations/grafana_accounts/new`;
    case 'PagerDuty':
      return `${appBaseUrl}/account/integrations/pagerduty_accounts/new`;
    case 'Opsgenie':
      return `${appBaseUrl}/account/integrations/opsgenie_accounts/new`;
    default:
      return `${appBaseUrl}/account/integrations`;
  }
}

export function openUrl(url) {
  const platform = process.platform;

  return new Promise((resolve) => {
    let child;

    if (platform === 'darwin') {
      child = spawn('open', [url], { stdio: 'ignore' });
    } else if (platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true });
    } else {
      child = spawn('xdg-open', [url], { stdio: 'ignore' });
    }

    child.on('error', () => resolve(false));
    child.on('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

export async function startWebHandoffAction({ kind, open = false, appBaseUrl } = {}) {
  const url = webHandoffUrl(kind, appBaseUrl || DEFAULT_APP_BASE_URL);
  const opened = open ? await openUrl(url) : false;

  return {
    ok: true,
    summary: `${kind} setup still uses the Rootly web flow.`,
    data: {
      kind,
      url,
      opened,
      detectable: kind === 'Slack' ? false : false
    }
  };
}
