import { loadOnboardingState } from './runtime.js';
import { getTeamsAction, getSchedulesAction, getEscalationPoliciesAction } from './actions/inspect.js';
import { getTeamMembersAction, getAddableTeamMembersAction, getDirectoryUsersAction, getStatusPageComponentsAction } from './actions/inspect.js';
import { getAuthSummary, getStoredToken, startOAuthLogin, storeToken, validateToken } from './auth.js';
import {
  createTeamAction,
  addTeamMembersAction,
  addTeamMembersByIdsAction,
  createScheduleAction,
  createEscalationPolicyAction,
  createAlertSourceAction,
  createStatusPageAction
} from './actions/setup.js';
import { createTestAlertAction, createTestIncidentAction } from './actions/testing.js';
import { runOneShotSetupAction } from './actions/oneshot.js';
import {
  startPhoneVerificationAction,
  confirmPhoneVerificationAction,
  resendPhoneVerificationAction,
  getCurrentUserPhoneAction
} from './actions/phone.js';
import { deleteToken } from './auth.js';
import { startWebHandoffAction, openUrl } from './actions/integrations.js';
import { previewMcpSetupAction, applyMcpSetupAction } from './actions/mcp.js';

function isWorkspaceAccessFailure(error) {
  const message = error?.message || String(error);
  return (
    (
      message.includes('/v1/teams') ||
      message.includes('/v1/schedules') ||
      message.includes('/v1/escalation_policies')
    ) &&
    (/\b401\b/.test(message) || /\b403\b/.test(message) || /Not found or unauthorized/i.test(message))
  );
}

export async function loadOnboardingStateInteractive() {
  try {
    return { ok: true, state: await loadOnboardingState() };
  } catch (error) {
    if (isWorkspaceAccessFailure(error)) {
      const authSummary = await getAuthSummary();
      return {
        ok: false,
        reason: 'auth-capability',
        isBrowserSession: authSummary?.mode === 'oauth',
        label: authSummary?.label || 'A stored Rootly sign-in was found.'
      };
    }
    return { ok: false, reason: 'error', message: error?.message || String(error) };
  }
}

export async function loadAuthContextForTui() {
  const envToken = process.env.ROOTLY_TOKEN?.trim() || null;
  const storedToken = await getStoredToken();
  const authSummary = await getAuthSummary();

  return {
    hasAuth: Boolean(envToken || storedToken),
    source: envToken ? 'env-token' : storedToken ? 'stored-token' : 'none',
    label: authSummary?.label || (envToken ? 'Using ROOTLY_TOKEN from environment' : storedToken ? 'Stored Rootly sign-in found' : 'No Rootly sign-in found')
  };
}

export async function authenticateWithApiTokenForTui(token) {
  const clean = String(token || '').trim();
  if (!clean) {
    return { ok: false, summary: 'API token is required.' };
  }

  const userPayload = await validateToken(clean);
  if (!userPayload) {
    return { ok: false, summary: 'Token did not validate against Rootly.' };
  }

  const stored = await storeToken(clean);
  return {
    ok: true,
    summary: 'API token validated.',
    data: {
      stored,
      userPayload
    }
  };
}

export async function authenticateWithBrowserForTui() {
  try {
    const result = await startOAuthLogin();
    return {
      ok: true,
      summary: 'Browser sign-in completed successfully.',
      data: result
    };
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'Browser sign-in failed.'
    };
  }
}

export async function createTeamForTui(input) {
  try {
    return await createTeamAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the team.'
    };
  }
}

export async function addTeamMembersForTui(input) {
  try {
    return await addTeamMembersAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not update team membership.'
    };
  }
}

export async function addTeamMembersByIdsForTui(input) {
  try {
    return await addTeamMembersByIdsAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not add team members.'
    };
  }
}

export async function loadAddableUsersForTui(teamId) {
  const result = await getAddableTeamMembersAction({ teamId });
  return result.ok ? result.data : null;
}

export async function loadDirectoryUsersForTui() {
  const result = await getDirectoryUsersAction();
  return result.ok ? result.data : null;
}

export async function createScheduleForTui(input) {
  try {
    return await createScheduleAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the schedule.'
    };
  }
}

export async function createEscalationPolicyForTui(input) {
  try {
    // Standalone flow: reuse an existing policy of the same name instead of
    // creating a duplicate on re-run. (The one-shot calls the action directly.)
    return await createEscalationPolicyAction({ reuseByName: true, ...input });
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the escalation policy.'
    };
  }
}

export async function createAlertSourceForTui(input) {
  try {
    // Standalone flow: reuse an existing source of the same name instead of
    // creating a duplicate on re-run. (The one-shot calls the action directly.)
    return await createAlertSourceAction({ reuseByName: true, ...input });
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the alert source.'
    };
  }
}

export async function loadStatusPageComponentsForTui() {
  try {
    const result = await getStatusPageComponentsAction();
    return result.ok ? result.data : { components: [] };
  } catch {
    return { components: [] };
  }
}

export async function createStatusPageForTui(input) {
  try {
    return await createStatusPageAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the status page.'
    };
  }
}

export async function createTestAlertForTui(input) {
  try {
    return await createTestAlertAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the test alert.'
    };
  }
}

export async function createTestIncidentForTui(input) {
  try {
    return await createTestIncidentAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not create the test incident.'
    };
  }
}

export async function deleteTokenForTui() {
  return await deleteToken();
}

export async function runOneShotSetupForTui(input, onStep) {
  try {
    return await runOneShotSetupAction(input, onStep);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'The wizard could not complete one-shot setup.'
    };
  }
}

export async function openExternalUrlForTui(url) {
  try {
    const opened = await openUrl(url);
    return { ok: true, opened: Boolean(opened) };
  } catch {
    return { ok: false, opened: false };
  }
}

export async function loadCurrentUserPhoneForTui() {
  try {
    const result = await getCurrentUserPhoneAction();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export async function startPhoneVerificationForTui(input) {
  try {
    return await startPhoneVerificationAction(input);
  } catch (error) {
    return { ok: false, summary: error?.message || 'Could not start phone verification.' };
  }
}

export async function confirmPhoneVerificationForTui(input) {
  try {
    return await confirmPhoneVerificationAction(input);
  } catch (error) {
    return { ok: false, summary: error?.message || 'Could not verify the phone number.' };
  }
}

export async function resendPhoneVerificationForTui(input) {
  try {
    return await resendPhoneVerificationAction(input);
  } catch (error) {
    return { ok: false, summary: error?.message || 'Could not resend the verification code.' };
  }
}

export async function startWebHandoffForTui(input) {
  try {
    return await startWebHandoffAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'Could not prepare the Rootly web handoff.'
    };
  }
}

export async function previewMcpForTui(input) {
  try {
    return await previewMcpSetupAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'Could not preview MCP setup.'
    };
  }
}

export async function applyMcpForTui(input) {
  try {
    return await applyMcpSetupAction(input);
  } catch (error) {
    return {
      ok: false,
      summary: error?.message || 'Could not apply MCP setup.'
    };
  }
}

export async function loadTeamsForTui() {
  const result = await getTeamsAction();
  return result.ok ? result.data : null;
}

export async function loadSchedulesForTui() {
  const result = await getSchedulesAction();
  return result.ok ? result.data : null;
}

export async function loadEscalationPoliciesForTui() {
  const result = await getEscalationPoliciesAction();
  return result.ok ? result.data : null;
}

export async function loadTeamMembersForTui(teamId) {
  const result = await getTeamMembersAction({ teamId });
  return result.ok ? result.data : null;
}
