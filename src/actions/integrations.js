import { spawn } from 'node:child_process';

const DEFAULT_APP_BASE_URL = process.env.ROOTLY_APP_URL?.trim() || 'https://rootly.com';

// Vendors that are alert sources deep-link to the "new alert source" form with
// the source type preselected. The values are the Rails STI class names
// (Alerts::<X>Source) the form expects in alerts_source[sourceable_type].
const ALERT_SOURCE_TYPES = {
  Datadog: 'Alerts::DatadogSource',
  Grafana: 'Alerts::GrafanaSource',
  Sentry: 'Alerts::SentrySource'
};

export function webHandoffUrl(kind, appBaseUrl = DEFAULT_APP_BASE_URL) {
  const sourceableType = ALERT_SOURCE_TYPES[kind];
  if (sourceableType) {
    // e.g. /account/alert-sources/new?alerts_source%5Bsourceable_type%5D=Alerts%3A%3ADatadogSource
    return `${appBaseUrl}/account/alert-sources/new?alerts_source%5Bsourceable_type%5D=${encodeURIComponent(sourceableType)}`;
  }

  switch (kind) {
    case 'Slack':
      return `${appBaseUrl}/account/integrations/slack_accounts/landing`;
    case 'Phone':
      // User profile, where phone numbers and notification rules are managed.
      return `${appBaseUrl}/account/profile`;
    case 'PagerDuty':
      // Not an alert source — PagerDuty connects as an escalation integration.
      return `${appBaseUrl}/account/integrations/pagerduty_accounts/new`;
    case 'Opsgenie':
      // Not an alert source — Opsgenie connects as an escalation integration.
      return `${appBaseUrl}/account/integrations/opsgenie_accounts/new`;
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
