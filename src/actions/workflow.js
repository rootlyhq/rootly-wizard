import { loadOnboardingState } from '../runtime.js';

export function humanizeAction(action) {
  switch (action) {
    case 'run-guided-setup':
      return 'Review remaining setup';
    case 'create-team':
      return 'Create a team';
    case 'invite-team-members':
      return 'Add team members';
    case 'create-schedule':
      return 'Create a schedule';
    case 'create-escalation-policy':
      return 'Create an escalation policy';
    case 'hook-up-monitor':
      return 'Hook up a monitor (Datadog, Grafana, PagerDuty)';
    case 'connect-slack':
      return 'Connect Slack in Rootly';
    case 'create-test-incident':
      return 'Create a test incident';
    default:
      return 'Continue setup';
  }
}

export async function getRecommendedNextStepAction() {
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
    summary: 'Computed next recommended setup step.',
    data: {
      nextBestAction: state.onboarding.nextBestAction,
      label: humanizeAction(state.onboarding.nextBestAction),
      readiness: state.onboarding.readiness,
      steps: state.onboarding.steps
    }
  };
}
