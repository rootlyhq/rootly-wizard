import { extractTeamId, extractUserId, isServiceAccount, loadApiClient } from '../runtime.js';

function formatError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

function isUsersLookupUnavailable(error) {
  const message = error?.message || '';
  return message.includes('/v1/users') && message.includes('404');
}

export async function createTeamAction({
  name,
  description = 'Created during Rootly setup',
  memberEmails = [],
  enableAlertsAndBroadcast = false
} = {}) {
  const api = await loadApiClient();

  const cleanEmails = (memberEmails || []).map((value) => String(value).trim()).filter(Boolean);
  const matchedUsers = [];
  let userLookupUnavailable = false;
  for (const email of cleanEmails) {
    try {
      const match = await api.findUserByEmail(email);
      if (match) {
        matchedUsers.push(match);
      }
    } catch (error) {
      if (isUsersLookupUnavailable(error)) {
        userLookupUnavailable = true;
        break;
      }

      throw error;
    }
  }
  const memberIds = matchedUsers.map((user) => String(user.id)).filter(Boolean);

  const attributes = {
    name,
    description
  };

  if (cleanEmails.length) {
    attributes.notify_emails = cleanEmails;
  }

  if (enableAlertsAndBroadcast) {
    attributes.alerts_email_enabled = true;
    attributes.incident_broadcast_enabled = true;
  }

  const payload = await api.createTeam(attributes);
  const teamId = extractTeamId(payload);

  if (teamId && memberIds.length && !userLookupUnavailable) {
    const existingUserIds = Array.isArray(payload?.data?.relationships?.users?.data)
      ? payload.data.relationships.users.data.map((user) => String(user.id)).filter(Boolean)
      : [];

    await api.updateTeam(teamId, {
      notify_emails: cleanEmails,
      user_ids: [...new Set([...existingUserIds, ...memberIds])]
    });
  }

  return {
    ok: true,
    summary: `Created team ${name}.`,
    data: {
      id: teamId,
      name,
      description,
      memberIds,
      userLookupUnavailable,
      matchedUsers: matchedUsers.map((user) => ({
        id: user.id,
        email: user.attributes?.email || null,
        name: user.attributes?.full_name || user.attributes?.name || null
      }))
    }
  };
}

export async function addTeamMembersAction({ teamId, emails }) {
  const api = await loadApiClient();
  const teamsPayload = await api.listTeams();
  const existingTeam = teamsPayload?.data?.find((team) => team?.id === teamId) || null;
  const existingUserIds = Array.isArray(existingTeam?.relationships?.users?.data)
    ? existingTeam.relationships.users.data.map((user) => String(user.id)).filter(Boolean)
    : [];

  console.log(`[debug:add-team-members] teamId=${teamId}`);
  console.log(`[debug:add-team-members] existingUserIds=${JSON.stringify(existingUserIds)}`);

  const cleanEmails = (emails || []).map((value) => value.trim()).filter(Boolean);
  const resolvedMembers = [];
  let userLookupUnavailable = false;
  for (const email of cleanEmails) {
    try {
      const match = await api.findUserByEmail(email);
      if (match) {
        resolvedMembers.push(match);
      }
    } catch (error) {
      if (isUsersLookupUnavailable(error)) {
        userLookupUnavailable = true;
        break;
      }

      throw error;
    }
  }

  console.log(`[debug:add-team-members] requestedEmails=${JSON.stringify(cleanEmails)}`);
  console.log(`[debug:add-team-members] userLookupUnavailable=${userLookupUnavailable}`);
  console.log(
    `[debug:add-team-members] resolvedMembers=${JSON.stringify(
      resolvedMembers.map((user) => ({
        id: String(user.id),
        email: user.attributes?.email || null,
        name: user.attributes?.full_name || user.attributes?.name || null
      }))
    )}`
  );

  const resolvedMemberIds = resolvedMembers.map((user) => String(user.id)).filter(Boolean);

  const attributes = {
    notify_emails: cleanEmails
  };

  if (!userLookupUnavailable) {
    attributes.user_ids = [...new Set([...existingUserIds, ...resolvedMemberIds])];
  }

  console.log(`[debug:add-team-members] updateAttributes=${JSON.stringify(attributes)}`);
  const updatePayload = await api.updateTeam(teamId, attributes);
  const returnedUserIds = Array.isArray(updatePayload?.data?.relationships?.users?.data)
    ? updatePayload.data.relationships.users.data.map((user) => String(user.id)).filter(Boolean)
    : [];
  const returnedNotifyEmails = Array.isArray(updatePayload?.data?.attributes?.notify_emails)
    ? updatePayload.data.attributes.notify_emails
    : [];

  console.log(`[debug:add-team-members] returnedUserIds=${JSON.stringify(returnedUserIds)}`);
  console.log(`[debug:add-team-members] returnedNotifyEmails=${JSON.stringify(returnedNotifyEmails)}`);

  return {
    ok: true,
    summary: userLookupUnavailable
      ? `Attached emails to team ${teamId}, but could not resolve Rootly users with this auth session.`
      : `Updated team ${teamId} membership.`,
    data: {
      teamId,
      requestedEmails: cleanEmails,
      userLookupUnavailable,
      existingUserIds,
      resolvedMemberIds,
      returnedUserIds,
      returnedNotifyEmails,
      matchedUsers: resolvedMembers.map((user) => ({
        id: user.id,
        email: user.attributes?.email || null,
        name: user.attributes?.full_name || user.attributes?.name || null
      }))
    }
  };
}

