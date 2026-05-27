import {
  createAlertSourceAction,
  createEscalationPolicyAction,
  createScheduleAction,
  createTeamAction
} from './setup.js';

function stepError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

export async function runGuidedSetupAction({
  teamName = 'Rootly team',
  description = 'Created during Rootly setup',
  memberEmails = [],
  handoffTime = '09:00',
  repeatCount = 1,
  includeAlertSource = true,
  enableAlertsAndBroadcast = true
} = {}) {
  const steps = [];
  const data = {
    team: null,
    schedule: null,
    escalationPolicy: null,
    alertSource: null,
    matchedUsers: [],
    steps
  };

  // The team is the anchor for everything else, so a team failure is fatal.
  let teamResult;
  try {
    teamResult = await createTeamAction({ name: teamName, description, memberEmails, enableAlertsAndBroadcast });
    data.team = { id: teamResult.data.id, name: teamResult.data.name };
    data.matchedUsers = teamResult.data.matchedUsers;
    steps.push({ step: 'create-team', ok: true, id: teamResult.data.id, error: null });
  } catch (error) {
    steps.push({ step: 'create-team', ok: false, id: null, error: stepError(error) });
    return {
      ok: false,
      code: 'GUIDED_SETUP_FAILED',
      summary: 'Guided setup could not create the first team.',
      data
    };
  }

  const teamId = teamResult.data.id;
  const memberIds = teamResult.data.memberIds;

  try {
    const schedule = await createScheduleAction({ teamId, name: `${teamName} On-Call`, handoffTime, memberIds });
    data.schedule = { id: schedule.data.scheduleId };
    steps.push({ step: 'create-schedule', ok: true, id: schedule.data.scheduleId, error: null });
  } catch (error) {
    steps.push({ step: 'create-schedule', ok: false, id: null, error: stepError(error) });
  }

  try {
    const escalation = await createEscalationPolicyAction({
      teamId,
      name: `${teamName} Default Escalation`,
      repeatCount,
      createDefaultPath: Boolean(data.schedule)
    });
    data.escalationPolicy = { id: escalation.data.id, pathCreated: escalation.data.pathCreated };
    steps.push({ step: 'create-escalation-policy', ok: true, id: escalation.data.id, error: escalation.data.pathError });
  } catch (error) {
    steps.push({ step: 'create-escalation-policy', ok: false, id: null, error: stepError(error) });
  }

  if (includeAlertSource) {
    try {
      const source = await createAlertSourceAction({ teamId, name: `${teamName} Generic webhook` });
      data.alertSource = { id: source.data.id, webhookEndpoint: source.data.webhookEndpoint };
      steps.push({ step: 'create-alert-source', ok: true, id: source.data.id, error: null });
    } catch (error) {
      steps.push({ step: 'create-alert-source', ok: false, id: null, error: stepError(error) });
    }
  }

  return {
    ok: true,
    summary: `Ran guided setup for ${teamName}.`,
    data
  };
}
