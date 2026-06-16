import { loadApiClient } from '../runtime.js';

function cleanIds(values = []) {
  return values.map((value) => String(value).trim()).filter(Boolean);
}

export async function createTestAlertAction({
  summary,
  description = '',
  groupIds = [],
  serviceIds = [],
  environmentIds = [],
  // When a notification target is given (e.g. an escalation policy), the alert
  // is triggered against it so it actually pages the on-call person.
  notificationTargetType = null,
  notificationTargetId = null,
  urgencyId = null,
  source = 'api',
  // When true (and no explicit target is given), resolve the team's escalation
  // policy + High urgency and page it — so a standalone test alert reaches the
  // on-call person, like Quick start does.
  page = false
} = {}) {
  const api = await loadApiClient();
  const attributes = {
    summary,
    source
  };

  const cleanedDescription = String(description || '').trim();
  const cleanedGroupIds = cleanIds(groupIds);
  const cleanedServiceIds = cleanIds(serviceIds);
  const cleanedEnvironmentIds = cleanIds(environmentIds);

  if (page && !notificationTargetType && cleanedGroupIds.length) {
    try {
      const policies = (await api.listEscalationPolicies())?.data || [];
      const teamId = cleanedGroupIds[0];
      const policy = policies.find((p) => {
        const g = p?.attributes?.group_ids;
        return Array.isArray(g) && g.map(String).includes(teamId);
      }) || (policies.length === 1 ? policies[0] : null);
      if (policy) {
        notificationTargetType = 'EscalationPolicy';
        notificationTargetId = policy.id;
        if (!urgencyId) {
          const urgencies = (await api.listAlertUrgencies())?.data || [];
          urgencyId = (urgencies.find((u) => /high/i.test(u?.attributes?.name || '')) || urgencies[0])?.id || null;
        }
      }
    } catch {
      // best-effort; fall back to a passive (non-paging) alert.
    }
  }

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

  // Page a target (escalation policy / schedule / user / group) so the alert
  // escalates to whoever is on call and notifies them.
  const paged = Boolean(notificationTargetType && notificationTargetId);
  if (paged) {
    attributes.notification_target_type = notificationTargetType;
    attributes.notification_target_id = String(notificationTargetId);
    attributes.status = 'triggered';
  }
  if (urgencyId) {
    attributes.alert_urgency_id = String(urgencyId);
  }

  const payload = await api.createAlert(attributes);

  return {
    ok: true,
    summary: `Created test alert ${summary}.`,
    data: {
      id: payload?.data?.id || null,
      summary,
      description: cleanedDescription,
      paged,
      notificationTargetType: paged ? notificationTargetType : null
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