export async function createScheduleAction({ teamId, name, handoffTime = '09:00', memberIds = [] } = {}) {
  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);

  const selfId = currentUserId && !isServiceAccount(currentUser) ? currentUserId : null;

  // Rootly requires a schedule owner (a user-less API key is rejected without
  // one). Prefer a real human — the signed-in user, else the first invited
  // member — and only fall back to the current identity when none exists.
  const ownerUserId = selfId || memberIds[0] || currentUserId;

  const scheduleAttributes = {
    name,
    description: `Primary schedule for ${teamId}`,
    all_time_coverage: true,
    owner_group_ids: [teamId],
    owner_user_id: ownerUserId
  };

  const createdSchedule = await api.createSchedule(scheduleAttributes);
  const scheduleId = createdSchedule?.data?.id || createdSchedule?.id || null;

  // The rotation is exactly the members the caller chose; fall back to the
  // signed-in user only when none were given. The service account is never
  // placed on the rotation, and an empty rotation is skipped entirely.
  const explicitMembers = (memberIds || []).map((id) => String(id)).filter(Boolean);
  const rotationMemberIds = explicitMembers.length
    ? [...new Set(explicitMembers)]
    : (selfId ? [String(selfId)] : []);
  let rotationCreated = false;
  if (scheduleId && rotationMemberIds.length) {
    await api.createScheduleRotation(scheduleId, {
      name: `${name} Primary Rotation`,
      schedule_rotationable_type: 'ScheduleDailyRotation',
      schedule_rotationable_attributes: { handoff_time: handoffTime },
      position: 1,
      active_all_week: true,
      time_zone: 'Etc/UTC',
      schedule_rotation_members: rotationMemberIds.map((id, index) => ({
        member_type: 'User',
        member_id: id,
        position: index + 1
      }))
    });
    rotationCreated = true;
  }

  return {
    ok: true,
    summary: `Created schedule ${name}.`,
    data: {
      teamId,
      scheduleId,
      name,
      handoffTime,
      rotationCreated
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

  // The default path is best-effort: a path failure must not discard the
  // already-created policy (which would orphan it), so it is caught here.
  let pathCreated = false;
  let pathError = null;
  if (createDefaultPath && policyId) {
    try {
      await api.createEscalationPath(policyId, {
        name: `${name} Path`,
        notification_type: 'audible',
        path_type: 'escalation',
        default: true,
        match_mode: 'match-all-rules',
        position: 1,
        repeat: false,
        initial_delay: 0,
        rules: []
      });
      pathCreated = true;
    } catch (error) {
      pathError = formatError(error);
    }
  }

  return {
    ok: true,
    summary: `Created escalation policy ${name}.`,
    data: {
      id: policyId,
      teamId,
      name,
      repeatCount,
      pathCreated,
      pathError
    }
  };
}

export async function createAlertSourceAction({ teamId, name = 'Generic webhook', sourceType = 'generic_webhook' }) {
  const api = await loadApiClient();

  const payload = await api.createAlertSource({
    name,
    source_type: sourceType,
    owner_group_ids: teamId ? [teamId] : [],
    sourceable_attributes: {
      auto_resolve: false
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
