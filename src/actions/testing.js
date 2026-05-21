import { loadApiClient } from '../runtime.js';
import { webHandoffUrl } from './integrations.js';

function cleanIds(values = []) {
  return values.map((value) => String(value).trim()).filter(Boolean);
}

export async function createTestAlertAction({
  summary,
  description = '',
  groupIds = [],
  serviceIds = [],
  environmentIds = []
} = {}) {
  const api = await loadApiClient();
  const attributes = {
    summary
  };

  const cleanedDescription = String(description || '').trim();
  const cleanedGroupIds = cleanIds(groupIds);
  const cleanedServiceIds = cleanIds(serviceIds);
  const cleanedEnvironmentIds = cleanIds(environmentIds);

  if (cleanedDescription) {
    attributes.description = cleanedDescription;
  }

  if (cleanedGroupIds.length) {
    attributes.group_ids = cleanedGroupIds;
  }

  if (cleanedServiceIds.length) {
    attributes.service_ids = cleanedServiceIds;
  }

  if (cleanedEnvironmentIds.length) {
    attributes.environment_ids = cleanedEnvironmentIds;
  }

  const payload = await api.createAlert(attributes);

  return {
    ok: true,
    summary: `Created test alert ${summary}.`,
    data: {
      id: payload?.data?.id || null,
      summary,
      description: cleanedDescription
    }
  };
}

export async function createTestIncidentAction({
  title,
  summary = '',
  groupIds = [],
  serviceIds = [],
  environmentIds = [],
  incidentTypeIds = [],
  severityId = null,
  isPrivate = false
} = {}) {
  const api = await loadApiClient();

  const attributes = {
    title,
    kind: 'normal',
    private: isPrivate,
    summary,
    group_ids: cleanIds(groupIds),
    service_ids: cleanIds(serviceIds),
    environment_ids: cleanIds(environmentIds),
    incident_type_ids: cleanIds(incidentTypeIds)
  };

  if (severityId) {
    attributes.severity_id = String(severityId).trim();
  }

  const payload = await api.createIncident(attributes);
  const responseAttributes = payload?.data?.attributes || {};

  return {
    ok: true,
    summary: `Created test incident ${title}.`,
    data: {
      id: payload?.data?.id || null,
      title,
      summary,
      slackChannelName: responseAttributes.slack_channel_name || null,
      slackChannelUrl: responseAttributes.slack_channel_url || null,
      slackDeepLink: responseAttributes.slack_channel_deep_link || null
    }
  };
}

export async function getSlackTestGuidanceAction() {
  return {
    ok: true,
    summary: 'Slack test still uses Rootly and Slack directly.',
    data: {
      slackSetupUrl: webHandoffUrl('Slack'),
      suggestedCommands: ['/rootly new', '/rootly help'],
      notes: [
        'The wizard does not post a Slack message directly.',
        'Use the Slack integration flow in Rootly, then create a test incident or use /rootly new in Slack.'
      ]
    }
  };
}
