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

  // OAuth sessions can't assign user_ids/admin_ids — Team/Membership/User are
  // read-only under OAuth scopes, so a create that seeds members is denied. Fall
  // back to a bare create so the team still gets made; schedule ownership and the
  // on-call rotation reference the user directly, so paging still works.
  let payload;
  let membershipSkipped = false;
  try {
    payload = await api.createTeam(attributes);
  } catch (error) {
    const denied = /\b40[134]\b|not found or unauthorized/i.test(error?.message || '');
    if (denied && (attributes.user_ids.length || attributes.admin_ids.length)) {
      payload = await api.createTeam({ name, description });
      membershipSkipped = true;
    } else {
      throw error;
    }
  }
  const teamId = extractTeamId(payload);

  return {
    ok: true,
    summary: membershipSkipped
      ? `Created team ${name} (this sign-in can't add members; add them in the Rootly web app).`
      : `Created team ${name}.`,
    data: {
      id: teamId,
      name,
      description,
      memberIds: membershipSkipped ? [] : memberIds,
      membershipSkipped,
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

export async function createScheduleAction({ teamId, name, handoffTime = '09:00', memberIds = [], reuseByName = false } = {}) {
  const api = await loadApiClient();

  if (reuseByName) {
    try {
      const existing = findByName((await api.listSchedules())?.data, name, teamId, 'owner_group_ids');
      if (existing) {
        return {
          ok: true,
          summary: `Reused existing schedule ${name}.`,
          data: { teamId, scheduleId: existing.id, name, handoffTime, rotationCreated: false, reused: true }
        };
      }
    } catch {
      // If the lookup fails, fall through and create a fresh one.
    }
  }

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

// Find an existing resource for this team by name (case-insensitive). Used to
// keep re-runs idempotent instead of piling up duplicates. `groupKey` names the
// attribute that holds the owning team ids (varies by resource).
function findByName(list, name, teamId, groupKey) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  return (list || []).find((item) => {
    const attrs = item?.attributes || {};
    if (String(attrs.name || '').trim().toLowerCase() !== target) return false;
    if (!teamId) return true;
    const groups = attrs[groupKey];
    // If the resource exposes its owning teams, require a match; otherwise fall
    // back to a name-only match.
    return !Array.isArray(groups) || groups.map(String).includes(String(teamId));
  }) || null;
}

export async function createEscalationPolicyAction({ teamId, name, repeatCount = 1, createDefaultPath = false, scheduleId = null, reuseByName = false } = {}) {
  const api = await loadApiClient();

  if (reuseByName) {
    try {
      const existing = findByName((await api.listEscalationPolicies())?.data, name, teamId, 'group_ids');
      if (existing) {
        return {
          ok: true,
          summary: `Reused existing escalation policy ${name}.`,
          data: { id: existing.id, teamId, name, repeatCount, reused: true, pathCreated: false, pathError: null, levelCreated: false, levelError: null }
        };
      }
    } catch {
      // If the lookup fails, fall through and create a fresh one.
    }
  }

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

export async function createAlertSourceAction({ teamId, name = 'Generic webhook', sourceType = 'generic_webhook', reuseByName = false }) {
  const api = await loadApiClient();

  if (reuseByName) {
    try {
      const existing = findByName((await api.listAlertSources())?.data, name, teamId, 'owner_group_ids');
      if (existing) {
        const attrs = existing.attributes || {};
        return {
          ok: true,
          summary: `Reused existing alert source ${name}.`,
          data: {
            id: existing.id,
            name,
            teamId: teamId || null,
            reused: true,
            webhookEndpoint: attrs.webhook_endpoint || null,
            secret: attrs.secret || null
          }
        };
      }
    } catch {
      // If the lookup fails, fall through and create a fresh one.
    }
  }

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

export async function createStatusPageAction({ title, description, isPublic = false } = {}) {
  const clean = String(title || '').trim();
  if (!clean) {
    return { ok: false, summary: 'A status page title is required.' };
  }

  // The description is internal to Rootly — it tells other admins what the page
  // is for. Default to a clear note when the caller doesn't supply one.
  const cleanDescription = String(description ?? '').trim()
    || 'Created by the Rootly setup wizard.';

  const api = await loadApiClient();
  const payload = await api.createStatusPage({
    title: clean,
    description: cleanDescription,
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
      slug: attributes.slug || null,
      url: attributes.url || attributes.public_url || null
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
