import test from 'node:test';
import assert from 'node:assert/strict';
import { webHandoffUrl } from '../src/actions/integrations.js';

test('webHandoffUrl(TestPage) opens the manual-page modal on the alerts page', () => {
  const url = webHandoffUrl('TestPage', 'https://rootly.com');
  assert.equal(
    url,
    'https://rootly.com/account/alerts?modal=https%3A%2F%2Frootly.com%2Faccount%2Falerts%2Fmanual_page_modal'
  );
});

test('webHandoffUrl(TestPage) respects a custom app base URL', () => {
  const url = webHandoffUrl('TestPage', 'https://staging.rootly.com');
  assert.equal(
    url,
    'https://staging.rootly.com/account/alerts?modal=https%3A%2F%2Fstaging.rootly.com%2Faccount%2Falerts%2Fmanual_page_modal'
  );
});

test('webHandoffUrl still routes known kinds correctly', () => {
  assert.equal(
    webHandoffUrl('Slack', 'https://rootly.com'),
    'https://rootly.com/account/integrations/slack_accounts/landing'
  );
  assert.equal(
    webHandoffUrl('Phone', 'https://rootly.com'),
    'https://rootly.com/account/profile'
  );
});

test('vendor alert sources deep-link to their per-vendor integration page', () => {
  const cases = {
    Datadog: 'https://rootly.com/account/integrations/datadog_accounts/new',
    Grafana: 'https://rootly.com/account/integrations/grafana_accounts/new',
    Sentry: 'https://rootly.com/account/integrations/sentry_accounts/new',
    PagerDuty: 'https://rootly.com/account/integrations/pagerduty_accounts/new',
    Opsgenie: 'https://rootly.com/account/integrations/opsgenie_accounts/new'
  };
  for (const [kind, expected] of Object.entries(cases)) {
    assert.equal(webHandoffUrl(kind, 'https://rootly.com'), expected);
  }
});
