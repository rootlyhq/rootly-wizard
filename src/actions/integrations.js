import { spawn } from 'node:child_process';

const DEFAULT_APP_BASE_URL = process.env.ROOTLY_APP_URL?.trim() || 'https://rootly.com';

// Vendor integrations each have a dedicated "new account" page in Rootly web at
// /account/integrations/<vendor>_accounts/new. Datadog/Grafana/Sentry are alert
// sources; PagerDuty/Opsgenie are escalation integrations — but all use the same
// per-vendor integration page (not the generic alert-sources form).
const VENDOR_ACCOUNT_SLUGS = {
  Datadog: 'datadog',
  Grafana: 'grafana',
  Sentry: 'sentry',
  PagerDuty: 'pagerduty',
  Opsgenie: 'opsgenie'
};

export function webHandoffUrl(kind, appBaseUrl = DEFAULT_APP_BASE_URL) {
  const vendorSlug = VENDOR_ACCOUNT_SLUGS[kind];
  if (vendorSlug) {
    return `${appBaseUrl}/account/integrations/${vendorSlug}_accounts/new`;
  }

  switch (kind) {
    case 'Slack':
      return `${appBaseUrl}/account/integrations/slack_accounts/landing`;
    case 'Phone':
      // User profile, where phone numbers and notification rules are managed.
      return `${appBaseUrl}/account/profile`;
    case 'TestPage': {
      // Deep link that opens Rootly's "manual page" modal on the alerts page.
      // Users can trigger a page from the UI when the wizard can't (e.g. an
      // OAuth session that lacks alert-write permission), which routes through
      // the on-call escalation policy and rings the on-call user's phone.
      const modalTarget = `${appBaseUrl}/account/alerts/manual_page_modal`;
      return `${appBaseUrl}/account/alerts?modal=${encodeURIComponent(modalTarget)}`;
    }
    default:
      // The unified alert sources tab — where any alert source is added.
      return `${appBaseUrl}/account/alerts?tab=alert-sources#add-alert-sources-section`;
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
      detectable: kind === 'Slack'
    }
  };
}
