import { getActiveToken, extractUserId, isServiceAccount, loadApiClient, loadOnboardingState } from '../runtime.js';

function userLabel(record) {
  const a = record?.attributes || record?.data?.attributes || {};
  const name = a.full_name || a.name || null;
  const id = extractUserId(record);
  return name ? (a.email ? `${name} — ${a.email}` : name) : (a.email || (id ? `User ${id}` : 'the signed-in user'));
}

// Who should hold the phone and be paged. A human sign-in (browser/OAuth or a
// personal token) pages itself. An API key authenticates as a service-account
// bot that can't receive a page, so resolve a real human instead:
//   - exactly one human  -> use them automatically
//   - none               -> fall back to the bot (nothing better to page)
//   - several            -> the caller must pick (candidates returned)
export async function getPagingTargetAction() {
  const token = await getActiveToken();
  if (!token) {
    return { ok: false, code: 'NO_AUTH', summary: 'No auth context found.', data: null };
  }
  const api = await loadApiClient();
  const me = await api.getCurrentUser();
  const meId = extractUserId(me);
  if (!isServiceAccount(me)) {
    return { ok: true, summary: 'Paging self.', data: { id: meId ? String(meId) : null, label: userLabel(me), mode: 'self', serviceAccount: false } };
  }
  let humans = [];
  try {
    humans = (await api.listAllUsers()).filter((u) => !isServiceAccount(u));
  } catch {
    // best-effort; treat as no reachable humans.
  }
  if (humans.length === 1) {
    return { ok: true, summary: 'Auto-selected the only human.', data: { id: String(extractUserId(humans[0])), label: userLabel(humans[0]), mode: 'auto-human', serviceAccount: true } };
  }
  if (humans.length === 0) {
    return { ok: true, summary: 'No human users; falling back to the service account.', data: { id: meId ? String(meId) : null, label: userLabel(me), mode: 'bot-fallback', serviceAccount: true } };
  }
  return { ok: true, summary: 'Multiple humans; pick one.', data: { mode: 'pick', serviceAccount: true, candidates: humans.map((h) => ({ id: String(extractUserId(h)), label: userLabel(h) })) } };
}

// Services + functionalities a status page can show as components. Values are
// encoded "service:<id>" / "functionality:<id>" so the picker can split them.
export async function getStatusPageComponentsAction() {
  const api = await loadApiClient();
  const [services, functionalities] = await Promise.all([
    api.listServices().catch(() => ({ data: [] })),
    api.listFunctionalities().catch(() => ({ data: [] }))
  ]);
  const components = [
    ...((services?.data) || []).map((s) => ({ label: `${s.attributes?.name || s.id} · service`, value: `service:${s.id}` })),
    ...((functionalities?.data) || []).map((f) => ({ label: `${f.attributes?.name || f.id} · functionality`, value: `functionality:${f.id}` }))
  ];
  return { ok: true, data: { components } };
}

// Create a custom status-page component. A typed-in component becomes a new
// Service (each service carries its own operational status, so it renders as a
// component on the public page), then gets added to the page by id. Returns the
// encoded component for the picker.
export async function createCustomComponentAction({ name }) {
  const clean = String(name || '').trim();
  if (!clean) {
    return { ok: false, summary: 'A component name is required.' };
  }
  const api = await loadApiClient();
  const payload = await api.createService({ name: clean });
  const id = payload?.data?.id;
  if (!id) {
    return { ok: false, summary: 'Rootly did not return the new component.' };
  }
  return {
    ok: true,
    data: {
      id,
      name: payload?.data?.attributes?.name || clean,
      component: { label: `${payload?.data?.attributes?.name || clean} · service`, value: `service:${id}` }
    }
  };
}

export async function getStatusAction() {
  const state = await loadOnboardingState();
  if (!state) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: 'No auth context found.',
      data: null
    };
  }

  return {
    ok: true,
    summary: 'Loaded workspace status.',
    data: {
      nextBestAction: state.onboarding.nextBestAction,
      workspace: state.teams.workspace?.name || state.teams.workspace?.slug || 'Connected Rootly account',
      teams: state.teams.total,
      teamsWithMembers: state.teams.teamsWithMembers,
      teamsWithSchedules: state.teams.teamsWithSchedules,
      teamsWithEscalationPolicies: state.teams.teamsWithEscalationPolicies,
      teamsWithSlackSignals: state.teams.teamsWithSlack,
      readiness: state.onboarding.readiness
    }
  };
}

export async function getReadinessAction() {
  const state = await loadOnboardingState();
  if (!state) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: 'No auth context found.',
      data: null
    };
  }

  return {
    ok: true,
    summary: 'Loaded onboarding readiness.',
    data: {
      nextBestAction: state.onboarding.nextBestAction,
      workspace: state.teams.workspace,
      onboarding: state.onboarding,
      teams: state.teams
    }
  };
}

export async function getTeamsAction() {
  const state = await loadOnboardingState();
  if (!state) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: 'No auth context found.',
      data: null
    };
  }

  return {
    ok: true,
    summary: 'Loaded teams.',
    data: {
      workspace: state.teams.workspace,
      summary: {
        total: state.teams.total,
        teamsWithMembers: state.teams.teamsWithMembers,
        teamsWithSchedules: state.teams.teamsWithSchedules,
        teamsWithEscalationPolicies: state.teams.teamsWithEscalationPolicies,
        teamsWithSlackSignals: state.teams.teamsWithSlack
      },
      teams: state.teams.all
    }
  };
}

