import { loadApiClient, extractUserId, isServiceAccount } from '../runtime.js';
import { getAuthSummary } from '../auth.js';
import {
  addTeamMembersByIdsAction,
  createAlertSourceAction,
  createEscalationPolicyAction,
  createScheduleAction,
  createTeamAction
} from './setup.js';
import { createTestAlertAction, createTestIncidentAction } from './testing.js';

function stepError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

// OAuth sessions can't write teams/schedules (they 403/404). Classify those so
// the summary can explain the sign-in lacks the capability, rather than
// surfacing a generic failure.
function isPermissionFailure(error) {
  const message = error?.message || '';
  return /\b40[134]\b/.test(message) || /Not found or unauthorized/i.test(message);
}

// Take a brand-new account from nothing to a visible alert + incident in one
// call. Auto-detects the sign-in's capabilities: an API key runs the whole
// chain, while a browser (OAuth) session does as much as it is allowed and the
// result explains what it could not write.
export async function runOneShotSetupAction({
  teamName = 'Incident Response',
  handoffTime = '09:00',
  memberIds = []
} = {}) {
  const api = await loadApiClient();
  const authSummary = await getAuthSummary();
  const authMode = authSummary?.mode || 'stored-token';
  const isOAuth = authMode === 'oauth';

  const steps = [];
  const blocked = [];
  const record = (step, status, { id = null, error = null } = {}) => {
    steps.push({ step, status, id, error });
    if (status === 'blocked') blocked.push(step);
  };

  // Run a guarded mutating step; permission failures become 'blocked' (the
  // chain continues) and everything else becomes 'failed'.
  const run = async (step, fn) => {
    try {
      const res = await fn();
      record(step, 'ok', { id: res?.data?.id ?? null });
      return res;
    } catch (error) {
      record(step, isPermissionFailure(error) ? 'blocked' : 'failed', { error: stepError(error) });
      return null;
    }
  };

  const data = {
    authMode,
    team: null,
    schedule: null,
    escalationPolicy: null,
    alertSource: null,
    alert: null,
    incident: null,
    steps
  };

  const currentUser = await api.getCurrentUser();
  const currentUserId = extractUserId(currentUser);
  const serviceAccount = isServiceAccount(currentUser);

  // The humans to put on the team + rotation. When none are chosen, fall back
  // to the current identity (even an API-key bot) so the rotation is never
  // empty and the demo shows someone on call.
  const chosenIds = (memberIds || []).map((id) => String(id)).filter(Boolean);
  const rotationIds = chosenIds.length ? chosenIds : (currentUserId ? [String(currentUserId)] : []);

  // 1. Team — reuse the signed-in user's existing team so a re-run doesn't pile
  // up duplicates. A user-less API key has none, so it creates one.
  let teamId = null;
  const existingTeamIds = currentUser?.data?.relationships?.teams?.data?.map((team) => team.id) || [];
  if (existingTeamIds.length) {
    teamId = existingTeamIds[0];
    record('team', 'reused', { id: teamId });
    data.team = { id: teamId, reused: true };
  } else {
    const teamResult = await run('team', () =>
      createTeamAction({ name: teamName, enableAlertsAndBroadcast: true })
    );
    if (teamResult) {
      teamId = teamResult.data.id;
      data.team = { id: teamId, name: teamResult.data.name, reused: false };
    }
  }

  // 2-4. Team-dependent scaffolding — only if a team is in place.
  if (teamId) {
    if (chosenIds.length) {
      await run('members', () => addTeamMembersByIdsAction({ teamId, userIds: chosenIds }));
    }

    const schedule = await run('schedule', () =>
      createScheduleAction({ teamId, name: `${teamName} On-Call`, handoffTime, memberIds: rotationIds })
    );
    if (schedule) data.schedule = { id: schedule.data.scheduleId };

    const escalation = await run('escalation-policy', () =>
      createEscalationPolicyAction({
        teamId,
        name: `${teamName} Escalation`,
        repeatCount: 1,
        createDefaultPath: Boolean(data.schedule)
      })
    );
    if (escalation) data.escalationPolicy = { id: escalation.data.id };

    const source = await run('alert-source', () =>
      createAlertSourceAction({ teamId, name: `${teamName} Webhook` })
    );
    if (source) data.alertSource = { id: source.data.id, webhookEndpoint: source.data.webhookEndpoint };
  }

  // 5. Test alert — the "see an alert" payoff. Works with or without a team.
  const groupIds = teamId ? [teamId] : [];
  const alert = await run('test-alert', () =>
    createTestAlertAction({
      summary: 'Rootly setup test alert',
      description: 'Fired by the Rootly setup wizard to confirm alerting works.',
      groupIds
    })
  );
  if (alert) data.alert = { id: alert.data.id };

  // 6. Test incident — the "see an incident" payoff. Attach a severity when the
  // workspace exposes one (some workspaces require it).
  let severityId = null;
  try {
    const severities = await api.listSeverities();
    severityId = severities?.data?.[0]?.id || null;
  } catch {
    // best-effort; the incident action tolerates a null severity.
  }
  const incident = await run('test-incident', () =>
    createTestIncidentAction({
      title: 'Rootly setup test incident',
      summary: 'Created by the Rootly setup wizard to show the incident flow.',
      groupIds,
      severityId
    })
  );
  if (incident) {
    data.incident = {
      id: incident.data.id,
      slackChannelName: incident.data.slackChannelName,
      slackChannelUrl: incident.data.slackChannelUrl
    };
  }

  const ok = Boolean(data.alert || data.incident);
  const note = blocked.length
    ? (isOAuth
        ? `This browser sign-in can't write ${blocked.join(', ')} yet. Sign in with an API token to complete those, or have Rootly grant the OAuth app workspace write scopes.`
        : `Could not complete: ${blocked.join(', ')}.`)
    : null;

  return {
    ok,
    summary: ok
      ? `One-shot setup ${data.incident ? 'created a test incident' : 'fired a test alert'}${
          teamId ? ` for ${data.team?.name || `team ${teamId}`}` : ''
        }.`
      : 'One-shot setup could not create an alert or incident with this sign-in.',
    data: { ...data, blocked, note }
  };
}
