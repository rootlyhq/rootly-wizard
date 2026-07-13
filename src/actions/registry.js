import {
  getEscalationPoliciesAction,
  getEnvironmentsAction,
  getIncidentTypesAction,
  getReadinessAction,
  getSchedulesAction,
  getServicesAction,
  getSeveritiesAction,
  getStatusAction,
  getTeamMembersAction,
  getTeamsAction,
  getUsersAction
} from './inspect.js';
import { getRecommendedNextStepAction } from './workflow.js';
import {
  addTeamMembersAction,
  createAlertSourceAction,
  createEscalationPolicyAction,
  createScheduleAction,
  createStatusPageAction,
  createTeamAction
} from './setup.js';
import { createTestAlertAction, createTestIncidentAction } from './testing.js';
import { startWebHandoffAction } from './integrations.js';
import { applyMcpSetupAction, previewMcpSetupAction } from './mcp.js';
import { runGuidedSetupAction } from './guided.js';
import { runOneShotSetupAction } from './oneshot.js';

// Each action declares whether it mutates Rootly and a lightweight input schema
// (field -> { type, required?, default?, description }). The schema powers
// `action describe`, boundary input validation, and dry-run previews.
export const ACTIONS = {
  'get-status': {
    mutates: false,
    description: 'Workspace status summary with the recommended next step.',
    input: {},
    handler: getStatusAction
  },
  'get-readiness': {
    mutates: false,
    description: 'Full onboarding readiness report (steps, readiness, teams).',
    input: {},
    handler: getReadinessAction
  },
  'get-recommended-next-step': {
    mutates: false,
    description: 'The single next best setup action and a human label.',
    input: {},
    handler: getRecommendedNextStepAction
  },
  'list-teams': {
    mutates: false,
    description: 'Teams with member/schedule/escalation coverage counts.',
    input: {},
    handler: getTeamsAction
  },
  'list-schedules': {
    mutates: false,
    description: 'On-call schedules with coverage summary.',
    input: {},
    handler: getSchedulesAction
  },
  'list-escalation-policies': {
    mutates: false,
    description: 'Escalation policies with team/repeat summary.',
    input: {},
    handler: getEscalationPoliciesAction
  },
  'list-services': {
    mutates: false,
    description: 'Services as {id, name} for resolving service IDs.',
    input: {},
    handler: getServicesAction
  },
  'list-severities': {
    mutates: false,
    description: 'Severities as {id, name} for resolving severity IDs.',
    input: {},
    handler: getSeveritiesAction
  },
  'list-environments': {
    mutates: false,
    description: 'Environments as {id, name} for resolving environment IDs.',
    input: {},
    handler: getEnvironmentsAction
  },
  'list-incident-types': {
    mutates: false,
    description: 'Incident types as {id, name} for resolving incident type IDs.',
    input: {},
    handler: getIncidentTypesAction
  },
  'list-users': {
    mutates: false,
    description: 'Users as {id, email, name} (first page) for resolving members.',
    input: {},
    handler: getUsersAction
  },
  'list-team-members': {
    mutates: false,
    description: 'Members ({id, email, name}) of a specific team.',
    input: {
      teamId: { type: 'string', required: true, description: 'Team ID.' }
    },
    handler: getTeamMembersAction
  },
  'create-team': {
    mutates: true,
    description: 'Create a team, optionally inviting members by email.',
    input: {
      name: { type: 'string', required: true, description: 'Team name.' },
      description: { type: 'string', description: 'Team description.' },
      memberEmails: { type: 'array', items: 'string', description: 'Emails to resolve and add as members.' },
      enableAlertsAndBroadcast: { type: 'boolean', description: 'Enable alert emails and incident broadcast.' }
    },
    handler: createTeamAction
  },
  'add-team-members': {
    mutates: true,
    description: 'Add members to an existing team by email.',
    input: {
      teamId: { type: 'string', required: true, description: 'Team ID.' },
      emails: { type: 'array', items: 'string', required: true, description: 'Emails to add.' }
    },
    handler: addTeamMembersAction
  },
  'create-schedule': {
    mutates: true,
    description: 'Create an on-call schedule with a daily rotation.',
    input: {
      teamId: { type: 'string', required: true, description: 'Owning team ID.' },
      name: { type: 'string', required: true, description: 'Schedule name.' },
      handoffTime: { type: 'string', default: '09:00', description: 'Daily handoff time (HH:MM).' },
      memberIds: { type: 'array', items: 'number', description: 'User IDs for the rotation.' }
    },
    handler: createScheduleAction
  },
  'create-escalation-policy': {
    mutates: true,
    description: 'Create an escalation policy, optionally with a default path.',
    input: {
      teamId: { type: 'string', required: true, description: 'Owning team ID.' },
      name: { type: 'string', required: true, description: 'Policy name.' },
      repeatCount: { type: 'integer', default: 1, description: 'Times the policy repeats.' },
      createDefaultPath: { type: 'boolean', description: 'Also create a default escalation path.' }
    },
    handler: createEscalationPolicyAction
  },
  'create-status-page': {
    mutates: true,
    description: 'Create a status page (internal by default).',
    input: {
      title: { type: 'string', required: true, description: 'Status page title.' },
      description: { type: 'string', description: 'Internal description shown to Rootly admins. Defaults to a wizard note.' },
      isPublic: { type: 'boolean', description: 'Make it public (default false = internal).' }
    },
    handler: createStatusPageAction
  },
  'create-alert-source': {
    mutates: true,
    description: 'Create a generic webhook alert source.',
    input: {
      teamId: { type: 'string', description: 'Owning team ID.' },
      name: { type: 'string', default: 'Generic webhook', description: 'Alert source name.' },
      sourceType: { type: 'string', default: 'generic_webhook', description: 'Rootly alert source type.' }
    },
    handler: createAlertSourceAction
  },
  'create-test-alert': {
    mutates: true,
    description: 'Create a test alert to verify paging.',
    input: {
      summary: { type: 'string', required: true, description: 'Alert summary.' },
      description: { type: 'string', description: 'Alert description.' },
      groupIds: { type: 'array', items: 'string', description: 'Team/group IDs.' },
      serviceIds: { type: 'array', items: 'string', description: 'Service IDs.' },
      environmentIds: { type: 'array', items: 'string', description: 'Environment IDs.' }
    },
    handler: createTestAlertAction
  },
  'create-test-incident': {
    mutates: true,
    description: 'Create a test incident.',
    input: {
      title: { type: 'string', required: true, description: 'Incident title.' },
      summary: { type: 'string', description: 'Incident summary.' },
      groupIds: { type: 'array', items: 'string', description: 'Team/group IDs.' },
      serviceIds: { type: 'array', items: 'string', description: 'Service IDs.' },
      environmentIds: { type: 'array', items: 'string', description: 'Environment IDs.' },
      incidentTypeIds: { type: 'array', items: 'string', description: 'Incident type IDs.' },
      severityId: { type: 'string', description: 'Severity ID.' },
      isPrivate: { type: 'boolean', description: 'Create as a private incident.' }
    },
    handler: createTestIncidentAction
  },
  'run-guided-setup': {
    mutates: true,
    description: 'Create team + schedule + escalation policy + webhook in one call.',
    input: {
      teamName: { type: 'string', default: 'Rootly team', description: 'Team name.' },
      memberEmails: { type: 'array', items: 'string', description: 'Emails to add as members.' },
      handoffTime: { type: 'string', default: '09:00', description: 'Daily handoff time (HH:MM).' },
      repeatCount: { type: 'integer', default: 1, description: 'Escalation policy repeat count.' },
      includeAlertSource: { type: 'boolean', default: true, description: 'Also create a generic webhook source.' }
    },
    handler: runGuidedSetupAction
  },
  'one-shot-setup': {
    mutates: true,
    description: 'End-to-end setup: team + schedule + escalation + alert source, then fire a test alert and incident. Auto-detects sign-in capability.',
    input: {
      teamName: { type: 'string', default: 'Incident Response', description: 'Team name to create or reuse.' },
      handoffTime: { type: 'string', default: '09:00', description: 'Daily on-call handoff time (HH:MM).' },
      memberIds: { type: 'array', items: 'string', description: 'User IDs to add as team members and put on the rotation. Defaults to the current identity.' }
    },
    handler: runOneShotSetupAction
  },
  'start-web-handoff': {
    mutates: false,
    description: 'Return the Rootly web URL for an integration handoff (e.g. Slack).',
    input: {
      kind: { type: 'string', required: true, description: 'Integration name (Slack, Datadog, ...).' },
      open: { type: 'boolean', description: 'Attempt to open the URL in a browser.' }
    },
    handler: startWebHandoffAction
  },
  'preview-mcp-setup': {
    mutates: false,
    description: 'Preview MCP client config without writing files.',
    input: {
      clients: { type: 'array', items: 'string', description: 'Clients (Cursor, Claude Code, ...).' },
      auth: { type: 'string', description: 'Auth mode label.' },
      claudeCodeScope: { type: 'string', description: '"project" (default, writes .mcp.json in cwd) or "user" (global, uses `claude mcp add --scope user`).' }
    },
    handler: previewMcpSetupAction
  },
  'apply-mcp-setup': {
    mutates: true,
    description: 'Write MCP client config files for the selected clients.',
    input: {
      clients: { type: 'array', items: 'string', required: true, description: 'Clients to configure.' },
      auth: { type: 'string', description: 'Auth mode label.' },
      claudeCodeScope: { type: 'string', description: '"project" (default, writes .mcp.json in cwd) or "user" (global, uses `claude mcp add --scope user`).' }
    },
    handler: applyMcpSetupAction
  }
};