export async function getSchedulesAction() {
  const token = await getActiveToken();
  if (!token) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: 'No auth context found.',
      data: null
    };
  }

  const api = await loadApiClient();
  const schedulesPayload = await api.listSchedules();
  const schedules = schedulesPayload?.data || [];

  return {
    ok: true,
    summary: 'Loaded schedules.',
    data: {
      summary: {
        total: schedules.length,
        schedulesWithCoverage: schedules.filter((schedule) => schedule?.attributes?.all_time_coverage).length,
        schedulesWithTeams: schedules.filter((schedule) =>
          Array.isArray(schedule?.attributes?.owner_group_ids) && schedule.attributes.owner_group_ids.length > 0
        ).length
      },
      schedules
    }
  };
}

export async function getEscalationPoliciesAction() {
  const token = await getActiveToken();
  if (!token) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: 'No auth context found.',
      data: null
    };
  }

  const api = await loadApiClient();
  const policiesPayload = await api.listEscalationPolicies();
  const policies = policiesPayload?.data || [];

  return {
    ok: true,
    summary: 'Loaded escalation policies.',
    data: {
      summary: {
        total: policies.length,
        policiesWithTeams: policies.filter((policy) =>
          Array.isArray(policy?.attributes?.group_ids) && policy.attributes.group_ids.length > 0
        ).length,
        repeatingPolicies: policies.filter((policy) => (policy?.attributes?.repeat_count ?? 0) > 0).length
      },
      policies
    }
  };
}

async function listResourceAction(method, label, mapItem) {
  const token = await getActiveToken();
  if (!token) {
    return {
      ok: false,
      code: 'NO_AUTH',
      summary: 'No auth context found.',
      data: null
    };
  }

  const api = await loadApiClient();
  const payload = await api[method]();
  const items = (payload?.data || []).map(mapItem);

  return {
    ok: true,
    summary: `Loaded ${label}.`,
    data: { total: items.length, items }
  };
}

export async function getTeamMembersAction({ teamId } = {}) {
  const token = await getActiveToken();
  if (!token) {
    return { ok: false, code: 'NO_AUTH', summary: 'No auth context found.', data: null };
  }

  const api = await loadApiClient();
  const payload = await api.getTeam(teamId);
  const team = payload?.data;
  const usersById = new Map((payload?.included || [])
    .filter((record) => record.type === 'users')
    .map((record) => [record.id, record]));

  const members = (team?.relationships?.users?.data || []).map(({ id }) => {
    const record = usersById.get(id);
    return {
      id,
      email: record?.attributes?.email || null,
      name: record?.attributes?.full_name || record?.attributes?.name || null,
      serviceAccount: isServiceAccount(record)
    };
  });

  return {
    ok: true,
    summary: `Loaded members for team ${teamId}.`,
    data: {
      teamId,
      teamName: team?.attributes?.name || teamId,
      total: members.length,
      members
    }
  };
}

function usersLookupUnavailable(error) {
  const message = error?.message || '';
  return message.includes('/v1/users') && message.includes('404');
}


export async function getAddableTeamMembersAction({ teamId } = {}) {
  const token = await getActiveToken();
  if (!token) {
    return { ok: false, code: 'NO_AUTH', summary: 'No auth context found.', data: null };
  }

  const api = await loadApiClient();
  const teamPayload = await api.getTeam(teamId);
  const existing = new Set((teamPayload?.data?.attributes?.user_ids || []).map((id) => String(id)));

  // Some sign-ins (notably limited OAuth sessions) cannot read /v1/users.
  // Surface that as a flag so the caller can fall back to inviting by email.
  let allUsers = [];
  let userLookupUnavailable = false;
  try {
    allUsers = await api.listAllUsers();
  } catch (error) {
    if (usersLookupUnavailable(error)) {
      userLookupUnavailable = true;
    } else {
      throw error;
    }
  }

  const addable = allUsers
    .filter((record) => !isServiceAccount(record))
    .map((record) => ({
      id: String(record.id),
      name: record?.attributes?.full_name || record?.attributes?.name || null,
      email: record?.attributes?.email || null
    }))
    .filter((user) => !existing.has(user.id));

  return {
    ok: true,
    summary: `Loaded addable members for team ${teamId}.`,
    data: {
      teamId,
      teamName: teamPayload?.data?.attributes?.name || teamId,
      total: addable.length,
      addable,
      userLookupUnavailable
    }
  };
}

const byName = (record) => ({
  id: record.id,
  name: record?.attributes?.name || record?.attributes?.slug || record.id
});

export const getServicesAction = () => listResourceAction('listServices', 'services', byName);
export const getSeveritiesAction = () => listResourceAction('listSeverities', 'severities', byName);
export const getEnvironmentsAction = () => listResourceAction('listEnvironments', 'environments', byName);
export const getIncidentTypesAction = () => listResourceAction('listIncidentTypes', 'incident types', byName);
export const getUsersAction = () => listResourceAction('listUsers', 'users', (record) => ({
  id: record.id,
  email: record?.attributes?.email || null,
  name: record?.attributes?.full_name || record?.attributes?.name || null
}));
