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
//
// `onStep` (optional) is awaited before and after each step with
// { step, status: 'running' | 'ok' | 'reused' | 'blocked' | 'failed' }, so a UI
// can show live progress (and pace it).
export async function runOneShotSetupAction({
  teamName = 'Incident Response',
  handoffTime = '09:00',
  memberIds = []
} = {}, onStep) {
  const api = await loadApiClient();
  const authSummary = await getAuthSummary();
  const authMode = authSummary?.mode || 'stored-token';
  const isOAuth = authMode === 'oauth';

  const steps = [];
  const blocked = [];
  const emit = (step, status, extra = {}) => onStep?.({ step, status, ...extra });
  const record = (step, status, { id = null, error = null } = {}) => {
    steps.push({ step, status, id, error });
    if (status === 'blocked') blocked.push(step);
  };

  // Run a guarded mutating step; permission failures become 'blocked' (the
  // chain continues) and everything else becomes 'failed'. Progress is emitted
  // around each attempt.
  const run = async (step, fn) => {
    await emit(step, 'running');
    try {
      const res = await fn();
      record(step, 'ok', { id: res?.data?.id ?? null });
      await emit(step, 'ok');
      return res;
    } catch (error) {
      const status = isPermissionFailure(error) ? 'blocked' : 'failed';
      const message = stepError(error);
      record(step, status, { error: message });
      await emit(step, status, { error: message });
      return null;
    }
  };

  const data = {
    authMode,
    team: null,
    members: [],
    rotation: [],
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
  data.members = chosenIds;
  data.rotation = rotationIds;

  // 1. Team — reuse the signed-in user's existing team so a re-run doesn't pile
  // up duplicates. A user-less API key has none, so it creates one.
  let teamId = null;
  const existingTeamIds = currentUser?.data?.relationships?.teams?.data?.map((team) => team.id) || [];
  if (existingTeamIds.length) {
    await emit('team', 'running');
    teamId = existingTeamIds[0];
    let reusedName = null;
    try {
      const teamPayload = await api.getTeam(teamId);
      reusedName = teamPayload?.data?.attributes?.name || null;
    } catch {
      // best-effort; the name is only for display.
    }
    record('team', 'reused', { id: teamId });
    data.team = { id: teamId, name: reusedName, reused: true };
    await emit('team', 'reused');
  } else {
    const teamResult = await run('team', () =>
      createTeamAction({ name: teamName, enableAlertsAndBroadcast: true })
    );
    if (teamResult) {
      teamId = teamResult.data.id;
      data.team = { id: teamId, name: teamResult.data.name, reused: false };
    }
  }

  const teamLabel = data.team?.name || teamName;

  // 2-4. Team-dependent scaffolding — only if a team is in place.
  if (teamId) {
    if (chosenIds.length) {
      await run('members', () => addTeamMembersByIdsAction({ teamId, userIds: chosenIds }));
    }

    const schedule = await run('schedule', () =>
      createScheduleAction({ teamId, name: `${teamLabel} On-Call`, handoffTime, memberIds: rotationIds })
    );
    if (schedule) {
      data.schedule = {
        id: schedule.data.scheduleId,
        name: `${teamLabel} On-Call`,
        handoffTime,
        rotationCreated: schedule.data.rotationCreated
      };
    }

    const escalation = await run('escalation-policy', () =>
      createEscalationPolicyAction({
        teamId,
        name: `${teamLabel} Escalation`,
        repeatCount: 1,
        createDefaultPath: Boolean(data.schedule)
      })
    );
    if (escalation) data.escalationPolicy = { id: escalation.data.id, name: `${teamLabel} Escalation` };

    const source = await run('alert-source', () =>
      createAlertSourceAction({ teamId, name: `${teamLabel} Webhook` })
    );
    if (source) {
      data.alertSource = {
        id: source.data.id,
        name: `${teamLabel} Webhook`,
        webhookEndpoint: source.data.webhookEndpoint
      };
    }
  }

  // 5. Test alert — the "see an alert" payoff. Works with or without a team.
  const groupIds = teamId ? [teamId] : [];
  const alertSummary = 'Rootly setup test alert';
  const alert = await run('test-alert', () =>
    createTestAlertAction({
      summary: alertSummary,
      description: 'Fired by the Rootly setup wizard to confirm alerting works.',
      groupIds
    })
  );
  if (alert) data.alert = { id: alert.data.id, summary: alertSummary };

  // 6. Test incident — the "see an incident" payoff. Attach a severity when the
  // workspace exposes one (some workspaces require it).
  let severityId = null;
  try {
    const severities = await api.listSeverities();
    severityId = severities?.data?.[0]?.id || null;
  } catch {
    // best-effort; the incident action tolerates a null severity.
  }
  const incidentTitle = 'Rootly setup test incident';
  const incident = await run('test-incident', () =>
    createTestIncidentAction({
      title: incidentTitle,
      summary: 'Created by the Rootly setup wizard to show the incident flow.',
      groupIds,
      severityId
    })
  );
  if (incident) {
    data.incident = {
      id: incident.data.id,
      title: incidentTitle,
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
      ? `${data.incident ? 'Created a test incident' : 'Fired a test alert'}${
          teamId ? ` for ${teamLabel}` : ''
        }.`
      : 'Could not create an alert or incident with this sign-in.',
    data: { ...data, blocked, note }
  };
}