export function buildActionCatalog() {
  return Object.entries(ACTIONS).map(([name, entry]) => ({
    name,
    mutates: entry.mutates,
    description: entry.description
  }));
}

export function describeAction(name) {
  const entry = ACTIONS[name];
  if (!entry) {
    return null;
  }

  return {
    name,
    mutates: entry.mutates,
    supportsDryRun: entry.mutates,
    description: entry.description,
    input: entry.input
  };
}

// Convert the registry into function-calling tool definitions (JSON Schema
// input_schema), compatible with Anthropic/OpenAI tool formats. Tool name ==
// action name, so a tool call maps directly to `action <name> <args>`.
export function buildToolSpecs() {
  return Object.entries(ACTIONS).map(([name, entry]) => {
    const properties = {};
    const required = [];

    for (const [field, spec] of Object.entries(entry.input)) {
      const property = { type: spec.type === 'integer' ? 'integer' : spec.type, description: spec.description };
      if (spec.type === 'array') {
        property.items = { type: spec.items || 'string' };
      }
      if (spec.default !== undefined) {
        property.default = spec.default;
      }
      properties[field] = property;
      if (spec.required) {
        required.push(field);
      }
    }

    if (entry.mutates) {
      properties.dryRun = { type: 'boolean', description: 'Preview the action without executing it.' };
    }

    return {
      name,
      description: entry.description,
      input_schema: { type: 'object', properties, required }
    };
  });
}

