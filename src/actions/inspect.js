import { getActiveToken, isServiceAccount, loadApiClient, loadOnboardingState } from '../runtime.js';

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

export async function getDirectoryUsersAction() {
  const token = await getActiveToken();
  if (!token) {
    return { ok: false, code: 'NO_AUTH', summary: 'No auth context found.', data: null };
  }

  const api = await loadApiClient();

  // Limited OAuth sessions can't read /v1/users; flag that so the caller can
  // fall back gracefully instead of failing.
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

  const users = allUsers
    .filter((record) => !isServiceAccount(record))
    .map((record) => ({
      id: String(record.id),
      name: record?.attributes?.full_name || record?.attributes?.name || null,
      email: record?.attributes?.email || null
    }));

  return {
    ok: true,
    summary: `Loaded ${users.length} directory user(s).`,
    data: { total: users.length, users, userLookupUnavailable }
  };
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
