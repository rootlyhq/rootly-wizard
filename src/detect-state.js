function toIdSet(items = []) {
  return new Set(items.map((item) => item.id));
}

function userTeamIds(userPayload) {
  return userPayload?.data?.relationships?.teams?.data?.map((team) => team.id) || [];
}

function currentWorkspaceId(userPayload) {
  return userPayload?.data?.relationships?.current_team?.data?.id || null;
}

function inferredWorkspaceName(userPayload) {
  const explicitName =
    userPayload?.data?.attributes?.current_team_name ||
    userPayload?.data?.attributes?.team_name ||
    null;

  if (explicitName) {
    return explicitName;
  }

  const decorated = userPayload?.data?.attributes?.full_name_with_team || '';
  const match = decorated.match(/^\[(.+?)\]/);
  return match?.[1] || null;
}

function getSlackId(userPayload) {
  return userPayload?.data?.attributes?.slack_id || null;
}

function getRelationshipIds(entity, relationshipName) {
  return entity?.relationships?.[relationshipName]?.data?.map((item) => item.id) || [];
}

function getTeamAttributes(team) {
  return team?.attributes || {};
}

function countSlackCoverageSignals(attrs = {}) {
  const scalarSignals = [
    attrs.slack_channel_id,
    attrs.slack_channel_name,
    attrs.slack_channel,
    attrs.slack_group_id,
    attrs.slack_workspace_id
  ].filter((value) => value !== null && value !== undefined && value !== '');

  const arraySignals = [
    ...(Array.isArray(attrs.slack_channels) ? attrs.slack_channels : []),
    ...(Array.isArray(attrs.slack_aliases) ? attrs.slack_aliases : [])
  ];

  return scalarSignals.length + arraySignals.length;
}

function count(items) {
  return Array.isArray(items) ? items.length : 0;
}

function summarizeStage(doneCount, totalCount) {
  if (doneCount <= 0) {
    return 'needed';
  }

  if (doneCount >= totalCount) {
    return 'done';
  }

  return 'in-progress';
}

function teamCoverageLabel(doneCount, totalCount) {
  if (totalCount <= 0) {
    return 'needed';
  }

  if (doneCount <= 0) {
    return 'needed';
  }

  if (doneCount >= totalCount) {
    return 'done';
  }

  return 'in-progress';
}

