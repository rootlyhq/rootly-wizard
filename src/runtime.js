import { getStoredToken } from './auth.js';
import { RootlyApiClient } from './rootly-api.js';
import { detectOnboardingState } from './detect-state.js';

export async function getActiveToken() {
  return process.env.ROOTLY_TOKEN?.trim() || (await getStoredToken()) || null;
}

export async function loadApiClient() {
  const token = await getActiveToken();
  if (!token) {
    throw new Error('Rootly auth is required first.');
  }

  return new RootlyApiClient(token);
}

export async function loadOnboardingState() {
  const token = await getActiveToken();
  if (!token) {
    return null;
  }

  const api = new RootlyApiClient(token);
  const [userPayload, teamsPayload, schedulesPayload, escalationPoliciesPayload] = await Promise.all([
    api.getCurrentUser(),
    api.listTeams(),
    api.listSchedules(),
    api.listEscalationPolicies()
  ]);

  return detectOnboardingState({
    userPayload,
    teamsPayload,
    schedulesPayload,
    escalationPoliciesPayload,
    authMode: process.env.ROOTLY_TOKEN?.trim() ? 'env-token' : 'stored-token'
  });
}

export function extractTeamId(group) {
  return group?.data?.id || group?.id || null;
}

export function extractUserId(user) {
  return user?.id || user?.data?.id || null;
}