export function validateInput(schema, payload) {
  for (const [field, spec] of Object.entries(schema || {})) {
    const value = payload?.[field];
    const present = value !== undefined && value !== null && value !== '';

    if (spec.required && !present) {
      return { field, message: `${field} is required` };
    }

    if (present && spec.type) {
      const matches = spec.type === 'array'
        ? Array.isArray(value)
        : spec.type === 'integer'
          ? Number.isInteger(value)
          : typeof value === spec.type;

      if (!matches) {
        return { field, message: `${field} must be of type ${spec.type}` };
      }
    }
  }

  return null;
}

export function toStructuredError(actionName, error) {
  const raw = (error?.message || 'Action failed.').replace(/^Rootly API request failed for [^:]+:\s*/, '');

  let status = null;
  let detail = raw;
  let field = null;

  const withBody = raw.match(/^(\d{3})\s*-\s*(\{[\s\S]*\})$/);
  if (withBody) {
    status = Number(withBody[1]);
    try {
      const body = JSON.parse(withBody[2]);
      const first = Array.isArray(body?.errors) ? body.errors[0] : null;
      detail = first?.detail || first?.title || raw;
      const pointer = first?.source?.pointer || '';
      const pointerMatch = pointer.match(/\/([^/]+)$/);
      field = pointerMatch ? pointerMatch[1] : null;
    } catch {
      // keep raw detail
    }
  } else {
    const statusOnly = raw.match(/^(\d{3})\b/);
    if (statusOnly) {
      status = Number(statusOnly[1]);
    }
  }

  const code = status === 401 ? 'UNAUTHORIZED'
    : status === 403 ? 'FORBIDDEN'
      : status === 404 ? 'NOT_FOUND'
        : status === 422 ? 'VALIDATION'
          : (error?.name === 'TimeoutError' || /timed out|aborted/i.test(raw)) ? 'TIMEOUT'
            : 'ACTION_FAILED';

  return {
    ok: false,
    code,
    summary: `Action ${actionName} failed.`,
    error: detail,
    field,
    status,
    retryable: code === 'TIMEOUT' || (typeof status === 'number' && status >= 500),
    data: null
  };
}
