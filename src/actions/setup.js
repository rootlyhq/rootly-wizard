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

  // Seed the signed-in human as the team's first member + admin. A user-less
  // API key authenticates as a service account, which we never seed.
  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);
  const selfSeed = currentUserId && !isServiceAccount(currentUser) ? [String(currentUserId)] : [];

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
  const memberIds = matchedUsers.map((user) => Number(user.id)).filter((id) => Number.isFinite(id));

  const attributes = {
    name,
    description,
    user_ids: [...selfSeed, ...memberIds],
    admin_ids: [...selfSeed],
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
  const teamId = extractTeamId(payload);

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

  // Current membership lives on the team's attributes.user_ids (integers).
  const teamPayload = await api.getTeam(teamId);
  const teamAttributes = teamPayload?.data?.attributes || {};
  const existingUserIds = (Array.isArray(teamAttributes.user_ids) ? teamAttributes.user_ids : [])
    .map((id) => String(id))
    .filter(Boolean);
  const existingNotifyEmails = Array.isArray(teamAttributes.notify_emails) ? teamAttributes.notify_emails : [];

  const cleanEmails = (emails || []).map((value) => value.trim()).filter(Boolean);
  const resolvedMembers = [];
  const unresolvedEmails = [];
  let userLookupUnavailable = false;
  for (const email of cleanEmails) {
    try {
      const match = await api.findUserByEmail(email);
      if (match) {
        resolvedMembers.push(match);
      } else {
        unresolvedEmails.push(email);
      }
    } catch (error) {
      if (isUsersLookupUnavailable(error)) {
        userLookupUnavailable = true;
        break;
      }

      throw error;
    }
  }

  const resolvedMemberIds = resolvedMembers.map((user) => String(user.id)).filter(Boolean);

  const attributes = {};
  if (userLookupUnavailable) {
    // No user lookup in this session — fall back to attaching every email as a contact.
    attributes.notify_emails = [...new Set([...existingNotifyEmails, ...cleanEmails])];
  } else {
    // Resolved people become real team members; only unmatched emails stay as contacts.
    attributes.user_ids = [...new Set([...existingUserIds, ...resolvedMemberIds])];
    if (unresolvedEmails.length) {
      attributes.notify_emails = [...new Set([...existingNotifyEmails, ...unresolvedEmails])];
    }
  }

  // The PUT response echoes attributes.user_ids, so read membership back to confirm.
  const updatePayload = await api.updateTeam(teamId, attributes);
  const updatedAttributes = updatePayload?.data?.attributes || {};
  const memberUserIds = (Array.isArray(updatedAttributes.user_ids) ? updatedAttributes.user_ids : existingUserIds)
    .map((id) => String(id))
    .filter(Boolean);
  const addedMemberIds = resolvedMemberIds.filter((id) => !existingUserIds.includes(id));

  return {
    ok: true,
    summary: userLookupUnavailable
      ? `Attached ${cleanEmails.length} email(s) to team ${teamId} as contacts (could not resolve Rootly users with this auth session).`
      : `Added ${addedMemberIds.length} member(s) to team ${teamId}.`,
    data: {
      teamId,
      requestedEmails: cleanEmails,
      userLookupUnavailable,
      addedMemberIds,
      memberUserIds,
      unresolvedEmails,
      matchedUsers: resolvedMembers.map((user) => ({
        id: String(user.id),
        email: user.attributes?.email || null,
        name: user.attributes?.full_name || user.attributes?.name || null
      }))
    }
  };
}

export async function addTeamMembersByIdsAction({ teamId, userIds = [] } = {}) {
  const api = await loadApiClient();

  const teamPayload = await api.getTeam(teamId);
  const existingUserIds = (Array.isArray(teamPayload?.data?.attributes?.user_ids)
    ? teamPayload.data.attributes.user_ids
    : []).map((id) => String(id)).filter(Boolean);

  const selectedIds = (userIds || []).map((id) => String(id)).filter(Boolean);
  const addedMemberIds = selectedIds.filter((id) => !existingUserIds.includes(id));
  const nextUserIds = [...new Set([...existingUserIds, ...selectedIds])];

  const updatePayload = await api.updateTeam(teamId, { user_ids: nextUserIds });
  const memberUserIds = (Array.isArray(updatePayload?.data?.attributes?.user_ids)
    ? updatePayload.data.attributes.user_ids
    : nextUserIds).map((id) => String(id)).filter(Boolean);

  return {
    ok: true,
    summary: `Added ${addedMemberIds.length} member(s) to team ${teamId}.`,
    data: { teamId, addedMemberIds, memberUserIds }
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

export async function createEscalationPolicyAction({ teamId, name, repeatCount = 1, createDefaultPath = false, scheduleId = null } = {}) {
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
  let pathId = null;
  if (createDefaultPath && policyId) {
    try {
      const pathPayload = await api.createEscalationPath(policyId, {
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
      pathId = pathPayload?.data?.id || null;
      pathCreated = true;
    } catch (error) {
      pathError = formatError(error);
    }
  }

  // Add a level that pages the on-call person from the schedule, so a triggered
  // alert actually reaches someone (audible → their call/SMS notification rules).
  let levelCreated = false;
  let levelError = null;
  if (scheduleId && policyId) {
    try {
      await api.createEscalationLevel(policyId, {
        position: 1,
        ...(pathId ? { escalation_policy_path_id: pathId } : {}),
        notification_target_params: [{ id: scheduleId, type: 'schedule' }],
        paging_strategy_configuration_schedule_strategy: 'on_call_only'
      });
      levelCreated = true;
    } catch (error) {
      levelError = formatError(error);
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
      pathError,
      levelCreated,
      levelError
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

export async function createStatusPageAction({ title, isPublic = false } = {}) {
  const clean = String(title || '').trim();
  if (!clean) {
    return { ok: false, summary: 'A status page title is required.' };
  }

  const api = await loadApiClient();
  const payload = await api.createStatusPage({
    title: clean,
    public: Boolean(isPublic),
    enabled: true
  });
  const attributes = payload?.data?.attributes || {};

  return {
    ok: true,
    summary: `Created ${isPublic ? 'public' : 'internal'} status page ${clean}.`,
    data: {
      id: payload?.data?.id || null,
      title: clean,
      public: Boolean(attributes.public),
      url: attributes.url || attributes.public_url || attributes.slug || null
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