export function detectOnboardingState({ userPayload, teamsPayload, schedulesPayload, escalationPoliciesPayload, authMode = 'stored-token' }) {
  const user = userPayload?.data?.attributes || {};
  const teams = teamsPayload?.data || [];
  const schedules = schedulesPayload?.data || [];
  const escalationPolicies = escalationPoliciesPayload?.data || [];

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const workspaceId = currentWorkspaceId(userPayload);
  const workspace = workspaceId ? teamsById.get(workspaceId) : null;
  const currentUserTeamIds = userTeamIds(userPayload);
  const currentUserTeams = currentUserTeamIds.map((id) => teamsById.get(id)).filter(Boolean);
  const teamsWithSchedules = teams.filter((team) => count(getRelationshipIds(team, 'schedules')) > 0);
  const teamsWithEscalationPolicies = teams.filter((team) => count(getRelationshipIds(team, 'escalation_policies')) > 0);
  const teamsWithSlack = teams.filter((team) => {
    const attrs = getTeamAttributes(team);
    return countSlackCoverageSignals(attrs) > 0;
  });
  const alertableTeams = teams.filter((team) => {
    const attrs = getTeamAttributes(team);
    const teamSchedules = getRelationshipIds(team, 'schedules');
    const teamPolicies = getRelationshipIds(team, 'escalation_policies');

    return teamSchedules.length > 0 || teamPolicies.length > 0 || Boolean(attrs.alert_source_count || attrs.alert_sources_count);
  });

  const hasTeams = teams.length > 0;
  const hasAnySchedules = schedules.length > 0;
  const hasAnyEscalationPolicies = escalationPolicies.length > 0;
  const hasSlack = Boolean(getSlackId(userPayload));
  const hasUserTeam = currentUserTeams.length > 0;
  const userHasSchedule = currentUserTeams.some((team) => getRelationshipIds(team, 'schedules').length > 0);
  const userHasEscalationPolicy = currentUserTeams.some((team) => getRelationshipIds(team, 'escalation_policies').length > 0);
  const userTeamsWithSlack = currentUserTeams.filter((team) => {
    const attrs = getTeamAttributes(team);
    return countSlackCoverageSignals(attrs) > 0;
  });
  const hasAnySlackConfigured = hasSlack || teamsWithSlack.length > 0 || userTeamsWithSlack.length > 0;
  const hasAnyAlertingReadyTeam = alertableTeams.length > 0;
  const hasAnyTeamMembership = currentUserTeams.length > 0;
  const teamCount = teams.length;
  const teamsWithSchedulesCount = teamsWithSchedules.length;
  const teamsWithEscalationPoliciesCount = teamsWithEscalationPolicies.length;
  const teamsWithSlackCount = teamsWithSlack.length;
  const teamsWithMembersCount = teams.filter((team) => count(getRelationshipIds(team, 'users')) > 0).length;

  const nextBestAction = !hasTeams
    ? 'create-team'
    : teamsWithMembersCount === 0
      ? 'invite-team-members'
      : teamsWithSchedulesCount === 0
        ? 'create-schedule'
        : teamsWithEscalationPoliciesCount === 0
          ? 'create-escalation-policy'
          : !hasAnyAlertingReadyTeam
            ? 'hook-up-monitor'
            : 'run-guided-setup';

  const steps = {
    createTeam: hasTeams ? 'done' : 'needed',
    inviteTeamMembers: teamsWithMembersCount > 0 ? 'done' : 'needed',
    createSchedule: teamsWithSchedulesCount > 0 ? 'done' : 'needed',
    createEscalationPolicy: teamsWithEscalationPoliciesCount > 0 ? 'done' : 'needed',
    hookUpMonitor: hasAnyAlertingReadyTeam ? 'done' : 'needed',
    testPage: hasAnyAlertingReadyTeam ? 'maybe-needed' : 'blocked',
    connectSlack: hasAnySlackConfigured ? 'maybe-needed' : 'needed',
    createTestIncident: 'maybe-needed'
  };

  const readiness = {
    workspaceSetup: summarizeStage(
      [hasTeams].filter(Boolean).length,
      1
    ),
    groupSetup: teamCoverageLabel(
      teamsWithMembersCount + teamsWithSchedulesCount + teamsWithEscalationPoliciesCount,
      teamCount * 3
    ),
    alertingSetup: summarizeStage(
      [hasAnyAlertingReadyTeam, hasAnySchedules, hasAnyEscalationPolicies].filter(Boolean).length,
      3
    ),
    incidentSetup: teamsWithSlackCount > 0 || hasSlack ? 'in-progress' : 'needed'
  };

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
      workspace: {
        id: workspace?.id || workspaceId || null,
        name: workspace?.attributes?.name || inferredWorkspaceName(userPayload),
        slug: workspace?.attributes?.slug || null
      },
      total: teams.length,
      hasTeams,
      hasAnyTeamMembership,
      all: teams.map((team) => ({
        id: team.id,
        name: team.attributes?.name,
        userIds: getRelationshipIds(team, 'users'),
        memberCount: count(team?.relationships?.users?.data),
        scheduleCount: count(team?.relationships?.schedules?.data),
        escalationPolicyCount: count(team?.relationships?.escalation_policies?.data)
      })),
      userTeams: currentUserTeams.map((team) => ({
        id: team.id,
        name: team.attributes?.name,
        scheduleCount: count(team?.relationships?.schedules?.data),
        escalationPolicyCount: count(team?.relationships?.escalation_policies?.data)
      })),
      hasAnySchedules,
      hasAnyEscalationPolicies,
      hasAnySlackConfigured,
      hasAnyAlertingReadyTeam,
      teamsWithMembers: teamsWithMembersCount,
      teamsWithSchedules: teamsWithSchedules.length,
      teamsWithEscalationPolicies: teamsWithEscalationPolicies.length,
      teamsWithSlack: teamsWithSlack.length
    },
    onboarding: {
      completed:
        nextBestAction === 'run-guided-setup' &&
        hasAnySchedules &&
        hasAnyEscalationPolicies &&
        hasAnyAlertingReadyTeam,
      nextBestAction,
      readiness,
      steps
    }
  };
}
