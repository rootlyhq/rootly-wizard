import { extractTeamId, extractUserId, loadApiClient } from '../runtime.js';

function formatError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

export async function createTeamAction({ name, description = 'Created during Rootly setup' }) {
  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

  const payload = await api.createTeam({
    name,
    description,
    user_ids: [currentUserId].filter(Boolean),
    admin_ids: [currentUserId].filter(Boolean),
    auto_add_members_when_attached: true
  });

  return {
    ok: true,
    summary: `Created team ${name}.`,
    data: {
      id: extractTeamId(payload),
      name,
      description
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

export async function createScheduleAction({ teamId, name, handoffTime = '09:00' }) {
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
    await api.createScheduleRotation(scheduleId, {
      name: `${name} Primary Rotation`,
      schedule_rotationable_type: 'ScheduleDailyRotation',
      schedule_rotationable_attributes: { handoff_time: handoffTime },
      position: 1,
      active_all_week: true,
      time_zone: 'Etc/UTC',
      schedule_rotation_members: currentUserId ? [{
        member_type: 'User',
        member_id: currentUserId,
        position: 1
      }] : []
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

export async function createEscalationPolicyAction({ teamId, name, repeatCount = 1 }) {
  const api = await loadApiClient();

  const payload = await api.createEscalationPolicy({
    name,
    description: `Default escalation policy for ${teamId}`,
    repeat_count: repeatCount,
    group_ids: [teamId],
    service_ids: []
  });

  return {
    ok: true,
    summary: `Created escalation policy ${name}.`,
    data: {
      id: payload?.data?.id || payload?.id || null,
      teamId,
      name,
      repeatCount
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
