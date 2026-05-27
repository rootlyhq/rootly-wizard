import { extractTeamId, extractUserId, loadApiClient } from '../runtime.js';

function formatError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

export async function createTeamAction({
  name,
  description = 'Created during Rootly setup',
  memberEmails = [],
  enableAlertsAndBroadcast = false
} = {}) {
  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

  const cleanEmails = (memberEmails || []).map((value) => String(value).trim()).filter(Boolean);
  const matchedUsers = [];
  for (const email of cleanEmails) {
    const match = await api.findUserByEmail(email);
    if (match) {
      matchedUsers.push(match);
    }
  }
  const memberIds = matchedUsers
    .map((user) => Number.parseInt(user.id, 10))
    .filter(Number.isFinite);

  const attributes = {
    name,
    description,
    user_ids: [currentUserId, ...memberIds].filter(Boolean),
    admin_ids: [currentUserId].filter(Boolean),
    auto_add_members_when_attached: true
  };

  if (cleanEmails.length) {
    attributes.notify_emails = cleanEmails;
  }

  if (enableAlertsAndBroadcast) {
    attributes.alerts_email_enabled = true;
    attributes.incident_broadcast_enabled = true;
  }

  const payload = await api.createTeam(attributes);

  return {
    ok: true,
    summary: `Created team ${name}.`,
    data: {
      id: extractTeamId(payload),
      name,
      description,
      memberIds,
      matchedUsers: matchedUsers.map((user) => ({ id: user.id, email: user.attributes?.email }))
    }
  };
}

export async function addTeamMembersAction({ teamId, emails }) {
  const api = await loadApiClient();
  const teamsPayload = await api.listTeams();
  const existingTeam = teamsPayload?.data?.find((team) => team?.id === teamId) || null;
  const existingUserIds = Array.isArray(existingTeam?.relationships?.users?.data)
    ? existingTeam.relationships.users.data.map((user) => Number.parseInt(user.id, 10)).filter(Number.isFinite)
    : [];

  const cleanEmails = (emails || []).map((value) => value.trim()).filter(Boolean);
  const resolvedMembers = [];
  for (const email of cleanEmails) {
    const match = await api.findUserByEmail(email);
    if (match) {
      resolvedMembers.push(match);
    }
  }

  const resolvedMemberIds = resolvedMembers
    .map((user) => Number.parseInt(user.id, 10))
    .filter(Number.isFinite);

  await api.updateTeam(teamId, {
    notify_emails: cleanEmails,
    user_ids: [...new Set([...existingUserIds, ...resolvedMemberIds])]
  });

  return {
    ok: true,
    summary: `Updated team ${teamId} membership.`,
    data: {
      teamId,
      requestedEmails: cleanEmails,
      matchedUsers: resolvedMembers.map((user) => ({
        id: user.id,
        email: user.attributes?.email
      }))
    }
  };
}

export async function createScheduleAction({ teamId, name, handoffTime = '09:00', memberIds = [] } = {}) {
  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

  const createdSchedule = await api.createSchedule({
    name,
    description: `Primary schedule for ${teamId}`,
    all_time_coverage: true,
    owner_user_id: currentUserId,
    owner_group_ids: [teamId]
  });

  const scheduleId = createdSchedule?.data?.id || createdSchedule?.id || null;
  if (scheduleId) {
    const rotationMembers = [currentUserId, ...memberIds]
      .filter(Boolean)
      .map((id, index) => ({
        member_type: 'User',
        member_id: id,
        position: index + 1
      }));

    await api.createScheduleRotation(scheduleId, {
      name: `${name} Primary Rotation`,
      schedule_rotationable_type: 'ScheduleDailyRotation',
      schedule_rotationable_attributes: { handoff_time: handoffTime },
      position: 1,
      active_all_week: true,
      time_zone: 'Etc/UTC',
      schedule_rotation_members: rotationMembers
    });
  }

  return {
    ok: true,
    summary: `Created schedule ${name}.`,
    data: {
      teamId,
      scheduleId,
      name,
      handoffTime
    }
  };
}

export async function createEscalationPolicyAction({ teamId, name, repeatCount = 1, createDefaultPath = false } = {}) {
  const api = await loadApiClient();

  const payload = await api.createEscalationPolicy({
    name,
    description: `Default escalation policy for ${teamId}`,
    repeat_count: repeatCount,
    group_ids: [teamId],
    service_ids: []
  });

  const policyId = payload?.data?.id || payload?.id || null;

  let pathCreated = false;
  if (createDefaultPath && policyId) {
    await api.createEscalationPath(policyId, {
      name: `${name} Path`,
      notification_type: 'audible',
      path_type: 'escalation',
      default: true,
      match_mode: 'match-all-rules',
      position: 1,
      repeat: false,
      initial_delay: 0,
      rules: [{ rule_type: 'alert_urgency', urgency_ids: [] }]
    });
    pathCreated = true;
  }

  return {
    ok: true,
    summary: `Created escalation policy ${name}.`,
    data: {
      id: policyId,
      teamId,
      name,
      repeatCount,
      pathCreated
    }
  };
}

export async function createAlertSourceAction({ teamId, name = 'Generic webhook', sourceType = 'webhook' }) {
  const api = await loadApiClient();

  const payload = await api.createAlertSource({
    name,
    source_type: sourceType,
    owner_group_ids: teamId ? [teamId] : [],
    sourceable_attributes: {
      auto_resolve: false,
      accept_threaded_emails: false
    }
  });

  const attributes = payload?.data?.attributes || {};

  return {
    ok: true,
    summary: `Created alert source ${name}.`,
    data: {
      id: payload?.data?.id || null,
      name,
      teamId: teamId || null,
      webhookEndpoint: attributes.webhook_endpoint || null,
      secret: attributes.secret || null
    }
  };
}

export function serializeActionError(error, fallbackSummary) {
  return {
    ok: false,
    summary: fallbackSummary,
    error: formatError(error)
  };
}
