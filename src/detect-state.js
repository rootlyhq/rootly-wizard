function toIdSet(items = []) {
  return new Set(items.map((item) => item.id));
}

function userTeamIds(userPayload) {
  return userPayload?.data?.relationships?.teams?.data?.map((team) => team.id) || [];
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

export function detectOnboardingState({ userPayload, teamsPayload, schedulesPayload, escalationPoliciesPayload, authMode = 'stored-token' }) {
  const user = userPayload?.data?.attributes || {};
  const teams = teamsPayload?.data || [];
  const schedules = schedulesPayload?.data || [];
  const escalationPolicies = escalationPoliciesPayload?.data || [];

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const currentUserTeamIds = userTeamIds(userPayload);
  const currentUserTeams = currentUserTeamIds.map((id) => teamsById.get(id)).filter(Boolean);
  const teamsWithSchedules = teams.filter((team) => count(getRelationshipIds(team, 'schedules')) > 0);
  const teamsWithEscalationPolicies = teams.filter((team) => count(getRelationshipIds(team, 'escalation_policies')) > 0);
  const teamsWithSlack = teams.filter((team) => {
    const attrs = getTeamAttributes(team);
    const slackSignals = [
      attrs.slack_channel_id,
      attrs.slack_channel_name,
      attrs.slack_channel,
      attrs.slack_channels_count,
      attrs.slack_group_id,
      attrs.slack_workspace_id
    ];

    return slackSignals.some((value) => value !== null && value !== undefined && value !== '');
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
    return Boolean(attrs.slack_channel_id || attrs.slack_channel_name || attrs.slack_channel || attrs.slack_group_id);
  });
  const hasAnySlackConfigured = hasSlack || teamsWithSlack.length > 0 || userTeamsWithSlack.length > 0;
  const hasAnyAlertingReadyTeam = alertableTeams.length > 0;
  const hasAnyTeamMembership = currentUserTeams.length > 0;

  const nextBestAction = !hasTeams
    ? 'create-team'
    : !hasUserTeam
      ? 'invite-team-members'
      : !userHasSchedule
        ? 'create-schedule'
        : !userHasEscalationPolicy
          ? 'create-escalation-policy'
          : !hasAnyAlertingReadyTeam
            ? 'hook-up-monitor'
            : !hasAnySlackConfigured
              ? 'connect-slack'
              : 'create-test-incident';

  const steps = {
    createTeam: hasTeams ? 'maybe-needed' : 'needed',
    inviteTeamMembers: hasUserTeam ? 'done' : 'needed',
    createSchedule: userHasSchedule ? 'done' : 'needed',
    createEscalationPolicy: userHasEscalationPolicy ? 'done' : 'needed',
    hookUpMonitor: hasAnyAlertingReadyTeam ? 'done' : 'needed',
    testPage: hasAnyAlertingReadyTeam ? 'maybe-needed' : 'blocked',
    connectSlack: hasAnySlackConfigured ? 'done' : 'needed',
    createTestIncident: hasAnySlackConfigured ? 'maybe-needed' : 'blocked'
  };

  const readiness = {
    workspaceSetup: summarizeStage(
      [hasTeams, hasAnyTeamMembership].filter(Boolean).length,
      2
    ),
    groupSetup: summarizeStage(
      [hasUserTeam, userHasSchedule, userHasEscalationPolicy].filter(Boolean).length,
      3
    ),
    alertingSetup: summarizeStage(
      [hasAnyAlertingReadyTeam, hasAnySchedules, hasAnyEscalationPolicies].filter(Boolean).length,
      3
    ),
    incidentSetup: summarizeStage(
      [hasAnySlackConfigured, hasAnySlackConfigured && nextBestAction === 'create-test-incident'].filter(Boolean).length,
      2
    )
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
      total: teams.length,
      hasTeams,
      hasAnyTeamMembership,
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
      teamsWithSchedules: teamsWithSchedules.length,
      teamsWithEscalationPolicies: teamsWithEscalationPolicies.length,
      teamsWithSlack: teamsWithSlack.length
    },
    onboarding: {
      completed:
        nextBestAction === 'create-test-incident' &&
        hasAnySlackConfigured &&
        hasAnySchedules &&
        hasAnyEscalationPolicies &&
        hasAnyAlertingReadyTeam &&
        hasAnyTeamMembership,
      nextBestAction,
      readiness,
      steps
    }
  };
}
