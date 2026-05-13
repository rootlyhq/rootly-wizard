function toIdSet(items = []) {
  return new Set(items.map((item) => item.id));
}

function userTeamIds(userPayload) {
  return userPayload?.data?.relationships?.teams?.data?.map((team) => team.id) || [];
}

function getSlackId(userPayload) {
  return userPayload?.data?.attributes?.slack_id || null;
}

function count(items) {
  return Array.isArray(items) ? items.length : 0;
}

export function detectOnboardingState({ userPayload, teamsPayload, schedulesPayload, escalationPoliciesPayload, authMode = 'stored-token' }) {
  const user = userPayload?.data?.attributes || {};
  const teams = teamsPayload?.data || [];
  const schedules = schedulesPayload?.data || [];
  const escalationPolicies = escalationPoliciesPayload?.data || [];

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const currentUserTeamIds = userTeamIds(userPayload);
  const currentUserTeams = currentUserTeamIds.map((id) => teamsById.get(id)).filter(Boolean);
  const teamsWithSchedules = teams.filter((team) => count(team?.relationships?.schedules?.data) > 0);
  const teamsWithEscalationPolicies = teams.filter((team) => count(team?.relationships?.escalation_policies?.data) > 0);

  const hasTeams = teams.length > 0;
  const hasAnySchedules = schedules.length > 0;
  const hasAnyEscalationPolicies = escalationPolicies.length > 0;
  const hasSlack = Boolean(getSlackId(userPayload));
  const hasUserTeam = currentUserTeams.length > 0;
  const userHasSchedule = currentUserTeams.some((team) => count(team?.relationships?.schedules?.data) > 0);
  const userHasEscalationPolicy = currentUserTeams.some((team) => count(team?.relationships?.escalation_policies?.data) > 0);

  const nextBestAction = !hasUserTeam
    ? 'invite-team-members'
    : !userHasSchedule
      ? 'create-schedule'
      : !userHasEscalationPolicy
        ? 'create-escalation-policy'
        : !hasAnySchedules
          ? 'hook-up-monitor'
          : !hasSlack
            ? 'connect-slack'
            : 'create-test-incident';

  return {
    auth: {
      valid: true,
      mode: authMode
    },
    user: {
      id: userPayload?.data?.id || null,
      email: user.email || null,
      name: user.full_name || user.name || null,
      slackConnected: hasSlack,
      teams: currentUserTeams.map((team) => ({
        id: team.id,
        name: team.attributes?.name,
        slug: team.attributes?.slug
      }))
    },
    teams: {
      total: teams.length,
      userTeams: currentUserTeams.map((team) => ({
        id: team.id,
        name: team.attributes?.name,
        scheduleCount: count(team?.relationships?.schedules?.data),
        escalationPolicyCount: count(team?.relationships?.escalation_policies?.data)
      })),
      hasAnySchedules,
      hasAnyEscalationPolicies,
      teamsWithSchedules: teamsWithSchedules.length,
      teamsWithEscalationPolicies: teamsWithEscalationPolicies.length
    },
    onboarding: {
      completed: nextBestAction === 'create-test-incident' && hasSlack && hasAnySchedules && hasAnyEscalationPolicies,
      nextBestAction,
      steps: {
        inviteTeamMembers: hasUserTeam ? 'done' : 'needed',
        createSchedule: userHasSchedule ? 'done' : 'needed',
        createEscalationPolicy: userHasEscalationPolicy ? 'done' : 'needed',
        hookUpMonitor: hasAnySchedules ? 'maybe-needed' : 'needed',
        testPage: hasAnySchedules ? 'maybe-needed' : 'blocked',
        connectSlack: hasSlack ? 'done' : 'needed',
        createTestIncident: hasSlack ? 'maybe-needed' : 'blocked'
      }
    }
  };
}

